import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // backend/ is PocketBase JSVM code (hooks and migrations), not Node or browser code.
  globalIgnores([".next/**", "out/**", "node_modules/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "backend/**", ".cache/**"]),
]);
