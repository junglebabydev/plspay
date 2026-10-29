#!/usr/bin/env node
// Every AC-/SEC- ID in specs/ and docs/SPEC.md must appear in at least one test under tests/.
// IDs listed under a "## Retired" heading no longer apply and need no test (tests naming them fail as orphans).
// --strict also fails on tests marked fixme/skip (used before production deploy).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const strict = process.argv.includes("--strict");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const ID = /\b(?:AC-F\d{2}-\d{2}|SEC-\d{2})\b/g;

const specFiles = [...walk("specs"), "docs/SPEC.md"];
const active = (text) => text.split(/^## Retired\b/m)[0];
const required = new Set(specFiles.flatMap((f) => active(readFileSync(f, "utf8")).match(ID) ?? []));

const testFiles = walk("tests").filter((f) => /\.ts$/.test(f));
const covered = new Map(); // id -> "proven" | "pending"
for (const f of testFiles) {
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const ids = line.match(ID); if (!ids) continue;
    const pending = /\.(fixme|skip|todo)\(/.test(line);
    for (const id of ids) if (covered.get(id) !== "proven") covered.set(id, pending ? "pending" : "proven");
  }
}

// SEC items verified outside tests (headers, CI scanners) are listed here with where they are enforced.
const enforcedElsewhere = {
  "SEC-07": "next.config headers + e2e",
  "SEC-08": "gitleaks in security.yml",
  "SEC-09": "dependency review + audit",
  "SEC-10": "Cloudflare Access on *-api.usestack.ai (infra repo) + superusers_path.pb.js, tested in tests/backend/auth.test.ts",
  "SEC-11": "backend/pb_hooks/settings_from_env.pb.js + backups.pb.js (PocketBase backups to R2)",
};

const missing = [...required].filter((id) => !covered.has(id) && !enforcedElsewhere[id]).sort();
const pending = [...required].filter((id) => covered.get(id) === "pending").sort();
const orphans = [...covered.keys()].filter((id) => !required.has(id)).sort();

console.log(`Requirements: ${required.size}  proven: ${[...required].filter((i) => covered.get(i) === "proven").length}  pending: ${pending.length}  missing: ${missing.length}`);
if (orphans.length) console.log(`Tests reference IDs not in any spec: ${orphans.join(", ")}`);
if (pending.length) console.log(`Pending (fixme/skip): ${pending.join(", ")}`);
if (missing.length) { console.error(`No test for: ${missing.join(", ")}`); process.exit(1); }
if (orphans.length) process.exit(1);
if (strict && pending.length) { console.error("Strict mode: pending tests block release."); process.exit(1); }
console.log("Traceability OK");
