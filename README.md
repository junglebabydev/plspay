# PlsPay (working name)

PayNow payment requests and bill splits for Singapore. Money always moves payer to organiser via PayNow. We never hold funds.

This repo is spec-driven. Specs are the source of truth, tests prove them, CI enforces both.

## Where things live

| Path | What it is |
|---|---|
| `docs/PRD.md` | Why, who, scope, success metrics |
| `docs/SPEC.md` | System spec: architecture, data model, security, API, NFRs |
| `docs/MAC-MINI.md` | Pilot server runbook, backups, cloud migration |
| `specs/F0x-*.md` | Feature specs with numbered acceptance criteria (`AC-F03-02`) |
| `CLAUDE.md` | Rules for coding agents working in this repo |
| `supabase/migrations/` | Schema, row-level security, RPCs |
| `supabase/tests/` | pgTAP security tests for access rules |
| `tests/unit`, `tests/e2e` | Vitest and Playwright |
| `scripts/check-traceability.mjs` | Fails CI if any acceptance criterion has no test |
| `.github/workflows/` | CI, deploy (Mac mini pilot, cloud later), security scans |
| `ops/`, `ecosystem.config.cjs` | Tunnel, firewall, backup schedule, process config for the pilot |

## The loop

1. Write or change a spec in `specs/`. Every behaviour gets an `AC-` ID.
2. Write failing tests that name the AC ID.
3. Implement until green.
4. Open a PR. CI runs lint, typecheck, unit, DB security tests, traceability, build, e2e. Vercel posts a preview.
5. Merge to `main`. The Mac mini runner applies migrations to the local database, rebuilds, restarts, and smoke-tests the public URL.
6. Phase 2 only: approve the `production` environment in GitHub to push to Supabase cloud and Vercel.

## First-time setup (laptop)

Needs Node 20+, Docker (OrbStack recommended on Apple silicon) and Redis on 127.0.0.1:6379
(`docker run -d --name plspay-redis -p 127.0.0.1:6379:6379 redis:7-alpine` is enough).
The Supabase CLI is a dev dependency, so `npx supabase` always runs the pinned version.

```bash
npm ci
cp supabase/.env.example supabase/.env        # placeholder Twilio values; test OTPs never send SMS
npx supabase start                            # first run downloads images
npx supabase db reset                         # laptop/CI only: migrations + seed from scratch
scripts/supabase-env.sh > .env.local && chmod 600 .env.local
npx playwright install chromium webkit
npm run dev                                   # http://localhost:3000
```

Sign in locally with any number in `[auth.sms.test_otp]` in `supabase/config.toml` (e.g. 91234567) and code 123456.

Full check before pushing: `npm run check` (lint, typecheck, unit, DB tests, traceability) then `npm run build && npm run test:e2e`.

## Where the code lives

| Path | What it is |
|---|---|
| `src/app` | Routes. `/signin`, `/app/*` (organiser), `/p/[token]` (payer), `/api/claim` |
| `src/server` | The only place Supabase clients exist. `payer.ts` is the only file with the service role key |
| `src/lib` | Pure logic with unit tests: PayNow payload, splitting, validation, money, QR PNG, WhatsApp text |
| `src/proxy.ts` | Per-request CSP nonce, payer rate limit (429), organiser session refresh |
| `scripts/supabase-env.sh` | Emits `SUPABASE_*` variables from the running local stack |

Pilot server setup: `docs/MAC-MINI.md`. Environments and secrets: `docs/SPEC.md` section 9.
