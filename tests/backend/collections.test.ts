// Collections and payers: snapshot, freeze, uniqueness, owner and token rules. Replaces parts of
// supabase/tests/security.test.sql and kind.test.sql.
import { beforeAll, describe, expect, it } from "vitest";
import { api, asSuperuser, collection, collectionWithPayer, organiser, organiserWithProfile, payer, superuserToken, type Organiser } from "./pb";

let org: Organiser, other: Organiser;

beforeAll(async () => {
  org = await organiserWithProfile("collections", { display_name: "Alice", paynow_id: "91234567" });
  other = await organiserWithProfile("collections-other", { display_name: "Bob", paynow_id: "87654321" });
});

const route = (o: Organiser, body: unknown) => api("POST", "/api/plspay/collections", { token: o.token, json: body });
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ first_name: `P${i}`, amount_cents: 1000 + i, reference: `TRIP-P${i}` }));

describe("AC-F03-06 snapshot of the organiser's PayNow details", () => {
  it("AC-F03-06 a new collection copies payee name and PayNow from the profile; client values are ignored", async () => {
    const r = await collection(org, { payee_name: "Spoof", paynow_type: "uen", paynow_id: "80000000", status: "closed", closed_at: "2020-01-01T00:00:00Z" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ payee_name: "Alice", paynow_type: "mobile", paynow_id: "91234567", status: "open", closed_at: "" });
  });

  it("AC-F03-06 an organiser without a profile can't create a collection", async () => {
    const bare = await organiser("no-profile");
    const r = await collection(bare);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("Set up your PayNow profile first.");
  });

  it("AC-F03-06 payer owner comes from the collection, and every payer gets its own 24-character token", async () => {
    const { collection: c } = await collectionWithPayer(org);
    const p = await api("POST", "/api/collections/payers/records", {
      token: await superuserToken(),
      json: { collection: c.id, owner: other.id, first_name: "Kai", amount_cents: 777, reference: "KAI", token: "x".repeat(24), status: "paid", revoked: true },
    });
    expect(p.status).toBe(200);
    expect(p.body.owner).toBe(org.id);
    expect(p.body.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(p.body.token).not.toBe("x".repeat(24));
    expect(p.body).toMatchObject({ status: "waiting", revoked: false });
    const all = (await api("GET", `/api/collections/payers/records?filter=${encodeURIComponent(`collection='${c.id}'`)}`, { token: org.token })).body.items;
    expect(new Set(all.map((x: { token: string }) => x.token)).size).toBe(all.length);
  });
});

describe("AC-F02-04 PayNow details are frozen on a collection", () => {
  it("AC-F02-04 the owner can't change payee name, PayNow type or ID on a collection", async () => {
    const { collection: c } = await collectionWithPayer(org);
    for (const change of [{ paynow_id: "99999999" }, { paynow_type: "uen" }, { payee_name: "Mallory" }]) {
      const r = await api("PATCH", `/api/collections/collections/records/${c.id}`, { token: org.token, json: change });
      expect(r.status, JSON.stringify(change)).toBe(400);
      expect(r.body.message).toBe("PayNow details can't change on a collection.");
    }
  });

  it("AC-F02-04 not even a superuser in the admin UI can change them", async () => {
    const { collection: c } = await collectionWithPayer(org);
    const r = await asSuperuser("PATCH", `/api/collections/collections/records/${c.id}`, { paynow_id: "99999999" });
    expect(r.status).toBe(400);
  });

  it("AC-F02-04 changing the profile's PayNow later leaves existing collections alone", async () => {
    const o = await organiserWithProfile("freeze", { display_name: "Old Name", paynow_id: "91110000" });
    const { collection: c, payer: p } = await collectionWithPayer(o);
    const changed = await api("POST", "/api/plspay/profile", { token: o.token, json: { password: o.password, display_name: "New Name", paynow_type: "mobile", paynow_id: "82220000" } });
    expect(changed.status).toBe(200);
    const after = (await api("GET", `/api/collections/collections/records/${c.id}`, { token: o.token })).body;
    expect(after).toMatchObject({ payee_name: "Old Name", paynow_id: "91110000" });
    const pay = (await api("POST", "/api/plspay/payment", { json: { token: p.token } })).body;
    expect(pay).toMatchObject({ payee_name: "Old Name", paynow_id: "91110000" });
    const fresh = (await collection(o)).body;
    expect(fresh).toMatchObject({ payee_name: "New Name", paynow_id: "82220000" });
  });

  it("AC-F06-02 closing stamps closed_at", async () => {
    const { collection: c } = await collectionWithPayer(org);
    const r = await api("PATCH", `/api/collections/collections/records/${c.id}`, { token: org.token, json: { status: "closed" } });
    expect(r.status).toBe(200);
    expect(r.body.closed_at).not.toBe("");
  });
});

describe("Uniqueness within a collection", () => {
  it("AC-F03-03 two payers in one collection can't share an amount", async () => {
    const { collection: c } = await collectionWithPayer(org, {}, { amount_cents: 2500, reference: "DINN-PRIYA" });
    const dup = await payer(org, c.id, { first_name: "Dup", amount_cents: 2500, reference: "DINN-DUP" });
    expect(dup.status).toBe(400);
    expect(dup.body.data.amount_cents?.code).toBe("validation_not_unique");
    const elsewhere = await collectionWithPayer(org, {}, { amount_cents: 2500 }); // other collections are fine
    expect(elsewhere.payer.amount_cents).toBe(2500);
  });

  it("AC-F03-05 two payers in one collection can't share a reference, and references are 25 characters max", async () => {
    const { collection: c } = await collectionWithPayer(org, {}, { reference: "DINN-PRIYA" });
    expect((await payer(org, c.id, { amount_cents: 1, reference: "DINN-PRIYA" })).status).toBe(400);
    expect((await payer(org, c.id, { amount_cents: 2, reference: "X".repeat(26) })).status).toBe(400);
    expect((await payer(org, c.id, { amount_cents: 3, reference: "X".repeat(25) })).status).toBe(200);
  });

  it("AC-F03-02 amounts are whole cents above zero", async () => {
    const { collection: c } = await collectionWithPayer(org);
    expect((await payer(org, c.id, { amount_cents: 0 })).status).toBe(400);
    expect((await payer(org, c.id, { amount_cents: -5 })).status).toBe(400);
    expect((await payer(org, c.id, { amount_cents: 12.5 })).status).toBe(400);
  });
});

describe("Collection kind", () => {
  it("AC-F03-09 kind defaults to personal, business is stored, anything else is refused", async () => {
    expect((await collection(org)).body.kind).toBe("personal");
    expect((await collection(org, { kind: "business" })).body.kind).toBe("business");
    expect((await collection(org, { kind: "charity" })).status).toBe(400);
  });

  it("AC-F05-06 the owner sees kind on their collections", async () => {
    await collection(org, { kind: "business", title: "Shop" });
    const r = await api("GET", `/api/collections/collections/records?filter=${encodeURIComponent("kind='business'")}`, { token: org.token });
    expect(r.body.totalItems).toBeGreaterThan(0);
    expect(r.body.items.every((x: { owner: string; kind: string }) => x.owner === org.id && x.kind === "business")).toBe(true);
  });

  it("AC-F03-07 expiry defaults to 30 days", async () => {
    const c = (await collection(org)).body;
    const days = (new Date(c.expires_at.replace(" ", "T")).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });
});

describe("POST /api/plspay/collections (create in one go)", () => {
  it("AC-F03-06 creates the collection and payers for the caller, ignoring any owner in the body", async () => {
    const r = await route(org, { owner: other.id, title: "Trip", kind: "business", expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), payers: rows(3) });
    expect(r.status).toBe(200);
    const c = (await api("GET", `/api/collections/collections/records/${r.body.id}`, { token: org.token })).body;
    expect(c).toMatchObject({ owner: org.id, title: "Trip", kind: "business", payee_name: "Alice" });
    const ps = (await api("GET", `/api/collections/payers/records?filter=${encodeURIComponent(`collection='${r.body.id}'`)}`, { token: org.token })).body;
    expect(ps.totalItems).toBe(3);
    expect(ps.items.every((p: { owner: string; token: string }) => p.owner === org.id && p.token.length === 24)).toBe(true);
  });

  it("AC-F03-03 one bad payer saves nothing at all", async () => {
    const before = (await api("GET", "/api/collections/collections/records?perPage=1", { token: org.token })).body.totalItems;
    const bad = rows(3);
    bad[2]!.amount_cents = bad[0]!.amount_cents; // duplicate amount
    const r = await route(org, { title: "Broken", payers: bad });
    expect(r.status).toBe(400);
    const after = (await api("GET", "/api/collections/collections/records?perPage=1", { token: org.token })).body.totalItems;
    expect(after).toBe(before);
  });

  it("AC-F03-08 refuses 0 or more than 50 payers, and takes 50", async () => {
    expect((await route(org, { title: "None", payers: [] })).status).toBe(400);
    expect((await route(org, { title: "Many", payers: rows(51) })).status).toBe(400);
    expect((await route(org, { title: "Fifty", payers: rows(50) })).status).toBe(200);
  });

  it("AC-F03-06 needs a profile", async () => {
    const bare = await organiser("route-no-profile");
    const r = await route(bare, { title: "x", payers: rows(1) });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("Set up your PayNow profile first.");
  });
});
