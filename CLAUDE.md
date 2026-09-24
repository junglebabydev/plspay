# Rules for coding agents

You are building PlsPay. Read `docs/PRD.md` and `docs/SPEC.md` before any task.

## Workflow, every task

1. Find the spec. If the task has no `AC-` ID, stop and propose a spec change first. Do not build unspecced behaviour.
2. Write failing tests first. Every test name includes the AC ID it proves, e.g. `it("AC-F03-04 adds a cent on collision")`.
3. Implement the smallest change that makes them pass.
4. Run locally before pushing: `npm run lint && npm run typecheck && npm test && npm run test:db && npm run trace`.
5. PR description lists every AC ID touched.

## Hard rules

1. Never disable RLS, add `using (true)`, or grant anything to `anon`.
2. The browser never talks to Supabase. Supabase clients are created only in `src/server/`. Never add `NEXT_PUBLIC_SUPABASE_*` variables. Never use realtime subscriptions from the client; poll a server route instead.
3. The service role key is used only in `src/server/payer.ts` for the two payer RPCs.
4. Never move or hold money. No payment provider SDKs without a spec change approved by Vaibhav.
5. Never log tokens, phone numbers or names.
6. Schema changes only through a new file in `supabase/migrations/`. Never edit a merged migration.
7. Money is integer cents everywhere. No floats.
8. If a spec is ambiguous, ask in the PR. Do not pick silently.
9. Code must run unchanged on the Mac mini pilot and in the cloud. Anything environment-specific goes in env vars, never in code branches.

## Definition of done

1. All ACs for the feature have passing tests.
2. `npm run trace` passes.
3. No new lint, type or security warnings.
4. Payer-facing changes checked on a real phone (pilot URL after merge, or `cloudflared tunnel --url localhost:3000` before).
