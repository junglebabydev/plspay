/// <reference path="../pb_data/types.d.ts" />

// Helpers for plspay.pb.js. This file is not a hook itself (no .pb.js suffix).
// Each handler loads it inside its body (JSVM handlers can't see top-level variables):
//   const plspay = require(`${__hooks}/plspay.js`)

// 24 chars from the base64url alphabet: 144 random bits, like Supabase's
// encode(gen_random_bytes(18), 'base64') with +/ swapped for -_. (SPEC section 4)
const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const TOKEN_RE = /^[A-Za-z0-9_-]{24}$/
const PAYNOW_MOBILE_RE = /^[89][0-9]{7}$/
const PAYNOW_UEN_RE = /^[0-9A-Z]{9,10}$/

const DEFAULT_EXPIRY_DAYS = 30 // AC-F03-07
const RETENTION_DAYS = 90 // AC-F06-04
const MAX_PAYERS = 50 // AC-F03-08

// The app (src/app/app/new/actions.ts) recognises this message.
const PROFILE_REQUIRED = "Set up your PayNow profile first."

// The same body for invalid, revoked, closed and expired links, so nobody can tell them apart. (AC-F04-04)
const GONE = { message: "This link no longer works." }

function newToken() {
  return $security.randomStringWithAlphabet(24, TOKEN_ALPHABET)
}

// AC-F02-02: the PayNow ID must match its type.
function paynowIdValid(type, id) {
  if (type === "mobile") return PAYNOW_MOBILE_RE.test(id)
  if (type === "uen") return PAYNOW_UEN_RE.test(id)
  return false
}

// AC-F03-06: a new collection copies the payee name and PayNow details from its owner's
// profile. Whatever the client sent for those fields is overwritten.
function snapshotPayNow(app, collection) {
  let profile
  try {
    profile = app.findFirstRecordByData("profiles", "owner", collection.getString("owner"))
  } catch (_) {
    throw new BadRequestError(PROFILE_REQUIRED)
  }
  collection.set("payee_name", profile.getString("display_name"))
  collection.set("paynow_type", profile.getString("paynow_type"))
  collection.set("paynow_id", profile.getString("paynow_id"))
}

// The payer with exactly this token, plus its collection, while the link works: not revoked,
// collection open and not expired. Otherwise null. Malformed tokens never reach the database.
function findLivePayer(app, token) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null
  let payer, collection
  try {
    payer = app.findFirstRecordByData("payers", "token", token)
    collection = app.findRecordById("collections", payer.getString("collection"))
  } catch (_) {
    return null
  }
  if (payer.getBool("revoked")) return null
  if (collection.getString("status") !== "open") return null
  if (!collection.getDateTime("expires_at").after(new DateTime())) return null
  return { payer, collection }
}

// PocketBase stores dates as "2006-01-02 15:04:05.000Z"; hand out ISO 8601.
function isoDate(dateTime) {
  return dateTime.isZero() ? "" : dateTime.string().replace(" ", "T")
}

// What a payer may see about their own payment, and nothing else. (SPEC section 3)
function paymentView(payer, collection) {
  return {
    title: collection.getString("title"),
    payee_name: collection.getString("payee_name"),
    paynow_type: collection.getString("paynow_type"),
    paynow_id: collection.getString("paynow_id"),
    amount_cents: payer.getInt("amount_cents"),
    reference: payer.getString("reference"),
    status: payer.getString("status"),
    expires_at: isoDate(collection.getDateTime("expires_at")),
  }
}

// AC-F06-04: deletes collections closed or expired more than 90 days ago, in one transaction.
// Payers go with them (cascadeDelete). Returns the number of collections deleted.
function purgeOldCollections(app) {
  const cutoff = new DateTime().addDate(0, 0, -RETENTION_DAYS).string()
  let count = 0
  app.runInTransaction((txApp) => {
    // Empty dates are "", which sorts before any date: test closed_at for emptiness first.
    const old = txApp.findRecordsByFilter(
      "collections",
      "(closed_at != '' && closed_at < {:cutoff}) || (closed_at = '' && expires_at < {:cutoff})",
      "", 0, 0, { cutoff: cutoff })
    for (const record of old) {
      txApp.delete(record)
      count++
    }
  })
  return count
}

module.exports = {
  DEFAULT_EXPIRY_DAYS,
  MAX_PAYERS,
  GONE,
  newToken,
  paynowIdValid,
  snapshotPayNow,
  findLivePayer,
  paymentView,
  purgeOldCollections,
}
