# PlsPay (working name)

PayNow payment requests and bill splits for Singapore. Money always moves payer to organiser via PayNow. We never hold funds.

This repo is spec-driven. Specs are the source of truth, tests prove them, CI enforces both.

## Where things live

| Path | What it is |
|---|---|
| `docs/PRD.md` | Why, who, scope, success metrics |
| `docs/SPEC.md` | System spec: architecture, data model, security, API, NFRs |
| `docs/MAC-MINI.md` | Deploying on the Mac mini's Coolify: settings, env vars, first-time setup |
| `specs/F0x-*.md` | Feature specs with numbered acceptance criteria (`AC-F03-02`) |
| `CLAUDE.md` | Rules for coding agents working in this repo |
| `backend/` | PocketBase 0.40.5 (pinned, sha256-checked), from `project-template` |
| `backend/pb_migrations/` | Schema and access rules, as code |
| `backend/pb_hooks/plspay.pb.js` | Server-set fields, the payer routes, the retention job (helpers in `plspay.js`) |
| `tests/unit`, `tests/backend`, `tests/e2e` | Vitest (pure logic), Vitest against a real PocketBase (access rules, hooks, routes), Playwright |
| `scripts/check-traceability.mjs` | Fails CI if any acceptance criterion has no test |
| `scripts/pb-test.mjs` | Runs a command against a throwaway PocketBase (fresh data, every migration from scratch) |
| `.github/workflows/` | CI and security scans. Coolify deploys on push to `main` |

## The loop

1. Write or change a spec in `specs/`. Every behaviour gets an `AC-` ID.
2. Write failing tests that name the AC ID.
3. Implement until green.
4. Open a PR. CI runs lint, typecheck, unit, backend rule tests, traceability, build, e2e.
5. Merge to `main`. Coolify rebuilds and redeploys the app and the backend (`docs/MAC-MINI.md`).

## First-time setup (laptop)

Needs Node 22 and Docker (OrbStack on Apple silicon).

```bash
npm ci
docker compose up -d --build                  # PocketBase on http://localhost:8090 (admin UI at /_/)
./scripts/dev-seed.sh                         # local superuser + organisers A and B; passwords in ./.env.seed
cp .env.example .env.local && chmod 600 .env.local
npx playwright install chromium webkit
npm run dev                                   # http://localhost:3000
```

Sign in as `organiser-a@example.com` with `DEV_USER_A_PASSWORD` from `./.env.seed`. There is no sign-up: organiser accounts are created by a superuser in the PocketBase admin (locally `http://localhost:8090/_/`, as `admin@example.com`).

Full check before pushing: `npm run check` (lint, typecheck, unit, backend tests, traceability), then `npm run build && npm run test:e2e:pb`.
- `npm run test:db` downloads the pinned PocketBase binary for your machine once (into `.cache/`), starts it on a free port with a fresh data dir, runs `tests/backend`, and deletes it. It needs no Docker.
- `npm run test:e2e:pb` does the same for Playwright. `npm run test:e2e` instead uses the docker compose backend and the superuser in `./.env.seed`.

Schema changes: change collections in the local admin UI (compose runs PocketBase with `--automigrate`, so each change writes a migration into `backend/pb_migrations/`), or write the migration by hand. Then reset and re-run everything from scratch before pushing: `docker compose down -v && docker compose up -d --build && docker compose logs backend`. Never edit a migration that has already run on a database you care about.

## Where the code lives

| Path | What it is |
|---|---|
| `src/app` | Routes. `/signin`, `/app/*` (organiser), `/p/[token]` (payer), `/api/claim` |
| `src/server` | The only place PocketBase clients exist. `pb.ts` (session client, httpOnly cookie), `payer.ts` (the payer routes, no credential) |
| `src/lib` | Pure logic with unit tests: PayNow payload, splitting, validation, money, QR PNG, WhatsApp text |
| `src/proxy.ts` | Per-request CSP nonce, payer rate limit (429) |

## Backend in one paragraph

Three collections (`profiles`, `collections`, `payers`) whose API rules let an organiser reach only their own rows; anonymous visitors get nothing. Hooks copy and freeze the PayNow details on each collection, set each payer's owner and random token, and issue a new token when a revoked payer is restored. Payers reach their payment only through `POST /api/plspay/payment` and `POST /api/plspay/claim`, with the token in the body. PayNow changes on a profile go through `POST /api/plspay/profile`, which checks the password. A cron job deletes collections 90 days after they close or expire. Details: `docs/SPEC.md` sections 2 to 4.
