#!/usr/bin/env node
// Runs a command against a throwaway PocketBase, then deletes it:
//   - the release binary of the version pinned in backend/Dockerfile, for this machine,
//     sha256-checked and cached in .cache/pocketbase/
//   - a fresh temp data dir, so every migration in backend/pb_migrations runs from scratch
//   - this repo's backend/pb_hooks, exactly as production loads them
//
//   node scripts/pb-test.mjs vitest run -c vitest.backend.config.mts   (npm run test:db)
//   node scripts/pb-test.mjs playwright test                           (npm run test:e2e:pb)
//
// The command gets PB_TEST_URL and PB_INTERNAL_URL (both the throwaway backend), and
// PB_TEST_SUPERUSER_EMAIL / PB_TEST_SUPERUSER_PASSWORD (random per run) in its environment.
// No Docker needed, so it also runs on GitHub's amd64 runners (the backend image is arm64-only).
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, createWriteStream } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

// From the release's checksums.txt. Bump together with PB_VERSION/PB_SHA256 in backend/Dockerfile.
const VERSION = "0.40.5";
const SHA256 = {
  darwin_amd64: "3640f0c4d9e0e5a47e321f10ddf6698508d4f20721bcf5dfb7c4192835e5105f",
  darwin_arm64: "d9a176e0491bc825fff88c2a4edffb07307f785ac2bd9710e82c5d223669fc17",
  linux_amd64: "1dbea1b01eb3dfe64953513859d01e759c96650c4e3264fa4eecd54b769382e4",
  linux_arm64: "570baa1c45d2fb92fc0073582b945ca0ece03cbf9837ccabf49a222f99dd02e3",
};

function die(msg) {
  console.error(`pb-test: ${msg}`);
  process.exit(1);
}

const command = process.argv.slice(2);
if (command.length === 0) die("usage: node scripts/pb-test.mjs <command> [args...]");

// The tests must run the version production runs.
const dockerfile = readFileSync(join(ROOT, "backend/Dockerfile"), "utf8");
const pinned = /ARG PB_VERSION=(\S+)/.exec(dockerfile)?.[1];
const pinnedSha = /ARG PB_SHA256=(\S+)/.exec(dockerfile)?.[1];
if (pinned !== VERSION || pinnedSha !== SHA256.linux_arm64) {
  die(`backend/Dockerfile pins PocketBase ${pinned}; update VERSION and SHA256 in scripts/pb-test.mjs to match`);
}

const platform = `${process.platform}_${{ x64: "amd64", arm64: "arm64" }[process.arch] ?? process.arch}`;
if (!SHA256[platform]) die(`no pinned PocketBase build for ${platform}`);

async function ensureBinary() {
  const dir = join(ROOT, ".cache/pocketbase", `${VERSION}_${platform}`);
  const bin = join(dir, "pocketbase");
  if (existsSync(bin)) return bin;
  mkdirSync(dir, { recursive: true });
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_${platform}.zip`;
  console.log(`pb-test: downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) die(`download failed: HTTP ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  const sum = createHash("sha256").update(zip).digest("hex");
  if (sum !== SHA256[platform]) die(`sha256 mismatch for ${platform}: got ${sum}`);
  const zipPath = join(dir, "pocketbase.zip");
  writeFileSync(zipPath, zip);
  execFileSync("unzip", ["-o", "-q", zipPath, "pocketbase", "-d", dir]);
  rmSync(zipPath);
  return bin;
}

function freePort() {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => ok(port));
    });
  });
}

const bin = await ensureBinary();
const dataDir = mkdtempSync(join(tmpdir(), "plspay-pb-"));
const logPath = join(dataDir, "pocketbase.log");
const email = "superuser@plspay.test";
const password = randomBytes(18).toString("base64url");

// Superuser first (the CLI works on the data dir directly), then the server.
execFileSync(bin, ["superuser", "upsert", email, password, `--dir=${dataDir}`], { stdio: "ignore" });

const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const log = createWriteStream(logPath);
const pb = spawn(bin, [
  "serve",
  `--http=127.0.0.1:${port}`,
  `--dir=${dataDir}`,
  `--migrationsDir=${join(ROOT, "backend/pb_migrations")}`,
  `--hooksDir=${join(ROOT, "backend/pb_hooks")}`,
  "--automigrate=false",
], { env: { ...process.env, PB_APP_NAME: "plspay-test", PB_APP_URL: url }, stdio: ["ignore", "pipe", "pipe"] });
pb.stdout.pipe(log);
pb.stderr.pipe(log);

let exiting = false;
function cleanup(code) {
  if (exiting) return;
  exiting = true;
  pb.kill("SIGTERM");
  const logText = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  if (code !== 0 && logText) console.error(`\n--- PocketBase log (last 40 lines) ---\n${logText.split("\n").slice(-40).join("\n")}`);
  // A hook or migration that fails to load is only logged by PocketBase; fail loudly instead.
  const broken = logText.split("\n").filter((l) => /failed to execute|\[(template|plspay)\] ERROR/.test(l));
  if (broken.length) {
    console.error(`pb-test: PocketBase reported errors:\n${broken.join("\n")}`);
    if (code === 0) code = 1;
  }
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(code);
}
process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));
pb.on("exit", (c) => { if (!exiting) { console.error(`pb-test: PocketBase exited early (code ${c})`); cleanup(1); } });

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${url}/api/health`)).ok) break;
  } catch { /* not up yet */ }
  if (i > 100) { console.error("pb-test: PocketBase did not become healthy"); cleanup(1); }
  await new Promise((r) => setTimeout(r, 200));
}
console.log(`pb-test: PocketBase ${VERSION} (${platform}) on ${url}, fresh data dir`);

const child = spawn(command[0], command.slice(1), {
  stdio: "inherit",
  env: {
    ...process.env,
    PB_TEST_URL: url,
    PB_INTERNAL_URL: url,
    PB_TEST_SUPERUSER_EMAIL: email,
    PB_TEST_SUPERUSER_PASSWORD: password,
  },
});
child.on("exit", (code, signal) => cleanup(code ?? (signal ? 1 : 0)));
child.on("error", (err) => { console.error(`pb-test: could not run ${command[0]}: ${err.message}`); cleanup(1); });
