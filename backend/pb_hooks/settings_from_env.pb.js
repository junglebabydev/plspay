/// <reference path="../pb_data/types.d.ts" />

// Applies the backend env vars (set in Coolify) to the PocketBase settings on every start.
// Idempotent: only saves when something differs. Env is the source of truth, so a value
// edited in the admin UI is overwritten on the next restart (also after a backup restore).
//
//   PB_APP_NAME              meta.appName (default "app"; used in backup file names)
//   PB_APP_URL               meta.appURL (only when set)
//   PB_HIDE_CONTROLS         meta.hideControls (default true: no schema edits in the prod UI)
//   PB_TRUSTED_PROXY_HEADER  trustedProxy.headers (default CF-Connecting-IP: real client IP)
//   (always)                 rateLimits.enabled = true, with PocketBase's default rules
//   PB_BACKUP_S3_*           backups.s3 (needs BUCKET, ENDPOINT, ACCESS_KEY, SECRET;
//                            REGION default "auto", FORCE_PATH_STYLE default true)
//   PB_BACKUP_DAILY_CRON     backups.cron (default "0 19 * * *" UTC = 03:00 UTC+8)
//   PB_BACKUP_DAILY_KEEP     backups.cronMaxKeep (default 7)
// Without the S3 vars, automatic backups are turned off (backups.cron = "", backups.s3.enabled
// = false): the VM disk is small, so there are no local automatic backups. Manual backups from
// the admin UI then go to pb_data/backups.
//
// PocketBase validates ALL settings on every save, so one bad env value (a placeholder
// PB_APP_URL, an invalid cron) would reject everything saved with it. The settings are
// therefore saved in independent groups, security first: a bad value only loses its own group,
// is logged as "[template] ERROR: could not save settings from env", and is retried (and
// logged again) on every start until the env var is fixed.
onBootstrap((e) => {
  e.next() // the DB and settings are only usable after this

  const u = require(`${__hooks}/utils.js`)

  // Each group: (settings copy, set, changed) => void. `changed` gets setting NAMES, never values.
  const groups = [
    // Security. Nothing here comes from free-form env that can fail validation.
    (s, set, changed) => {
      set(s.meta, "hideControls", u.boolEnv("PB_HIDE_CONTROLS", true), "meta.hideControls")

      // Behind Cloudflare Tunnel + Coolify's proxy the TCP peer is a proxy, so trust the header
      // Cloudflare sets. Without it, rate limits and logs would see one IP for everyone.
      // PocketBase trusts it from ANY peer: only cloudflared may be able to reach the proxy.
      const header = u.env("PB_TRUSTED_PROXY_HEADER", "CF-Connecting-IP")
      if ((s.trustedProxy.headers || []).join(",") !== header) {
        s.trustedProxy.headers = [header]
        changed.push("trustedProxy.headers")
      }
      set(s.trustedProxy, "useLeftmostIP", false, "trustedProxy.useLeftmostIP")

      // PocketBase ships its default rules but keeps the limiter off; turn it on.
      set(s.rateLimits, "enabled", true, "rateLimits.enabled")
    },

    // App name (backup file names). Separate from the URL, so a bad URL can't drop it.
    (s, set) => set(s.meta, "appName", u.env("PB_APP_NAME", "app"), "meta.appName"),

    (s, set) => {
      const appURL = u.env("PB_APP_URL", "")
      if (appURL) set(s.meta, "appURL", appURL, "meta.appURL")
    },

    // Backups. One group: the cron must never be on while S3 is off (that would fill the disk).
    (s, set) => {
      const s3 = u.s3FromEnv()
      set(s.backups, "cronMaxKeep", u.intEnv("PB_BACKUP_DAILY_KEEP", 7), "backups.cronMaxKeep")
      if (s3.config) {
        set(s.backups.s3, "enabled", true, "backups.s3.enabled")
        for (const key of ["bucket", "endpoint", "region", "accessKey", "secret", "forcePathStyle"]) {
          set(s.backups.s3, key, s3.config[key], "backups.s3." + key)
        }
        set(s.backups, "cron", u.env("PB_BACKUP_DAILY_CRON", "0 19 * * *"), "backups.cron")
      } else {
        // Env is the source of truth: no complete S3 env = no S3 (old values are kept, just disabled).
        set(s.backups.s3, "enabled", false, "backups.s3.enabled")
        set(s.backups, "cron", "", "backups.cron")
        const partial = s3.missing.length < 4 ? " (missing: " + s3.missing.join(", ") + ")" : ""
        u.warn(
          "S3 backups are not configured" + partial + ". Automatic backups are OFF. " +
            "Set PB_BACKUP_S3_BUCKET, PB_BACKUP_S3_ENDPOINT, PB_BACKUP_S3_ACCESS_KEY and PB_BACKUP_S3_SECRET to enable them."
        )
      }
    },
  ]

  let anyChanged = false
  for (const apply of groups) {
    // A fresh copy per group (PocketBase reloads its settings after each successful save),
    // so a value rejected in one group is never carried into the next save.
    const s = e.app.settings().clone()
    const changed = []
    const set = (obj, key, value, label) => {
      if (obj[key] !== value) {
        obj[key] = value
        changed.push(label)
      }
    }
    apply(s, set, changed)
    if (changed.length === 0) continue

    anyChanged = true
    // A bad env value is logged instead of crash-looping the API.
    try {
      e.app.save(s)
      u.log("settings updated from env: " + changed.join(", "))
    } catch (err) {
      u.error(
        "could not save settings from env (" + changed.join(", ") + "), so they keep their " +
          "previous values. Fix the env var(s) and restart. " + err
      )
    }
  }

  if (!anyChanged) u.log("settings already match env")
})
