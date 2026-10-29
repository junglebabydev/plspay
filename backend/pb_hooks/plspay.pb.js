/// <reference path="../pb_data/types.d.ts" />

// PlsPay's server-side rules (docs/SPEC.md sections 3 and 4). They replace the Supabase
// triggers and security-definer RPCs one for one:
//
//   collections_snapshot_paynow   onRecordCreate  "collections"   (AC-F03-06)
//   collections_freeze_paynow     onRecordUpdate  "collections"   (AC-F02-04, closed_at)
//   payers_set_owner              onRecordCreate / onRecordUpdate "payers" (owner, token)
//   reissue_payer                 onRecordUpdate  "payers": un-revoking issues a new token (AC-F06-05)
//   profiles_guard_paynow         profiles.updateRule + POST /api/plspay/profile (SEC-05)
//   paynow_id_format check        onRecordValidate "profiles" (AC-F02-02)
//   get_payment                   POST /api/plspay/payment  { token }   public
//   claim_payment                 POST /api/plspay/claim    { token }   public, transactional
//   purge_old_collections         cronAdd "purge_old_collections" (AC-F06-04)
//   (new) create in one go        POST /api/plspay/collections, organiser only, transactional
//
// The payer routes take an opaque token in the JSON body (never in the URL: PocketBase logs
// URLs, SPEC 4.4) and nothing that identifies a row. They are the ONLY way anonymous visitors
// reach any data, and they answer the same 404 for invalid, revoked, closed and expired links.
//
// Model hooks (onRecordCreate/Update) rather than request hooks, so records saved from the
// admin UI or from these routes get the same treatment. Each handler is self-contained:
// JSVM runs it in its own VM, so it require()s the helper itself.

// ---- collections -----------------------------------------------------------------------

onRecordCreate((e) => {
  const plspay = require(`${__hooks}/plspay.js`)
  plspay.snapshotPayNow(e.app, e.record) // throws without a profile
  e.record.set("status", "open")
  e.record.set("closed_at", "")
  if (!e.record.getString("kind")) e.record.set("kind", "personal") // AC-F03-09 default
  if (e.record.getDateTime("expires_at").isZero()) {
    e.record.set("expires_at", new DateTime().addDate(0, 0, plspay.DEFAULT_EXPIRY_DAYS)) // AC-F03-07
  }
  e.next()
}, "collections")

onRecordUpdate((e) => {
  const old = e.record.original()
  for (const field of ["owner", "payee_name", "paynow_type", "paynow_id"]) {
    if (e.record.getString(field) !== old.getString(field)) {
      throw new BadRequestError("PayNow details can't change on a collection.")
    }
  }
  if (old.getString("status") === "open" && e.record.getString("status") === "closed") {
    e.record.set("closed_at", new DateTime())
  }
  e.next()
}, "collections")

// ---- payers ----------------------------------------------------------------------------

onRecordCreate((e) => {
  const plspay = require(`${__hooks}/plspay.js`)
  let collection
  try {
    collection = e.app.findRecordById("collections", e.record.getString("collection"))
  } catch (_) {
    throw new BadRequestError("Collection not found.")
  }
  e.record.set("owner", collection.getString("owner"))
  e.record.set("token", plspay.newToken())
  e.record.set("status", "waiting")
  e.record.set("revoked", false)
  e.record.set("claimed_at", "")
  e.record.set("paid_at", "")
  e.next()
}, "payers")

onRecordUpdate((e) => {
  const old = e.record.original()
  if (e.record.getString("collection") !== old.getString("collection")) {
    throw new BadRequestError("A payer can't move to another collection.")
  }
  e.record.set("owner", old.getString("owner"))
  if (old.getBool("revoked") && !e.record.getBool("revoked")) {
    // Reissue: a revoked payer that comes back always gets a new link. (AC-F06-05)
    e.record.set("token", require(`${__hooks}/plspay.js`).newToken())
  } else if (e.record.getString("token") !== old.getString("token")) {
    throw new BadRequestError("A payer's link can't change unless it was revoked.")
  }
  e.next()
}, "payers")

// ---- profiles --------------------------------------------------------------------------

onRecordValidate((e) => {
  const plspay = require(`${__hooks}/plspay.js`)
  if (!plspay.paynowIdValid(e.record.getString("paynow_type"), e.record.getString("paynow_id"))) {
    throw new BadRequestError("Invalid PayNow ID.", {
      paynow_id: new ValidationError("validation_paynow_format", "The PayNow ID doesn't match its type."),
    })
  }
  e.next()
}, "profiles")

// SEC-05 / AC-F02-03: the only way an organiser changes their PayNow details. The current
// password is checked on this very request. Rate limited per IP (see onBootstrap below).
routerAdd("POST", "/api/plspay/profile", (e) => {
  const body = e.requestInfo().body || {}
  if (typeof body.password !== "string" || !e.auth.validatePassword(body.password)) {
    throw new ForbiddenError("Wrong password.")
  }
  let profile
  try {
    profile = e.app.findFirstRecordByData("profiles", "owner", e.auth.id)
  } catch (_) {
    throw new NotFoundError()
  }
  for (const field of ["display_name", "paynow_type", "paynow_id", "whatsapp"]) {
    if (typeof body[field] === "string") profile.set(field, body[field])
  }
  e.app.save(profile)
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))

// ---- payer routes (public) -------------------------------------------------------------

// The payer's own payment, or the same 404 for every link that doesn't work. (get_payment)
routerAdd("POST", "/api/plspay/payment", (e) => {
  const plspay = require(`${__hooks}/plspay.js`)
  const live = plspay.findLivePayer(e.app, (e.requestInfo().body || {}).token)
  if (!live) return e.json(404, plspay.GONE)
  return e.json(200, plspay.paymentView(live.payer, live.collection))
})

// waiting -> claimed, once. (claim_payment, AC-F04-07) Check and write happen in one
// transaction; PocketBase runs write transactions one at a time, so of two racing claims
// exactly one sees "waiting". ok:false for everything else, whatever the reason.
routerAdd("POST", "/api/plspay/claim", (e) => {
  const plspay = require(`${__hooks}/plspay.js`)
  const token = (e.requestInfo().body || {}).token
  let ok = false
  e.app.runInTransaction((txApp) => {
    const live = plspay.findLivePayer(txApp, token)
    if (!live || live.payer.getString("status") !== "waiting") return
    live.payer.set("status", "claimed")
    live.payer.set("claimed_at", new DateTime())
    txApp.save(live.payer)
    ok = true
  })
  return e.json(200, { ok: ok })
})

// ---- organiser route -------------------------------------------------------------------

// A collection and all its payers in one transaction: either everything is saved or nothing.
// The owner is always the caller. Amounts and references are computed by the app
// (src/app/app/new/actions.ts); the unique indexes refuse duplicates (AC-F03-03, AC-F03-05)
// and the hooks above do the snapshot, owner and token.
routerAdd("POST", "/api/plspay/collections", (e) => {
  const plspay = require(`${__hooks}/plspay.js`)
  const body = e.requestInfo().body || {}
  const payers = []
  if (body.payers && typeof body.payers === "object" && typeof body.payers.length === "number") {
    for (let i = 0; i < body.payers.length; i++) payers.push(body.payers[i] || {})
  }
  if (payers.length < 1 || payers.length > plspay.MAX_PAYERS) { // AC-F03-08
    throw new BadRequestError("Add between 1 and " + plspay.MAX_PAYERS + " payers.")
  }

  let id = ""
  e.app.runInTransaction((txApp) => {
    const collection = new Record(txApp.findCollectionByNameOrId("collections"))
    collection.set("owner", e.auth.id)
    collection.set("title", String(body.title || ""))
    collection.set("kind", String(body.kind || ""))
    collection.set("expires_at", String(body.expires_at || ""))
    txApp.save(collection)

    const payersCollection = txApp.findCollectionByNameOrId("payers")
    for (const p of payers) {
      const payer = new Record(payersCollection)
      payer.set("collection", collection.id)
      payer.set("first_name", String(p.first_name || ""))
      payer.set("whatsapp", String(p.whatsapp || ""))
      payer.set("amount_cents", Number(p.amount_cents) || 0)
      payer.set("reference", String(p.reference || ""))
      txApp.save(payer)
    }
    id = collection.id
  })
  return e.json(200, { id: id })
}, $apis.requireAuth("users"))

// ---- retention -------------------------------------------------------------------------

// AC-F06-04: daily at 19:15 UTC (03:15 SGT). Run it by hand from the admin UI
// (Settings > Crons) or POST /api/crons/purge_old_collections as a superuser.
cronAdd("purge_old_collections", "15 19 * * *", () => {
  const count = require(`${__hooks}/plspay.js`).purgeOldCollections($app)
  console.log("[plspay] purge_old_collections deleted " + count + " collection(s)")
})

// ---- rate limits -----------------------------------------------------------------------

// PocketBase applies the FIRST rule that matches, so plspay's rules go before its default
// "/api/" rule. Re-applied on every start (like settings_from_env.pb.js), only saved on change.
// The limiter keys on CF-Connecting-IP (settings_from_env.pb.js); the Next app forwards the
// visitor's IP in that header.
onBootstrap((e) => {
  e.next()

  const wanted = [
    // SEC-05: each call checks a password, and PocketBase's own auth limit doesn't cover it.
    { label: "/api/plspay/profile", audience: "", maxRequests: 5, duration: 60 },
    // SEC-03 backstop for direct calls that skip the app (which allows 30 per minute itself).
    { label: "/api/plspay/", audience: "", maxRequests: 60, duration: 60 },
  ]
  const s = e.app.settings().clone()
  const current = s.rateLimits.rules || []
  const same = wanted.every((w, i) => {
    const r = current[i]
    return r && r.label === w.label && r.audience === w.audience && r.maxRequests === w.maxRequests && r.duration === w.duration
  })
  if (same) return

  const labels = wanted.map((w) => w.label)
  const rest = []
  for (const r of current) {
    if (labels.indexOf(r.label) === -1) {
      rest.push({ label: r.label, audience: r.audience, maxRequests: r.maxRequests, duration: r.duration })
    }
  }
  s.rateLimits.rules = wanted.concat(rest)
  try {
    e.app.save(s)
    console.log("[plspay] rate limit rules updated")
  } catch (err) {
    console.error("[plspay] ERROR: could not save rate limit rules: " + err)
    try { $app.logger().error("[plspay] could not save rate limit rules: " + err) } catch (_) {}
  }
})
