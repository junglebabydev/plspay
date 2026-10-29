// The public payer routes, the only way anonymous visitors reach data. Replaces get_payment/claim_payment
// checks in supabase/tests/security.test.sql.
import { beforeAll, describe, expect, it } from "vitest";
import { api, asSuperuser, claim, collectionWithPayer, daysFromNow, organiserWithProfile, payer, payment, randomIp, type Organiser } from "./pb";

let org: Organiser;
let valid: { id: string; token: string }, revoked: { token: string }, closed: { token: string }, expired: { token: string };

beforeAll(async () => {
  org = await organiserWithProfile("payer-routes", { display_name: "Alice", whatsapp: "+6590001111" });
  const dinner = await collectionWithPayer(org, { title: "Dinner" }, { first_name: "Priya", amount_cents: 2500, reference: "DINN-PRIYA", whatsapp: "+6591112222" });
  valid = dinner.payer;
  const ravi = await payer(org, dinner.collection.id, { first_name: "Ravi", amount_cents: 2501, reference: "DINN-RAVI" });
  await api("PATCH", `/api/collections/payers/records/${ravi.body.id}`, { token: org.token, json: { revoked: true } });
  revoked = ravi.body;
  const shut = await collectionWithPayer(org, { title: "Closed" });
  await api("PATCH", `/api/collections/collections/records/${shut.collection.id}`, { token: org.token, json: { status: "closed" } });
  closed = shut.payer;
  expired = (await collectionWithPayer(org, { title: "Old", expires_at: daysFromNow(-1) })).payer;
});

describe("POST /api/plspay/payment", () => {
  it("AC-F04-01 a valid token returns title, amount, payee, PayNow details and reference", async () => {
    const r = await payment(valid.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      title: "Dinner", payee_name: "Alice", paynow_type: "mobile", paynow_id: "91234567",
      amount_cents: 2500, reference: "DINN-PRIYA", status: "waiting",
    });
    expect(new Date(r.body.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("AC-F04-03 the answer holds only the payer's own payment: no names, phones, other payers or totals", async () => {
    const r = await payment(valid.token);
    expect(Object.keys(r.body).sort()).toEqual(["amount_cents", "expires_at", "payee_name", "paynow_id", "paynow_type", "reference", "status", "title"]);
    const text = JSON.stringify(r.body);
    for (const leak of ["Priya", "Ravi", "+6591112222", "+6590001111", "2501", valid.id]) expect(text).not.toContain(leak);
  });

  it("AC-F04-04 invalid, malformed, missing and expired tokens get the same 404", async () => {
    const answers = await Promise.all([payment("A".repeat(24)), payment("../../etc/passwd"), payment(undefined), payment(expired.token)]);
    for (const r of answers) expect(r.status).toBe(404);
    expect(new Set(answers.map((r) => JSON.stringify(r.body))).size).toBe(1);
  });

  it("AC-F06-01 a revoked token gets the same 404", async () => {
    const r = await payment(revoked.token);
    expect(r.status).toBe(404);
    expect(r.body).toEqual((await payment("A".repeat(24))).body);
  });

  it("AC-F06-02 a token in a closed collection gets the same 404", async () => {
    const r = await payment(closed.token);
    expect(r.status).toBe(404);
    expect(r.body).toEqual((await payment("A".repeat(24))).body);
  });

  it("AC-F04-04 a payer record id is not a token: rows are never reachable by id", async () => {
    expect((await payment(valid.id)).status).toBe(404);
    expect((await claim(valid.id)).body.ok).toBe(false);
  });
});

describe("POST /api/plspay/claim", () => {
  it("AC-F04-07 the first claim moves waiting to claimed; a second changes nothing", async () => {
    const { payer: p } = await collectionWithPayer(org);
    expect((await claim(p.token)).body).toEqual({ ok: true });
    expect((await claim(p.token)).body).toEqual({ ok: false });
    const row = (await api("GET", `/api/collections/payers/records/${p.id}`, { token: org.token })).body;
    expect(row.status).toBe("claimed");
    expect(row.claimed_at).not.toBe("");
    expect((await payment(p.token)).body.status).toBe("claimed");
  });

  it("AC-F04-07 of 20 simultaneous claims exactly one succeeds", async () => {
    const { payer: p } = await collectionWithPayer(org);
    const results = await Promise.all(Array.from({ length: 20 }, () => claim(p.token)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.ok === true)).toHaveLength(1);
  });

  it("AC-F04-07 the payer can never set paid, and a paid payer can't be claimed", async () => {
    const { payer: p } = await collectionWithPayer(org);
    expect((await api("PATCH", `/api/collections/payers/records/${p.id}`, { json: { status: "paid" } })).status).toBe(404);
    await api("PATCH", `/api/collections/payers/records/${p.id}`, { token: org.token, json: { status: "paid" } });
    expect((await claim(p.token)).body.ok).toBe(false);
    expect((await api("GET", `/api/collections/payers/records/${p.id}`, { token: org.token })).body.status).toBe("paid");
  });

  it("AC-F06-01 AC-F06-02 AC-F04-04 revoked, closed, expired and unknown tokens can't claim", async () => {
    for (const t of [revoked.token, closed.token, expired.token, "B".repeat(24), "", 42]) {
      expect((await claim(t)).body.ok).toBe(false);
    }
    const rows = (await asSuperuser("GET", `/api/collections/payers/records?filter=${encodeURIComponent(`owner='${org.id}' && status='claimed' && (revoked=true || collection.status='closed' || collection.expires_at < @now)`)}`)).body;
    expect(rows.totalItems).toBe(0);
  });
});

describe("Rate limit in PocketBase", () => {
  it("SEC-03 AC-F04-08 direct calls to the payer routes are limited per IP (60 a minute) even without the app", async () => {
    const ip = randomIp();
    const codes: number[] = [];
    for (let i = 0; i < 61; i++) codes.push((await payment("C".repeat(24), ip)).status);
    expect(codes.slice(0, 60).every((c) => c === 404)).toBe(true);
    expect(codes[60]).toBe(429);
    expect((await claim("D".repeat(24), ip)).status).toBe(429); // same bucket for every /api/plspay/ route
    expect((await payment(valid.token, randomIp())).status).toBe(200); // other visitors unaffected
  });
});
