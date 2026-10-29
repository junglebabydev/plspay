# Rules for coding agents

You are building PlsPay. Read `docs/PRD.md` and `docs/SPEC.md` before any task.

## Workflow, every task

1. Find the spec. If the task has no `AC-` ID, stop and propose a spec change first. Do not build unspecced behaviour.
2. Write failing tests first. Every test name includes the AC ID it proves, e.g. `it("AC-F03-04 adds a cent on collision")`.
3. Implement the smallest change that makes them pass.
4. Run locally before pushing: `npm run check` (lint, typecheck, unit, backend tests against a throwaway PocketBase, traceability).
5. PR description lists every AC ID touched.

## Hard rules

1. Never make a collection rule public (the empty string) or loosen an owner rule. Anonymous visitors reach data only through the payer routes in `backend/pb_hooks/plspay.pb.js`, by token.
2. The browser never talks to PocketBase. PocketBase clients are created only in `src/server/`. Never add `NEXT_PUBLIC_*` variables. Never use realtime subscriptions from the client; poll a server route instead.
3. The app holds no PocketBase superuser credential. Payer calls go only through `src/server/payer.ts`, to the two public payer routes.
4. Never move or hold money. No payment provider SDKs without a spec change approved by Vaibhav.
5. Never log tokens, phone numbers or names. Payer tokens go to PocketBase in request bodies, never URLs (PocketBase logs URLs).
6. Schema changes only through a new file in `backend/pb_migrations/`. Never edit a migration that has run on a database you care about.
7. Money is integer cents everywhere. No floats.
8. If a spec is ambiguous, ask in the PR. Do not pick silently.
9. Anything environment-specific goes in env vars, never in code branches.
10. Use the PocketBase v0.23+ JS API only in `backend/` (hooks and migrations). Never copy v0.22 examples.

## Definition of done

1. All ACs for the feature have passing tests.
2. `npm run trace` passes.
3. No new lint, type or security warnings.
4. Payer-facing changes checked on a real phone (`https://plspay.usestack.ai` after merge, or `cloudflared tunnel --url localhost:3000` before).
