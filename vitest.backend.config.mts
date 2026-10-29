// Backend tests: run against a throwaway PocketBase via `npm run test:db` (scripts/pb-test.mjs).
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/backend/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 } });
