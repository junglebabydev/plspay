# Deploying on the Mac mini (Coolify)

PlsPay runs on the Mac mini home server as two Coolify apps built from this repo: the Next.js app at the repo root and its own PocketBase in `backend/`. The public reaches them only through the Cloudflare Tunnel. This replaces the old pilot setup (pm2, launchd, local Supabase, Redis): none of that exists any more.

The server side (Colima, Coolify itself, the tunnel, Cloudflare Access, restoring from R2, Uptime Kuma) is documented in the infra repo (`macmini-server`), not here. The backend follows `project-template`; its README explains each setting in more depth.

| | Frontend | Backend |
|---|---|---|
| What | Next.js 16, `npm run build` / `npm run start` | PocketBase 0.40.5, `backend/Dockerfile` (linux arm64) |
| URL | `https://plspay.usestack.ai` | `https://plspay-api.usestack.ai` |
| Port | 3000 | 8090 |
| Container | generated name | `plspay-pb` (fixed) |
| Data | none | volume at `/pb/pb_data` |

## 1. Before creating the apps (once)

1. **Destination:** Destinations > New destination, Name and Network `plspay`, server localhost. Put both apps on it, so `http://plspay-pb:8090` resolves from the frontend and the apps stay off the shared `coolify` network.
2. **R2 (human step):** create bucket `pb-backup-plspay` and an *Object Read & Write* token scoped to that bucket only. Never share a bucket between projects: PocketBase's auto-prune deletes every `@auto_pb_backup_*` file in it.
3. **Only cloudflared may reach Coolify's proxy.** PocketBase trusts `CF-Connecting-IP` from any peer, and so does the app's own rate limiter. This is a server precondition from the infra repo; check it from another LAN device (must time out or be refused):
   `curl -m 5 -H 'Host: plspay-api.usestack.ai' http://<vm-ip>/api/health`
4. **Cloudflare Access** covers `*-api.usestack.ai` paths `_` and `api/collections/_superusers` (one Access app for all projects; already set up for `*-api.usestack.ai`). Never log in as a superuser any other way than through it.

## 2. Backend app (PocketBase)

+ New > Private Repository (with GitHub App), destination `plspay`, repo `junglebabydev/plspay`, branch `main`.

| Setting | Value |
|---|---|
| Build pack | Dockerfile |
| Base Directory | `/backend` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `8090` |
| Port Mappings | empty |
| Domains | `https://plspay-api.usestack.ai` |
| Redirect HTTP to HTTPS | **Disabled** (Cloudflare terminates HTTPS; the redirect would loop) |
| Watch Paths | `backend/**` |
| Auto deploy | Deploy on push, branch `main` |
| Container naming | **Consistent name (no rolling updates)**, custom name `plspay-pb` |
| Persistent Storage | Volume Mount, Destination Path `/pb/pb_data` |
| Memory limit | `512m` (the image sets `GOMEMLIMIT=256MiB`) |
| Healthcheck | leave the UI check disabled; the Dockerfile `HEALTHCHECK` is used |
| Build arguments | **Managed manually in Dockerfile** (none needed; keeps the R2 secret out of the image) |
| Preview deployments | off |

Environment variables (all **runtime only**: untick *Available during build*):

| Variable | Value |
|---|---|
| `PB_APP_NAME` | `plspay` |
| `PB_APP_URL` | `https://plspay-api.usestack.ai` |
| `PB_ORIGINS` | `https://plspay.usestack.ai` (the browser never calls PocketBase; this just closes CORS) |
| `PB_BACKUP_S3_BUCKET` | `pb-backup-plspay` |
| `PB_BACKUP_S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `PB_BACKUP_S3_ACCESS_KEY` | secret |
| `PB_BACKUP_S3_SECRET` | secret |
| `PB_BACKUP_HEARTBEAT_URL` | optional Uptime Kuma push URL (contains a token) |

The image's defaults are already right for production: `PB_AUTOMIGRATE=false`, `PB_HIDE_CONTROLS=true`, `PB_TRUSTED_PROXY_HEADER=CF-Connecting-IP`, backups daily 19:00 UTC (7 kept) and weekly Saturday 19:30 UTC (4 kept). Full list: `backend/.env.example`. After changing a runtime value, **Restart**.

## 3. Frontend app (Next.js)

Same repo and destination.

| Setting | Value |
|---|---|
| Build pack | Nixpacks |
| Base Directory | `/` |
| Ports Exposes | `3000` |
| Domains | `https://plspay.usestack.ai` |
| Redirect HTTP to HTTPS | **Disabled** |
| Watch Paths | `src/**`, `package.json`, `package-lock.json`, `next.config.ts`, `next.config.security.ts`, `postcss.config.mjs`, `tsconfig.json` (or leave empty to rebuild on every push) |
| Auto deploy | Deploy on push, branch `main` |
| Container naming | Generated name (rolling updates), the default |
| Memory limit | `512m` |
| Preview deployments | off (a preview would use the production backend and its data) |

Environment variables:

| Variable | Value | Build time | Runtime |
|---|---|---|---|
| `PB_INTERNAL_URL` | `http://plspay-pb:8090` | not needed | available |
| `APP_URL` | `https://plspay.usestack.ai` (payer links; also turns on the Secure flag of the session cookie) | not needed | available |
| `NIXPACKS_NODE_VERSION` | `22` | available | not needed |

Nothing is inlined at build time: there are no `NEXT_PUBLIC_*` variables. `npm run start` is plain `next start`, which listens on 0.0.0.0:3000 (or `$PORT`). Rate limits are held in the app's memory, so they reset on each deploy; that is expected.

## 4. After the first backend deploy

1. **Superuser**, in the backend app's Terminal (absolute path, so the data lands in the volume):
   ```sh
   /pb/pocketbase superuser upsert you@example.com 'a-long-random-password'
   ```
   Until a superuser exists the logs show a one-time installer link, so don't share the logs before this.
2. **Logs** should show `settings updated from env` (or `settings already match env`) and `[plspay] rate limit rules updated` (or nothing from plspay on later starts), and no `[template] ERROR`, `[plspay] ERROR` or `failed to execute` line.
3. **Access checks:**
   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://plspay-api.usestack.ai/api/collections/_superusers/auth-with-password
   #   302, 401 or 403 from Access. A 400 means PocketBase answered: Access does not cover the path.
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://plspay-api.usestack.ai/api/collections/_SUPERUSERS/auth-with-password
   #   302, 401, 403 or 404, never 400
   curl -s -o /dev/null -w '%{http_code}\n' https://plspay-api.usestack.ai/api/health
   #   200
   curl -s https://plspay-api.usestack.ai/api/collections/payers/records
   #   {"items":[],...,"totalItems":0}  (anonymous visitors see nothing)
   ```
4. **Organiser accounts:** open `https://plspay-api.usestack.ai/_/` (through Access), Collections > users > New record: email, password, *verified* on. Give the organiser their password. They sign in at `https://plspay.usestack.ai/signin` and set up their PayNow profile.
5. **Monitoring:** Uptime Kuma HTTP checks on `https://plspay.usestack.ai/` and `https://plspay-api.usestack.ai/api/health` (status code only).

## 5. Operations

- **Deploy:** merge to `main`. Coolify rebuilds whichever app's watch paths matched. Backend migrations run on start, all in one transaction.
- **Retention:** `purge_old_collections` runs daily at 19:15 UTC (03:15 SGT). Run it by hand from the admin UI (Settings > Crons) if needed.
- **Logs:** Coolify > app > Logs. Logs must never contain tokens, names or phone numbers; payer tokens only ever travel in request bodies.
- **Bad backend deploy:** Coolify doesn't health-check the backend before switching (fixed container name), so a release that fails on boot takes the API down and payer links stop working. Test migrations on a fresh volume before pushing (`docker compose down -v && docker compose up -d --build`, then `docker compose logs backend`). To recover, use the backend app's Rollback tab or push a revert. A failed migration leaves the database unchanged, so the previous image still works.
- **Restore a backup:** infra repo runbook (PocketBase restores from R2 in the admin UI, Settings > Backups).
- **Mac mini down:** payer links stop working until it's back. QRs payers already saved still work, because the money goes bank to bank.
- **Upgrade PocketBase:** bump `PB_VERSION` and `PB_SHA256` in `backend/Dockerfile` and the version and hashes in `scripts/pb-test.mjs` together (the tests refuse to run otherwise). Take the hashes from the release's `checksums.txt`.
