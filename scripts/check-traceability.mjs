#!/usr/bin/env node
// Every AC-/SEC- ID in specs/ and docs/SPEC.md must appear in at least one test.
// --strict also fails on tests marked fixme/skip (used before production deploy).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const strict = process.argv.includes("--strict");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const ID = /\b(?:AC-F\d{2}-\d{2}|SEC-\d{2})\b/g;

const specFiles = [...walk("specs"), "docs/SPEC.md"];
const required = new Set(specFiles.flatMap((f) => readFileSync(f, "utf8").match(ID) ?? []));

const testFiles = [...walk("tests"), ...walk("supabase/tests")].filter((f) => /\.(ts|sql)$/.test(f));
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
  "SEC-10": "scripts/check-exposure.sh + smoke test in deploy.yml",
  "SEC-11": "scripts/backup.sh before every deploy + nightly launchd",
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
