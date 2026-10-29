/// <reference path="../pb_data/types.d.ts" />

// Initial schema (PocketBase v0.40.x JS migration API), from project-template.
// Lock the default "users" auth collection: no public sign-up.
// Users are created by a superuser in the admin UI (/_/).
// (The template's demo "items" collection was removed before plspay's first deploy.
// plspay's own collections are in the next migration.)
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.createRule = null // null = superusers only
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.createRule = "" // PocketBase's default: public sign-up
  app.save(users)
})
