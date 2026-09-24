# Mac mini pilot runbook

The pilot runs PlsPay on one Mac mini: Next.js, a local Supabase (Postgres plus Auth), and Redis. The public reaches it only through a Cloudflare Tunnel. Nothing else on the machine is reachable from outside.

Sections:
1. Prepare the machine
2. Local Supabase: install and set up
3. App, tunnel, backups, CI runner
4. Security checklist
5. Operations
6. Moving to Supabase cloud

---

## 1. Prepare the machine

1. Create a standard (not admin) macOS user called `plspay`. Everything below runs as this user unless marked admin.
2. Turn on FileVault.
3. In System Settings, Energy: turn off sleep, turn on "Start up automatically after a power failure". A UPS is strongly recommended.
4. Install Homebrew (admin, once), then the tools:
   ```bash
   brew install node@20 cloudflared redis postgresql@16 gnupg rclone
   ```
   `postgresql@16` is only for `pg_dump` and `psql`. The database itself runs inside Supabase.

**Reboots:** FileVault blocks auto-login, so after any restart someone must log in as `plspay` once. Everything then starts on its own (section 2.8 and section 3). For planned restarts use `sudo fdesetup authrestart`, which skips the unlock screen once.

---

## 2. Local Supabase: install and set up

Local Supabase is the full Supabase stack (Postgres, Auth, REST API) running in Docker containers on the Mac mini. Same database, same access rules, same migrations as the cloud version.

### 2.1 Install a Docker runtime

Supabase runs in containers, so it needs Docker. OrbStack is lighter and faster on Apple silicon than Docker Desktop.

```bash
brew install --cask orbstack
open -a OrbStack
```

In OrbStack settings:
1. Turn on "Start at login".
2. Set memory to at least 4 GB.

Check it works:
```bash
docker run --rm hello-world
```

### 2.2 Install the Supabase CLI

```bash
brew install supabase/tap/supabase
supabase --version
```

Install the same version as `docs/SPEC.md` section 9 (2.117.0). The repo also carries it as a dev dependency, so `npx supabase ...` inside the app directory always matches CI.

### 2.3 Get the code and create the config

```bash
cd /Users/plspay
git clone <repo-url> plspay
cd plspay
npm ci               # also installs the pinned Supabase CLI (npx supabase)
```

`supabase/config.toml` is committed and already has the right services disabled. Do **not** run `supabase init` again. Make these pilot-specific edits on the Mac mini only (keep them out of git, or put them on a `pilot` branch):
1. **Delete the whole `[auth.sms.test_otp]` block.** It lets anyone sign in to the numbers listed there with code 123456.
2. Set `[auth] site_url` to the real public URL, e.g. `https://plspay.sg`.
3. Set `[auth.rate_limit] sms_sent = 30` (the committed value is 300 for CI).
4. Confirm `[studio]`, `[analytics]`, `[inbucket]`, `[storage]`, `[realtime]` and `[edge_runtime]` are `enabled = false`.

### 2.4 Add Twilio for real login codes

The config reads Twilio credentials from environment variables, so they never sit in git.

Create `supabase/.env` (chmod 600, git-ignored):
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_MESSAGE_SERVICE_SID=MG...
TWILIO_AUTH_TOKEN=...
```

Check `.gitignore` contains `supabase/.env` and `.env.local`.

In the Twilio console:
1. Create a Messaging Service with a sender that can reach Singapore numbers.
2. Set a usage alert, e.g. US$20 a month. OTP endpoints get abused for SMS pumping.

### 2.5 Start Supabase

```bash
cd /Users/plspay/plspay
supabase start
```

1. The first run downloads a few GB of images and takes several minutes. Later starts take seconds.
2. `-x` skips services PlsPay does not use. Fewer containers means less to secure and less memory.
3. When it finishes, it prints the URLs and keys. Unused services are already disabled in `config.toml`, so no `-x` flags are needed.

What runs and where:

| Service | Port | Reachable from |
|---|---|---|
| API gateway (REST, Auth) | 54321 | Mac mini only |
| Postgres | 54322 | Mac mini only |

Both must stay local. The keys local Supabase uses are publicly known defaults, so anyone who can reach port 54321 could act as an admin. Section 3.2 and `scripts/check-exposure.sh` enforce this.

### 2.6 Apply the database schema

```bash
supabase migration up --local
```

This applies every file in `supabase/migrations/` that has not run yet: tables, access rules, payer lookup functions, and the 90-day cleanup job.

Check it worked:
```bash
supabase migration list --local        # every migration shows as applied
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select tablename, rowsecurity from pg_tables where schemaname='public';"
```
All three tables (`profiles`, `collections`, `payers`) must show `rowsecurity = t`.

### 2.7 Prove the security rules on this database

```bash
supabase test db
```

This runs the tests in `supabase/tests/` against the pilot database. Each test runs inside a transaction and rolls back, so nothing is left behind. All must pass before you invite anyone.

### 2.8 Connect the app

```bash
scripts/supabase-env.sh > .env.local && chmod 600 .env.local
```

Then append the pilot-only values. The file ends up as:
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from the script>
SUPABASE_SERVICE_ROLE_KEY=<from the script>
REDIS_URL=redis://127.0.0.1:6379
APP_URL=https://plspay.sg
BACKUP_PASSPHRASE=<long random, also stored in your password manager>
BACKUP_REMOTE=<rclone remote, e.g. gdrive:plspay-backups>
```

Never prefix any of these with `NEXT_PUBLIC_`. That would ship them to every browser.

### 2.9 Start Supabase automatically after login

Supabase containers do not restart on their own after a reboot. Install the launch agent:

```bash
cp ops/com.plspay.supabase.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.plspay.supabase.plist
```

It waits for Docker, then runs `supabase start`. Log: `/Users/plspay/logs/supabase.log`.

### 2.10 Commands that can destroy data

| Command | What it does | On the pilot |
|---|---|---|
| `supabase stop` | Stops containers, keeps data | Safe |
| `supabase start` | Starts containers with existing data | Safe |
| `supabase migration up --local` | Applies new migrations only | Safe, run by deploy |
| `supabase db reset` | **Wipes the database** and rebuilds from migrations plus seed | **Never.** Laptop and CI only |
| `supabase stop --no-backup` | **Deletes the data volume** | **Never** |
| `docker volume prune`, `docker system prune --volumes` | **Can delete the database volume** | **Never** |

Before upgrading the Supabase CLI or OrbStack, run `scripts/backup.sh pre-upgrade`. New CLI versions can pull new Postgres images.

### 2.11 Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot connect to the Docker daemon` | OrbStack not running: `open -a OrbStack`, wait 20 seconds |
| `port 54322 already in use` | Another Postgres is running: `brew services stop postgresql@16` |
| Login codes not arriving | Check `supabase/.env` values, then `supabase stop && supabase start` to reload config. Check Twilio logs |
| Migration fails halfway | Nothing partial is kept (each migration is one transaction). Fix the file on a branch, merge, redeploy. Never edit a migration that has already run |
| Disk filling up | `docker system df`. Remove old images only: `docker image prune` (no `--volumes`) |

---

## 3. App, tunnel, backups, CI runner

### 3.1 Redis on loopback only
In `$(brew --prefix)/etc/redis.conf` set `bind 127.0.0.1` and `protected-mode yes`, then:
```bash
brew services start redis
```

### 3.2 Firewall backstop
Docker can publish container ports on all network interfaces. `ops/pf-plspay.conf` blocks the LAN from ports 3000, 54321 to 54324 and 6379 regardless. Install it (admin) using the instructions inside the file.

### 3.3 App process
```bash
npm ci && npm run build
npx pm2 start ecosystem.config.cjs
npx pm2 save
npx pm2 startup      # run the command it prints
```
The app listens on 127.0.0.1:3000 only.

### 3.4 Tunnel
```bash
cloudflared tunnel login
cloudflared tunnel create plspay
cloudflared tunnel route dns plspay plspay.sg
cp ops/cloudflared.yml ~/.cloudflared/config.yml
sudo cloudflared service install
```
Only the app is routed. Every other path returns 404.

### 3.5 Backups
```bash
mkdir -p /Users/plspay/backups /Users/plspay/logs
rclone config                       # set up the off-machine remote
scripts/backup.sh manual            # confirm a file appears locally and in the remote
cp ops/com.plspay.backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.plspay.backup.plist
```

### 3.6 CI runner
1. In GitHub, go to Settings, Actions, Runners and add a self-hosted macOS runner on the Mac mini as `plspay`, with the label `mac-mini`. Install it as a service.
2. Add repo variable `PILOT_URL=https://plspay.sg`.
3. Create the `pilot` environment.

### 3.7 Final check
1. `scripts/check-exposure.sh` passes.
2. From a phone on mobile data, the site loads.
3. `https://plspay.sg/rest/v1/payers` returns 404.
4. Sign in with your own number and receive a real code.

---

## 4. Security checklist (monthly)

| Check | How |
|---|---|
| Only the tunnel is public | `scripts/check-exposure.sh` passes; no router port forwards to the Mac mini |
| Supabase API unreachable from outside | `/rest/v1/*` via the public URL returns 404 |
| Test login code disabled | No `test_otp` block in `supabase/config.toml` |
| Access rules intact | `supabase test db` passes |
| Secrets not in git | `.env.local` and `supabase/.env` are chmod 600 and git-ignored; gitleaks green |
| Backups restorable | Restore last night's backup into a scratch database (section 5) |
| OS and tools patched | macOS updates and `brew upgrade` monthly, after a backup, then redeploy |
| Twilio spend | Usage alert set, last month's spend looks normal |

---

## 5. Operations

- **Deploy:** merge to `main`. The runner backs up, migrates, builds, restarts, checks exposure and smoke-tests.
- **App logs:** `npx pm2 logs plspay`. Logs must never contain tokens, names or phone numbers.
- **Database logs:** `docker logs supabase_db_plspay --tail 100` (container name from `docker ps`).
- **Restore a backup:**
  ```bash
  gpg --batch --passphrase "$BACKUP_PASSPHRASE" -d FILE.sql.gz.gpg | gunzip > restore.sql
  createdb -h 127.0.0.1 -p 54322 -U postgres scratch
  psql -h 127.0.0.1 -p 54322 -U postgres -d scratch -f restore.sql
  ```
- **Mac mini down:** payer links stop working until it's back. QRs payers already saved still work, because the money goes bank to bank.

---

## 6. Moving to Supabase cloud (phase 2)

Same migrations, same code. Only env vars change.

1. Create the Supabase cloud project in the Singapore region. Configure phone auth with the same Twilio credentials.
2. `supabase link --project-ref <ref> && supabase db push`. This recreates the schema, access rules, functions and cleanup job.
3. **Data:** either start fresh (pilot collections expire anyway), or migrate:
   ```bash
   pg_dump "postgresql://postgres:postgres@127.0.0.1:54322/postgres" --data-only --table=auth.users --table=auth.identities > auth.sql
   pg_dump "postgresql://postgres:postgres@127.0.0.1:54322/postgres" --data-only --schema=public > public.sql
   psql "$CLOUD_DB_URL" -f auth.sql && psql "$CLOUD_DB_URL" -f public.sql
   ```
   Organisers sign in again with a code either way. Payer tokens carry over, so existing links keep working.
4. Create an Upstash Redis database and set `REDIS_URL`.
5. Set Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`.
6. Add cloud secrets in GitHub (SPEC section 9), set repo variable `CLOUD_ENABLED=true`, and approve the `production` deploy.
7. Point the domain at Vercel. Keep the Mac mini running read-only for 7 days, then wipe it.
