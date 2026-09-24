# System spec: PlsPay v2

Feature behaviour lives in `specs/`. This file covers everything cross-cutting. Where this file and a feature spec disagree, raise it in the PR. Do not guess.

## 1. Architecture

Two phases, same code, same migrations.

**Phase 1, pilot on the Mac mini (now)**
```
Phone ──https──> Cloudflare Tunnel ──> Mac mini
                 (plspay domain)        ├─ Next.js :3000   (only thing exposed)
                                        ├─ Supabase local  (Postgres, Auth) 127.0.0.1 only
                                        └─ Redis :6379     (rate limits) 127.0.0.1 only
```

**Phase 2, cloud (later)**
```
Phone ──https──> Vercel (Next.js) ──server only──> Supabase cloud
                        └── Upstash Redis
```

Rules that hold in both phases:
1. **The browser never talks to Supabase.** All reads and writes go through Next.js server components, server actions or route handlers. No Supabase keys ship to the browser, no `NEXT_PUBLIC_SUPABASE_*` variables exist.
2. Organiser requests run with the organiser's session (cookie, via `@supabase/ssr` on the server). Row-level security (RLS) decides what they see.
3. Payer requests call security-definer RPCs with the service role, server side, after rate limiting.
4. Rate limiting sits behind one interface, `src/server/ratelimit.ts`, backed by `REDIS_URL` (local Redis in pilot, Upstash in cloud). Client IP comes from `cf-connecting-ip` (tunnel), `x-real-ip` (Vercel) or the last `x-forwarded-for` hop.
5. Payer links are rate limited and given a CSP nonce in `src/proxy.ts`, which runs before every route.

## 2. Data model

Source of truth: `supabase/migrations/0001_init.sql`.

| Table | Key fields | Notes |
|---|---|---|
| `profiles` | `id` (= auth user), `display_name`, `paynow_type`, `paynow_id`, `whatsapp` | One per organiser |
| `collections` | `owner_id`, `title`, `kind`, `payee_name`, `paynow_type`, `paynow_id`, `status`, `expires_at` | PayNow fields copied from profile at insert by trigger. Immutable after. `kind` is `personal` (default) or `business` (`0004_collection_kind.sql`) |
| `payers` | `collection_id`, `owner_id`, `first_name`, `whatsapp`, `amount_cents`, `reference`, `token`, `status`, `revoked` | `token` is 144-bit random, server generated. `owner_id` set by trigger |

Constraints: amounts unique per collection, references unique per collection, tokens unique globally, status in `waiting | claimed | paid`.

## 3. Access rules (the security contract)

| Actor | Can | Cannot |
|---|---|---|
| Organiser (signed in) | Read and write own profile, collections, payers | See any other organiser's data. Change PayNow fields on an existing collection |
| Payer (holds a token) | Read their own payment details. Set their own status to `claimed` | See other payers, totals, status of others, organiser phone. Set `paid` |
| Anyone else | Nothing | Everything |
| Service role | Only used server-side for the two payer RPCs | Never shipped to the browser |

Each row is enforced in the database and proven by a test in `supabase/tests/`.

## 4. Payer token rules

1. Generated in Postgres, 18 random bytes, base64url, 24 chars.
2. Valid only if payer not revoked, collection `open`, and `now() < expires_at`.
3. Invalid, expired and revoked tokens return the same "link no longer works" page. No hint which case it is.
4. Tokens never appear in logs. Strip `/p/*` paths from analytics.

## 5. PayNow QR

Built by `src/lib/paynow.ts` (SGQR / EMVCo):

| Tag | Value |
|---|---|
| 00 | `01` |
| 01 | `12` (dynamic) |
| 26 | `SG.PAYNOW`, proxy type (`0` mobile, `2` UEN), proxy value, editable `0`, expiry `YYYYMMDD` |
| 52 / 53 | `0000` / `702` |
| 54 | Amount, 2 decimals |
| 58 / 59 / 60 | `SG` / payee name (max 25) / `Singapore` |
| 62 | Sub-tag 01 = reference |
| 63 | CRC16-CCITT (poly 0x1021, init 0xFFFF) |

## 6. Security requirements

| ID | Requirement |
|---|---|
| SEC-01 | RLS enabled on every table. CI fails if a table in `public` lacks RLS |
| SEC-02 | Anon role has no grants on tables or RPCs |
| SEC-03 | `/p/[token]` and `/api/claim`: 30 requests per IP per minute |
| SEC-04 | OTP send: 3 per phone per 10 min, 10 per IP per hour. Singapore numbers only (+65) |
| SEC-05 | Changing PayNow details requires an OTP verified in the last 5 minutes |
| SEC-06 | Payer page HTML and Open Graph tags contain no payer name or phone |
| SEC-07 | Security headers: CSP (self only, per-request nonce for Next's inline scripts, set in `src/proxy.ts`), HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (static headers in `next.config.security.ts`) |
| SEC-08 | No secrets in the repo. Gitleaks on every PR |
| SEC-09 | Dependencies scanned weekly. High severity blocks merge |
| SEC-10 | Pilot: Supabase (54321-54324), Postgres and Redis listen on 127.0.0.1 only. The tunnel exposes port 3000 and nothing else. Local Supabase uses publicly known default keys, so its API must never be reachable from outside the Mac mini |
| SEC-11 | Pilot: nightly encrypted database backup, 14 days kept, restore tested monthly. FileVault on. No other services exposed on the Mac mini |

## 7. Privacy (PDPA)

1. Store payer first name only. WhatsApp number optional.
2. Delete collections and payers 90 days after close or expiry (`0002_retention.sql`).
3. Privacy notice linked on sign-in and payer page.
4. Organiser can delete a collection at any time. Deletion is immediate and cascades.

## 8. Non-functional

| Area | Target |
|---|---|
| Payer page load | Under 1.5s on 4G, JS under 60KB |
| Availability | Pilot: best effort, single machine, UPS recommended. Cloud: Vercel and Supabase defaults |
| Browsers | iOS Safari 16+, Android Chrome 110+, WhatsApp in-app browser |
| Accessibility | WCAG 2.1 AA on payer page |

## 9. Environments and deployment

| Env | App | Database | Trigger |
|---|---|---|---|
| Local | `next dev` on a laptop | `supabase start` on the laptop | Manual |
| CI | Built inside GitHub Actions | Local Supabase inside the runner | Every PR |
| Pilot | Mac mini, Next.js under pm2, public via Cloudflare Tunnel | Local Supabase on the Mac mini | Merge to `main`, deployed by a self-hosted runner on the Mac mini |
| Cloud (phase 2) | Vercel | Supabase cloud project | Manual approval on `production` environment, enabled when repo variable `CLOUD_ENABLED` is `true` |

Migrations always run before the app restarts or deploys, and must be backward compatible with the previous app version (expand, then contract).

Mac mini setup, backups and the cloud migration runbook: `docs/MAC-MINI.md`.

**Supabase CLI version:** 2.117.0, pinned in `package.json` (devDependency, run as `npx supabase`) and in `.github/workflows/ci.yml`. Postgres image 17.6.1.167 or newer: 17.6.1.106 segfaults on function permission errors. Match this on the Mac mini.

**App variables** (all server-only, never `NEXT_PUBLIC_`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, optional `APP_URL` (public origin used in payer links; defaults to the request's forwarded host). `scripts/supabase-env.sh` prints the first four from a running local stack.

**Pilot secrets** live in `/Users/plspay/plspay/.env.local` on the Mac mini, never in GitHub: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `BACKUP_PASSPHRASE`, `BACKUP_REMOTE`. Twilio credentials live in `/Users/plspay/plspay/supabase/.env` and are read by `supabase/config.toml`.

**Cloud secrets** (phase 2, in GitHub): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD_PROD`, `SUPABASE_PROJECT_REF_PROD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
