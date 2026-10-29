// The access rules (docs/SPEC.md section 3) against a real PocketBase. Replaces supabase/tests/security.test.sql.
import { beforeAll, describe, expect, it } from "vitest";
import { api, asSuperuser, collectionWithPayer, organiser, organiserWithProfile, type Organiser } from "./pb";

const PLSPAY = ["profiles", "collections", "payers"] as const;

let a: Organiser, b: Organiser;
let aCollection: { id: string }, aPayer: { id: string; token: string }, aProfileId: string;

beforeAll(async () => {
  a = await organiserWithProfile("a");
  b = await organiserWithProfile("b", { display_name: "Bob", paynow_id: "87654321" });
  ({ collection: aCollection, payer: aPayer } = await collectionWithPayer(a));
  const p = await api("GET", "/api/collections/profiles/records", { token: a.token });
  aProfileId = p.body.items[0].id;
});

describe("SEC-01 every collection has owner-only rules", () => {
  it("SEC-01 no plspay rule is public, and every rule needs a signed-in user", async () => {
    for (const name of PLSPAY) {
      const c = (await asSuperuser("GET", `/api/collections/${name}`)).body;
      for (const rule of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
        const value = c[rule] as string | null;
        expect(value, `${name}.${rule}`).not.toBe(""); // "" would mean anyone
        if (value !== null) expect(value, `${name}.${rule}`).toContain('@request.auth.id != ""');
      }
    }
  });

  it("SEC-01 users: no public sign-up, no self-delete, each user sees only themselves", async () => {
    const users = (await asSuperuser("GET", "/api/collections/users")).body;
    expect(users.createRule).toBeNull();
    expect(users.deleteRule).toBeNull();
    expect(users.listRule).toBe("id = @request.auth.id");
    expect(users.viewRule).toBe("id = @request.auth.id");
  });
});

describe("SEC-02 anonymous visitors get nothing", () => {
  it("SEC-02 anonymous list of every collection is empty", async () => {
    for (const name of ["users", ...PLSPAY]) {
      const r = await api("GET", `/api/collections/${name}/records`);
      expect(r.status, name).toBe(200);
      expect(r.body.totalItems, name).toBe(0);
    }
  });

  it("SEC-02 anonymous view of a known record is 404", async () => {
    for (const [name, id] of [["users", a.id], ["profiles", aProfileId], ["collections", aCollection.id], ["payers", aPayer.id]]) {
      expect((await api("GET", `/api/collections/${name}/records/${id}`)).status, name).toBe(404);
    }
  });

  it("SEC-02 anonymous filters can't probe payer tokens", async () => {
    const r = await api("GET", `/api/collections/payers/records?filter=${encodeURIComponent(`token='${aPayer.token}'`)}`);
    expect(r.body.totalItems).toBe(0);
  });

  it("SEC-02 anonymous writes are refused", async () => {
    expect((await api("POST", "/api/collections/profiles/records", { json: { owner: a.id, display_name: "x", paynow_type: "mobile", paynow_id: "91234567" } })).status).toBe(400);
    expect((await api("POST", "/api/collections/collections/records", { json: { owner: a.id, title: "x" } })).status).toBe(400);
    expect((await api("POST", "/api/collections/payers/records", { json: { collection: aCollection.id, first_name: "x", amount_cents: 1, reference: "X" } })).status).toBe(400);
    expect((await api("PATCH", `/api/collections/payers/records/${aPayer.id}`, { json: { status: "paid" } })).status).toBe(404);
    expect((await api("PATCH", `/api/collections/collections/records/${aCollection.id}`, { json: { status: "closed" } })).status).toBe(404);
    expect((await api("DELETE", `/api/collections/collections/records/${aCollection.id}`)).status).toBe(404);
    expect((await api("DELETE", `/api/collections/payers/records/${aPayer.id}`)).status).toBe(404);
  });

  it("SEC-02 the organiser-only routes need a signed-in organiser", async () => {
    expect((await api("POST", "/api/plspay/collections", { json: { title: "x", payers: [{ first_name: "x", amount_cents: 1, reference: "X" }] } })).status).toBe(401);
    expect((await api("POST", "/api/plspay/profile", { json: { password: "x", paynow_id: "81111111" } })).status).toBe(401);
  });

  it("SEC-02 A's data is untouched by all of the above", async () => {
    const p = await api("GET", `/api/collections/payers/records/${aPayer.id}`, { token: a.token });
    expect(p.body.status).toBe("waiting");
    const c = await api("GET", `/api/collections/collections/records/${aCollection.id}`, { token: a.token });
    expect(c.body.status).toBe("open");
  });
});

describe("Organiser B and organiser A", () => {
  it("AC-F05-03 B lists zero of A's collections and payers", async () => {
    for (const name of ["collections", "payers"]) {
      const r = await api("GET", `/api/collections/${name}/records?perPage=500`, { token: b.token });
      expect(r.status).toBe(200);
      expect(r.body.items.some((x: { owner: string }) => x.owner === a.id), name).toBe(false);
    }
  });

  it("AC-F05-03 B can't view, update or delete A's collection or payers", async () => {
    for (const [name, id] of [["collections", aCollection.id], ["payers", aPayer.id]]) {
      expect((await api("GET", `/api/collections/${name}/records/${id}`, { token: b.token })).status, name).toBe(404);
      expect((await api("PATCH", `/api/collections/${name}/records/${id}`, { token: b.token, json: { title: "pwned", status: "paid", revoked: true } })).status, name).toBe(404);
      expect((await api("DELETE", `/api/collections/${name}/records/${id}`, { token: b.token })).status, name).toBe(404);
    }
  });

  it("AC-F05-03 B can't add a payer to A's collection or create rows owned by A", async () => {
    const intoA = await api("POST", "/api/collections/payers/records", { token: b.token, json: { collection: aCollection.id, first_name: "Evil", amount_cents: 999, reference: "EVIL" } });
    expect(intoA.status).toBe(400);
    const ownedByA = await api("POST", "/api/collections/collections/records", { token: b.token, json: { owner: a.id, title: "Mine now" } });
    expect(ownedByA.status).toBe(400);
  });

  it("AC-F05-03 A can't hand a collection to B", async () => {
    const r = await api("PATCH", `/api/collections/collections/records/${aCollection.id}`, { token: a.token, json: { owner: b.id } });
    expect(r.status).toBe(404);
  });

  it("AC-F02-05 B can't read or update A's profile, or create one for A", async () => {
    expect((await api("GET", `/api/collections/profiles/records/${aProfileId}`, { token: b.token })).status).toBe(404);
    const list = await api("GET", "/api/collections/profiles/records", { token: b.token });
    expect(list.body.items.map((x: { owner: string }) => x.owner)).toEqual([b.id]);
    expect((await api("PATCH", `/api/collections/profiles/records/${aProfileId}`, { token: b.token, json: { display_name: "pwned" } })).status).toBe(404);
    const fresh = await organiser("c");
    expect((await api("POST", "/api/collections/profiles/records", { token: fresh.token, json: { owner: a.id, display_name: "x", paynow_type: "mobile", paynow_id: "91234567" } })).status).toBe(400);
    const mine = await api("GET", `/api/collections/profiles/records/${aProfileId}`, { token: a.token });
    expect(mine.body.display_name).toBe("Alice");
  });

  it("AC-F02-05 B can't see A's user record", async () => {
    expect((await api("GET", `/api/collections/users/records/${a.id}`, { token: b.token })).status).toBe(404);
  });
});
