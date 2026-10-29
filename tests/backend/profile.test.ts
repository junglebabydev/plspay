// PayNow profile: format rules and the password check for PayNow changes (SEC-05).
// Replaces the profiles_guard_paynow checks in supabase/tests/security.test.sql.
import { describe, expect, it } from "vitest";
import { api, organiser, organiserWithProfile, profile, randomIp, type Organiser } from "./pb";

const mine = async (o: Organiser) => (await api("GET", "/api/collections/profiles/records", { token: o.token })).body.items[0];
const patch = async (o: Organiser, json: unknown) => api("PATCH", `/api/collections/profiles/records/${(await mine(o)).id}`, { token: o.token, json });
const change = (o: Organiser, json: Record<string, unknown>, ip?: string) => api("POST", "/api/plspay/profile", { token: o.token, json, ip });

describe("PayNow format", () => {
  it("AC-F02-02 a PayNow mobile is 8 digits starting 8 or 9; a UEN is 9 or 10 letters and digits", async () => {
    const cases: [string, string, number][] = [
      ["mobile", "91234567", 200],
      ["mobile", "81234567", 200],
      ["mobile", "71234567", 400],
      ["mobile", "9123456", 400],
      ["mobile", "201912345K", 400], // a UEN is not a mobile
      ["uen", "201912345K", 200],
      ["uen", "T08GB0001A", 200],
      ["uen", "2019-12345K", 400],
      ["uen", "91234567", 400], // a mobile is not a UEN
    ];
    for (const [paynow_type, paynow_id, status] of cases) {
      const o = await organiser("format");
      expect((await profile(o, { paynow_type, paynow_id })).status, `${paynow_type} ${paynow_id}`).toBe(status);
    }
  });

  it("AC-F02-01 a profile needs a display name, and there is one profile per organiser", async () => {
    const o = await organiser("one-profile");
    expect((await profile(o, { display_name: "" })).status).toBe(400);
    expect((await profile(o)).status).toBe(200);
    expect((await profile(o)).status).toBe(400);
  });
});

describe("Changing PayNow details needs the password", () => {
  it("AC-F02-03 SEC-05 the generic API refuses a PayNow change", async () => {
    const o = await organiserWithProfile("guard");
    expect((await patch(o, { paynow_id: "81111111" })).status).toBe(404);
    expect((await patch(o, { paynow_type: "uen", paynow_id: "201912345K" })).status).toBe(404);
    expect((await mine(o)).paynow_id).toBe("91234567");
  });

  it("AC-F02-03 other profile fields still save without a password, also when the PayNow values are resent unchanged", async () => {
    const o = await organiserWithProfile("guard-name");
    expect((await patch(o, { display_name: "New Name", whatsapp: "+6590001111" })).status).toBe(200);
    expect((await patch(o, { display_name: "Newer", paynow_type: "mobile", paynow_id: "91234567" })).status).toBe(200);
    expect(await mine(o)).toMatchObject({ display_name: "Newer", whatsapp: "+6590001111", paynow_id: "91234567" });
  });

  it("AC-F02-03 SEC-05 a wrong password changes nothing; the right one changes PayNow", async () => {
    const o = await organiserWithProfile("guard-route");
    const wrong = await change(o, { password: "not-the-password", paynow_type: "mobile", paynow_id: "81111111" });
    expect(wrong.status).toBe(403);
    expect(wrong.body.message).toBe("Wrong password.");
    expect((await mine(o)).paynow_id).toBe("91234567");
    expect((await change(o, { paynow_type: "mobile", paynow_id: "81111111" })).status).toBe(403); // no password at all
    const right = await change(o, { password: o.password, display_name: "Alice", paynow_type: "uen", paynow_id: "201912345K" });
    expect(right.status).toBe(200);
    expect(await mine(o)).toMatchObject({ paynow_type: "uen", paynow_id: "201912345K" });
  });

  it("AC-F02-02 AC-F02-03 the password route still enforces the PayNow format", async () => {
    const o = await organiserWithProfile("guard-format");
    const r = await change(o, { password: o.password, paynow_type: "mobile", paynow_id: "71234567" });
    expect(r.status).toBe(400);
    expect(r.body.data.paynow_id?.code).toBeTruthy();
    expect((await mine(o)).paynow_id).toBe("91234567");
  });

  it("AC-F02-05 the password route only ever changes the caller's own profile", async () => {
    const a = await organiserWithProfile("guard-a");
    const b = await organiserWithProfile("guard-b", { paynow_id: "87654321" });
    const r = await change(b, { password: b.password, paynow_type: "mobile", paynow_id: "82223333", owner: a.id, id: (await mine(a)).id });
    expect(r.status).toBe(200);
    expect((await mine(a)).paynow_id).toBe("91234567");
    expect((await mine(b)).paynow_id).toBe("82223333");
  });

  it("SEC-05 password guesses on that route are limited to 5 a minute per IP", async () => {
    const o = await organiserWithProfile("guard-limit");
    const ip = randomIp();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await change(o, { password: `guess-${i}`, paynow_type: "mobile", paynow_id: "81111111" }, ip)).status);
    expect(codes.slice(0, 5)).toEqual([403, 403, 403, 403, 403]);
    expect(codes[5]).toBe(429);
    expect((await change(o, { password: o.password, paynow_type: "mobile", paynow_id: "81111111" }, ip)).status).toBe(429);
    expect((await mine(o)).paynow_id).toBe("91234567");
  });
});
