/// <reference path="../pb_data/types.d.ts" />

// PlsPay schema: profiles, collections, payers (PocketBase v0.40.x JS migration API).
// Security contract: docs/SPEC.md section 3. Proven by tests/backend/*.test.ts.
//
//  - Organisers reach only their own rows. Every rule starts with `@request.auth.id != ""`,
//    so anonymous list/view returns nothing and anonymous writes are refused (SEC-01, SEC-02).
//  - Payers never read these collections. They go through the two public routes in
//    pb_hooks/plspay.pb.js, which take an opaque payer token and nothing else.
//  - Fields only the server sets, in pb_hooks/plspay.pb.js:
//      collections.payee_name / paynow_type / paynow_id  copied from the profile, then frozen
//      collections.closed_at                              stamped on close
//      payers.owner / token                               from the collection / random
//  - PayNow details on a profile change only through POST /api/plspay/profile, which checks
//    the organiser's password (SEC-05). The generic update rule refuses them.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  // Supabase only let an admin delete an auth user; keep it that way.
  users.deleteRule = null
  app.save(users)

  const authed = '@request.auth.id != ""'
  const own = `${authed} && owner = @request.auth.id`
  const createOwn = `${authed} && @request.body.owner = @request.auth.id`
  const keepOwner = "(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)"

  // Deleting an organiser removes their profile, collections and payers (Supabase: on delete cascade).
  const ownerField = { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true }
  // Collections created in code get only "id"; timestamps must be declared.
  const created = { name: "created", type: "autodate", onCreate: true, onUpdate: false }
  const updated = { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
  const sgMobile = "^\\+65[89][0-9]{7}$" // E.164, as src/lib/validate.ts stores it

  // PROFILES: one per organiser.
  const profiles = new Collection({
    type: "base",
    name: "profiles",
    listRule: own,
    viewRule: own,
    createRule: createOwn,
    updateRule: `${own} && ${keepOwner} && @request.body.paynow_type:changed = false && @request.body.paynow_id:changed = false`,
    // No delete: delete-and-recreate would change PayNow details without the password.
    deleteRule: null,
    fields: [
      ownerField,
      { name: "display_name", type: "text", required: true, min: 1, max: 40, presentable: true },
      { name: "paynow_type", type: "select", required: true, maxSelect: 1, values: ["mobile", "uen"] },
      // The per-type format (mobile vs UEN) is checked in pb_hooks/plspay.pb.js.
      { name: "paynow_id", type: "text", required: true, max: 10, pattern: "^([89][0-9]{7}|[0-9A-Z]{9,10})$" },
      { name: "whatsapp", type: "text", max: 12, pattern: sgMobile },
      created,
      updated,
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_profiles_owner` ON `profiles` (`owner`)"],
  })
  app.save(profiles)

  // COLLECTIONS: PayNow fields are copied from the owner's profile on create and never change.
  const collections = new Collection({
    type: "base",
    name: "collections",
    listRule: own,
    viewRule: own,
    createRule: createOwn,
    updateRule: `${own} && ${keepOwner}`,
    deleteRule: own,
    fields: [
      ownerField,
      { name: "title", type: "text", required: true, min: 1, max: 40, presentable: true },
      { name: "kind", type: "select", required: true, maxSelect: 1, values: ["personal", "business"] },
      { name: "payee_name", type: "text", required: true, max: 40 },
      { name: "paynow_type", type: "select", required: true, maxSelect: 1, values: ["mobile", "uen"] },
      { name: "paynow_id", type: "text", required: true, max: 10 },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["open", "closed"] },
      { name: "expires_at", type: "date", required: true },
      { name: "closed_at", type: "date" },
      created,
      updated,
    ],
    indexes: ["CREATE INDEX `idx_collections_owner` ON `collections` (`owner`)"],
  })
  app.save(collections)

  // PAYERS: one link each. owner always comes from the collection; token is random and changes
  // only when a revoked payer is given a new link.
  const payers = new Collection({
    type: "base",
    name: "payers",
    listRule: own,
    viewRule: own,
    createRule: `${authed} && @request.body.collection.owner = @request.auth.id && ${keepOwner}`,
    updateRule: `${own} && @request.body.collection:isset = false && @request.body.owner:isset = false && @request.body.token:isset = false`,
    deleteRule: own,
    fields: [
      { name: "collection", type: "relation", required: true, maxSelect: 1, collectionId: collections.id, cascadeDelete: true },
      ownerField,
      { name: "first_name", type: "text", required: true, min: 1, max: 30 },
      { name: "whatsapp", type: "text", max: 12, pattern: sgMobile },
      { name: "amount_cents", type: "number", required: true, onlyInt: true, min: 1, max: 2147483647 },
      { name: "reference", type: "text", required: true, min: 1, max: 25 },
      { name: "token", type: "text", required: true, min: 24, max: 24, pattern: "^[A-Za-z0-9_-]+$" },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["waiting", "claimed", "paid"] },
      { name: "revoked", type: "bool" }, // not required: a required bool must be true
      { name: "claimed_at", type: "date" },
      { name: "paid_at", type: "date" },
      created,
      updated,
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_payers_token` ON `payers` (`token`)",
      "CREATE UNIQUE INDEX `idx_payers_collection_amount` ON `payers` (`collection`, `amount_cents`)", // AC-F03-03
      "CREATE UNIQUE INDEX `idx_payers_collection_reference` ON `payers` (`collection`, `reference`)", // AC-F03-05
      "CREATE INDEX `idx_payers_owner` ON `payers` (`owner`)",
    ],
  })
  app.save(payers)
}, (app) => {
  for (const name of ["payers", "collections", "profiles"]) {
    app.delete(app.findCollectionByNameOrId(name))
  }
  const users = app.findCollectionByNameOrId("users")
  users.deleteRule = "id = @request.auth.id"
  app.save(users)
})
