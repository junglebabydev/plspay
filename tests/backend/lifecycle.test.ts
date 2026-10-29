// Revoke, reissue, delete and retention. Replaces supabase/tests/reissue.test.sql and retention.test.sql.
import { beforeAll, describe, expect, it } from "vitest";
import { api, asSuperuser, collection, collectionWithPayer, daysFromNow, organiserWithProfile, payer, payment, type Organiser } from "./pb";

let org: Organiser, other: Organiser;

beforeAll(async () => {
  org = await organiserWithProfile("lifecycle");
  other = await organiserWithProfile("lifecycle-other", { paynow_id: "87654321" });
});

const patchPayer = (o: Organiser, id: string, json: unknown) => api("PATCH", `/api/collections/payers/records/${id}`, { token: o.token, json });
const getPayer = async (id: string) => (await asSuperuser("GET", `/api/collections/payers/records/${id}`)).body;

describe("Reissue", () => {
  it("AC-F06-05 the token can't change on a live payer, through the API or the admin UI", async () => {
    const { payer: p } = await collectionWithPayer(org);
    expect((await patchPayer(org, p.id, { token: "y".repeat(24) })).status).toBe(404);
    const su = await asSuperuser("PATCH", `/api/collections/payers/records/${p.id}`, { token: "y".repeat(24) });
    expect(su.status).toBe(400);
    expect(su.body.message).toBe("A payer's link can't change unless it was revoked.");
    expect((await getPayer(p.id)).token).toBe(p.token);
  });

  it("AC-F06-01 revoking kills the link at once", async () => {
    const { payer: p } = await collectionWithPayer(org);
    expect((await payment(p.token)).status).toBe(200);
    expect((await patchPayer(org, p.id, { revoked: true })).status).toBe(200);
    expect((await payment(p.token)).status).toBe(404);
  });

  it("AC-F06-05 another organiser can't reissue", async () => {
    const { payer: p } = await collectionWithPayer(org);
    await patchPayer(org, p.id, { revoked: true });
    expect((await patchPayer(other, p.id, { revoked: false })).status).toBe(404);
    const row = await getPayer(p.id);
    expect(row.revoked).toBe(true);
    expect(row.token).toBe(p.token);
  });

  it("AC-F06-05 AC-F06-01 the owner reissues a revoked payer: new token, no longer revoked, old link stays dead", async () => {
    const { payer: p } = await collectionWithPayer(org);
    await patchPayer(org, p.id, { revoked: true });
    const r = await patchPayer(org, p.id, { revoked: false });
    expect(r.status).toBe(200);
    expect(r.body.revoked).toBe(false);
    expect(r.body.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(r.body.token).not.toBe(p.token);
    expect((await payment(r.body.token)).status).toBe(200);
    expect((await payment(p.token)).status).toBe(404);
  });

  it("AC-F06-05 reissue does nothing for a live payer", async () => {
    const { payer: p } = await collectionWithPayer(org);
    const r = await patchPayer(org, p.id, { revoked: false });
    expect(r.status).toBe(200);
    expect(r.body.token).toBe(p.token);
  });

  it("AC-F06-05 a payer can't be moved to another collection", async () => {
    const { payer: p } = await collectionWithPayer(org);
    const { collection: c2 } = await collectionWithPayer(org);
    expect((await patchPayer(org, p.id, { collection: c2.id })).status).toBe(404);
    expect((await asSuperuser("PATCH", `/api/collections/payers/records/${p.id}`, { collection: c2.id })).status).toBe(400);
  });
});

describe("Delete", () => {
  it("AC-F06-03 deleting a collection removes it and its payers immediately", async () => {
    const { collection: c, payer: p } = await collectionWithPayer(org);
    const p2 = (await payer(org, c.id, { amount_cents: 1, reference: "SECOND" })).body;
    expect((await api("DELETE", `/api/collections/collections/records/${c.id}`, { token: org.token })).status).toBe(204);
    expect((await asSuperuser("GET", `/api/collections/collections/records/${c.id}`)).status).toBe(404);
    for (const id of [p.id, p2.id]) expect((await asSuperuser("GET", `/api/collections/payers/records/${id}`)).status).toBe(404);
    expect((await payment(p.token)).status).toBe(404);
  });
});

describe("Retention", () => {
  it("AC-F06-04 the nightly job deletes collections closed or expired over 90 days ago, with their payers, and keeps the rest", async () => {
    const ancient = await collectionWithPayer(org, { title: "Ancient", expires_at: daysFromNow(-91) });
    const recent = (await collection(org, { title: "Recent", expires_at: daysFromNow(-10) })).body;
    const open = (await collection(org, { title: "Open" })).body;

    // Closed 91 days ago (closed_at is stamped on close, then backdated by a superuser).
    const closedLongAgo = (await collection(org, { title: "Closed long ago" })).body;
    await api("PATCH", `/api/collections/collections/records/${closedLongAgo.id}`, { token: org.token, json: { status: "closed" } });
    await asSuperuser("PATCH", `/api/collections/collections/records/${closedLongAgo.id}`, { closed_at: daysFromNow(-91) });
    // Expired long ago but closed just now: closed_at wins, so it stays (coalesce(closed_at, expires_at)).
    const closedNow = (await collection(org, { title: "Closed now", expires_at: daysFromNow(-100) })).body;
    await api("PATCH", `/api/collections/collections/records/${closedNow.id}`, { token: org.token, json: { status: "closed" } });

    // The job, run by hand the way an admin would (Settings > Crons in the admin UI).
    // PocketBase answers 204 at once and runs the job in the background, so wait for it.
    const run = await asSuperuser("POST", "/api/crons/purge_old_collections");
    expect(run.status).toBe(204);
    const exists = async (id: string) => (await asSuperuser("GET", `/api/collections/collections/records/${id}`)).status === 200;
    for (let i = 0; i < 50 && (await exists(ancient.collection.id)); i++) await new Promise((r) => setTimeout(r, 100));
    expect(await exists(ancient.collection.id)).toBe(false);
    expect(await exists(closedLongAgo.id)).toBe(false);
    expect((await asSuperuser("GET", `/api/collections/payers/records/${ancient.payer.id}`)).status).toBe(404);
    expect(await exists(recent.id)).toBe(true);
    expect(await exists(open.id)).toBe(true);
    expect(await exists(closedNow.id)).toBe(true);
  });

  it("AC-F06-04 the job runs nightly at 03:15 Singapore time", async () => {
    const crons = (await asSuperuser("GET", "/api/crons")).body as { id: string; expression: string }[];
    expect(crons.find((c) => c.id === "purge_old_collections")?.expression).toBe("15 19 * * *");
  });
});
