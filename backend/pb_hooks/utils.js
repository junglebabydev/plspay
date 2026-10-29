/// <reference path="../pb_data/types.d.ts" />

// Shared helpers for the *.pb.js hooks. This file is not a hook itself (no .pb.js suffix).
//
// Every JSVM handler runs in its own isolated VM and cannot see top-level variables of
// the file it was declared in, so each handler loads this module INSIDE its body:
//   const u = require(`${__hooks}/utils.js`)
//
// Never log secret values (S3 keys, the heartbeat URL): log env var NAMES only.

const S3_ENV = ["PB_BACKUP_S3_BUCKET", "PB_BACKUP_S3_ENDPOINT", "PB_BACKUP_S3_ACCESS_KEY", "PB_BACKUP_S3_SECRET"]

const WEEKLY_PREFIX = "weekly_pb_backup_"
// app.store() key: when (ms) a weekly backup was first skipped because another backup was running.
const WEEKLY_RETRY_KEY = "template.weeklyBackupPendingSince"
const WEEKLY_RETRY_MAX_MS = 12 * 60 * 60 * 1000 // give up after 12 h
// weekly_pb_backup_<appname>_<UTC yyyymmddHHMMSS>.zip. Only files matching this are ever pruned.
const WEEKLY_RE = /^weekly_pb_backup_[a-z0-9_]+_(\d{14})\.zip$/

// --- logging (console = container logs in Coolify; warnings/errors also go to the admin UI Logs)

function log(msg) {
  console.log("[template] " + msg)
}

function warn(msg) {
  console.warn("[template] WARNING: " + msg)
  try { $app.logger().warn("[template] " + msg) } catch (_) {}
}

function error(msg) {
  console.error("[template] ERROR: " + msg)
  try { $app.logger().error("[template] " + msg) } catch (_) {}
}

// Removes URLs from an error message (Go HTTP errors embed the full URL, which may carry a token).
// `literal`, when given, is removed first, verbatim (e.g. the configured heartbeat URL).
function redact(err, literal) {
  let msg = String(err)
  if (literal) msg = msg.split(literal).join("<url>")
  return msg.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi, "<url>")
}

// --- env parsing (unset and "" both mean "use the default")

function env(name, fallback) {
  const v = String($os.getenv(name) || "").trim()
  return v === "" ? fallback : v
}

function boolEnv(name, fallback) {
  const v = env(name, "").toLowerCase()
  if (v === "") return fallback
  if (["1", "true", "yes", "on"].includes(v)) return true
  if (["0", "false", "no", "off"].includes(v)) return false
  warn(name + " must be true or false; using the default (" + fallback + ")")
  return fallback
}

function intEnv(name, fallback) {
  const v = env(name, "")
  if (v === "") return fallback
  if (!/^\d+$/.test(v) || parseInt(v, 10) < 1) {
    warn(name + " must be a whole number >= 1; using the default (" + fallback + ")")
    return fallback
  }
  return parseInt(v, 10)
}

// S3 backup target from env. All four required vars must be set, otherwise config is null.
function s3FromEnv() {
  const missing = S3_ENV.filter((k) => env(k, "") === "")
  if (missing.length > 0) return { config: null, missing: missing }
  return {
    config: {
      bucket: env("PB_BACKUP_S3_BUCKET"),
      endpoint: env("PB_BACKUP_S3_ENDPOINT"),
      region: env("PB_BACKUP_S3_REGION", "auto"),
      accessKey: env("PB_BACKUP_S3_ACCESS_KEY"),
      secret: env("PB_BACKUP_S3_SECRET"),
      forcePathStyle: boolEnv("PB_BACKUP_S3_FORCE_PATH_STYLE", true),
    },
    missing: [],
  }
}

// --- weekly backups

// App name in the same spirit as PocketBase's own backup names (snake_case, max 50 chars),
// restricted so the whole name passes the backups API rule ^[a-z0-9_-]+\.zip$ (<= 150 chars).
function backupAppName(app) {
  const n = String(app.settings().meta.appName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50)
  return n || "app"
}

// Creates weekly_pb_backup_<appname>_<UTC yyyymmddHHMMSS>.zip in the backups storage
// (S3 when configured, else pb_data/backups). The name must not start with "@auto_pb_backup_",
// or PocketBase's daily prune would delete it. Throws on failure. Returns the name.
function createWeeklyBackup(app) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14)
  const name = WEEKLY_PREFIX + backupAppName(app) + "_" + stamp + ".zip"
  app.createBackup(new Context(), name)
  return name
}

// Keeps only the newest `keep` weekly backups (newest = latest timestamp in the name).
// Returns the deleted keys.
function pruneWeeklyBackups(app, keep) {
  const fsys = app.newBackupsFilesystem()
  try {
    const weekly = fsys
      .list(WEEKLY_PREFIX)
      .filter((f) => f && !f.isDir && WEEKLY_RE.test(f.key))
      .map((f) => ({ key: f.key, stamp: f.key.match(WEEKLY_RE)[1] }))
      .sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0))

    const removed = []
    weekly.slice(keep).forEach((f) => {
      try {
        fsys.delete(f.key)
        removed.push(f.key)
      } catch (err) {
        error("failed to delete old weekly backup " + f.key + ": " + redact(err))
      }
    })
    return removed
  } finally {
    fsys.close()
  }
}

// The weekly cron job. Only runs when PocketBase will really write to S3 (no local backups
// on the small VM disk): the backups filesystem is S3 only while backups.s3.enabled is true.
function runWeeklyBackupJob(app) {
  if (!app.settings().backups.s3.enabled) {
    app.store().remove(WEEKLY_RETRY_KEY)
    if (s3FromEnv().config) {
      error("weekly backup skipped: the S3 env vars are set but S3 backups are not enabled in the settings " +
        "(look for 'could not save settings from env' at startup)")
    } else {
      log("weekly backup skipped: S3 backups are not configured")
    }
    return
  }

  // PocketBase allows one backup/restore at a time (the daily job runs 30 min earlier and may
  // still be uploading). Then retryWeeklyBackupJob() tries again every 15 min.
  const busy = () => {
    const since = app.store().get(WEEKLY_RETRY_KEY) || Date.now()
    if (Date.now() - since > WEEKLY_RETRY_MAX_MS) {
      app.store().remove(WEEKLY_RETRY_KEY)
      error("weekly backup missed: another backup/restore kept running for 12 h")
      return
    }
    app.store().set(WEEKLY_RETRY_KEY, since)
    warn("weekly backup postponed: another backup/restore is running (retrying every 15 min)")
  }
  if (app.store().has("@activeBackup")) return busy()

  let name
  try {
    name = createWeeklyBackup(app)
  } catch (err) {
    if (String(err).includes("another backup/restore")) return busy()
    app.store().remove(WEEKLY_RETRY_KEY)
    error("weekly backup failed: " + redact(err))
    return // never prune after a failed backup
  }
  app.store().remove(WEEKLY_RETRY_KEY)
  log("weekly backup created: " + name)

  const removed = pruneWeeklyBackups(app, intEnv("PB_BACKUP_WEEKLY_KEEP", 4))
  if (removed.length > 0) log("weekly backups pruned: " + removed.join(", "))
}

// The retry cron job: runs the weekly job again only while one is postponed.
// The pending flag is in memory, so a restart in between drops the retry.
function retryWeeklyBackupJob(app) {
  if (app.store().has(WEEKLY_RETRY_KEY)) runWeeklyBackupJob(app)
}

// GET PB_BACKUP_HEARTBEAT_URL (e.g. an Uptime Kuma push monitor). Never throws.
function sendBackupHeartbeat(backupName) {
  const url = env("PB_BACKUP_HEARTBEAT_URL", "")
  if (!url) return
  // The URL carries a token: a malformed one would end up verbatim in Go's error message.
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) {
    warn("PB_BACKUP_HEARTBEAT_URL is not a valid http(s) URL; heartbeat for " + backupName + " skipped")
    return
  }
  try {
    const res = $http.send({ url: url, method: "GET", timeout: 10 })
    if (res.statusCode >= 200 && res.statusCode < 300) {
      log("backup heartbeat sent for " + backupName)
    } else {
      warn("backup heartbeat for " + backupName + " got HTTP " + res.statusCode)
    }
  } catch (err) {
    warn("backup heartbeat for " + backupName + " failed: " + redact(err, url))
  }
}

module.exports = {
  log,
  warn,
  error,
  env,
  boolEnv,
  intEnv,
  s3FromEnv,
  createWeeklyBackup,
  pruneWeeklyBackups,
  runWeeklyBackupJob,
  retryWeeklyBackupJob,
  sendBackupHeartbeat,
}
