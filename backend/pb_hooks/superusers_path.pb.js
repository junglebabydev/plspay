/// <reference path="../pb_data/types.d.ts" />

// Superuser login must only be reachable at /api/collections/_superusers/..., the exact path
// that Cloudflare Access protects. PocketBase itself also accepts the collection's id
// (pbc_3142635823), any upper/lower case spelling of the name and a percent-encoded name,
// which an Access path rule may not match. These hooks refuse the superuser login, OTP and
// password-reset actions unless the request used exactly that path. (The admin UI always
// uses it for these actions.)
//
// Scoped hooks rather than a global routerUse middleware, so other requests don't run any JS.
// Each handler is self-contained: JSVM recompiles it on its own, without this file's scope.
// In these events the request is at e.requestEvent.request (e.request is undefined in 0.40.5).

const canonicalOnly = (e) => {
  const req = e.request || e.requestEvent.request
  if (!req.url.escapedPath().startsWith("/api/collections/_superusers/")) throw new NotFoundError()
  e.next()
}

onRecordAuthWithPasswordRequest(canonicalOnly, "_superusers") // runs before the password check
onRecordRequestOTPRequest(canonicalOnly, "_superusers") // before an OTP is created or mailed
onRecordAuthWithOTPRequest(canonicalOnly, "_superusers") // (needs an OTP id from the above)
onRecordAuthWithOAuth2Request(canonicalOnly, "_superusers")

// PocketBase answers 204 for an unknown email without running this hook, so answer the same
// way here (and send nothing): a 404 would tell which superuser emails exist.
onRecordRequestPasswordResetRequest((e) => {
  const req = e.request || e.requestEvent.request
  if (!req.url.escapedPath().startsWith("/api/collections/_superusers/")) return e.noContent(204)
  e.next()
}, "_superusers")
