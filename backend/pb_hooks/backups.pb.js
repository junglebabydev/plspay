/// <reference path="../pb_data/types.d.ts" />

// Backup retention: 7 daily + 4 weekly.
// - Daily: PocketBase's built-in auto backup (@auto_pb_backup_*.zip), configured from env by
//   settings_from_env.pb.js. PocketBase itself prunes it to PB_BACKUP_DAILY_KEEP.
// - Weekly: the cron job below, only while S3 backups are enabled. Its files are named
//   weekly_pb_backup_<appname>_<UTC yyyymmddHHMMSS>.zip so the daily prune never touches them,
//   and it keeps the newest PB_BACKUP_WEEKLY_KEEP (default 4).
// PocketBase cron runs in UTC. The defaults run 30 min apart (daily 19:00, weekly Sat 19:30 UTC
// = Sun 03:00 / 03:30 UTC+8) because only one backup/restore can run at a time. If the daily
// one is still running, the weekly one is retried every 15 min (for up to 12 h).

// Heartbeat after every successful backup (daily, weekly or manual), e.g. to an
// Uptime Kuma push monitor that alerts when no backup arrived in ~25h.
onBackupCreate((e) => {
  e.next() // throws if the backup failed, so the heartbeat is only sent on success

  require(`${__hooks}/utils.js`).sendBackupHeartbeat(e.name)
})

// Retries a postponed weekly backup. Fixed (valid) schedule, so it can't abort this file.
cronAdd("weekly_backup_retry", "7,22,37,52 * * * *", () => {
  require(`${__hooks}/utils.js`).retryWeeklyBackupJob($app)
})

// Keep this env-driven cronAdd LAST in this file: an invalid PB_BACKUP_WEEKLY_CRON makes
// cronAdd abort the rest of the file (a Go panic that JS try/catch can't catch). PocketBase
// then logs "failed to execute backups.pb.js: ... invalid cron expression" and keeps running.
//
// Top-level code runs once at load: it may read env only to pick the schedule.
// The handler itself runs in a separate VM, so it must require() what it needs.
cronAdd("weekly_backup", ($os.getenv("PB_BACKUP_WEEKLY_CRON") || "").trim() || "30 19 * * 6", () => {
  require(`${__hooks}/utils.js`).runWeeklyBackupJob($app)
})
