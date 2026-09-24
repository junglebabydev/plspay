import { describe, it, expect } from "vitest";
import { normaliseSgPhone, profileSchema, newCollectionSchema, firstIssue } from "../../src/lib/validate";

describe("Phone normalisation", () => {
  it("AC-F01-02 accepts Singapore mobiles in common formats and rejects everything else", () => {
    expect(normaliseSgPhone("91234567")).toBe("+6591234567");
    expect(normaliseSgPhone("+65 9123 4567")).toBe("+6591234567");
    expect(normaliseSgPhone("6581234567")).toBe("+6581234567");
    expect(normaliseSgPhone("+14155550100")).toBeNull();
    expect(normaliseSgPhone("61234567")).toBeNull(); // landline
    expect(normaliseSgPhone("912345678")).toBeNull();
    expect(normaliseSgPhone("")).toBeNull();
  });
});

describe("Profile", () => {
  const base = { display_name: "Vaibhav", paynow_type: "mobile", paynow_id: "91234567", whatsapp: "" };

  it("AC-F02-02 PayNow mobile must be 8 digits starting 8 or 9", () => {
    expect(profileSchema.safeParse(base).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, paynow_id: "+65 9123 4567" }).data?.paynow_id).toBe("91234567");
    expect(profileSchema.safeParse({ ...base, paynow_id: "71234567" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, paynow_id: "9123456" }).success).toBe(false);
  });

  it("AC-F02-02 UEN must be 9 or 10 letters and digits", () => {
    expect(profileSchema.safeParse({ ...base, paynow_type: "uen", paynow_id: "201912345k" }).data?.paynow_id).toBe("201912345K");
    expect(profileSchema.safeParse({ ...base, paynow_type: "uen", paynow_id: "T08GB0001A" }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, paynow_type: "uen", paynow_id: "2019123" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, paynow_type: "uen", paynow_id: "2019-12345K" }).success).toBe(false);
  });

  it("AC-F02-01 requires a display name", () => {
    const r = profileSchema.safeParse({ ...base, display_name: "  " });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssue(r.error)).toBe("Enter a display name");
  });
});

describe("New collection input", () => {
  const payer = (first_name: string, amount_cents?: number) => ({ first_name, whatsapp: "", amount_cents });
  const split = { title: "Dinner", kind: "personal", mode: "split", total_cents: 10000, include_organiser: false, expiry_days: 30, payers: [payer("A"), payer("B")] };

  it("AC-F03-09 kind must be personal or business", () => {
    expect(newCollectionSchema.safeParse({ ...split, kind: "business" }).data?.kind).toBe("business");
    const r = newCollectionSchema.safeParse({ ...split, kind: "charity" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssue(r.error)).toBe("Choose Personal or Business receipt");
    expect(newCollectionSchema.safeParse({ ...split, kind: undefined }).success).toBe(false);
  });

  it("AC-F03-02 custom mode needs an amount above S$0.00 for every payer", () => {
    const r = newCollectionSchema.safeParse({ ...split, mode: "custom", payers: [payer("A", 500), payer("B", 0)] });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssue(r.error)).toBe("Every payer needs an amount above S$0.00");
    expect(newCollectionSchema.safeParse({ ...split, mode: "custom", payers: [payer("A", 500), payer("B", 1)] }).success).toBe(true);
  });

  it("AC-F03-07 only 7, 30 or 90 day expiry", () => {
    expect(newCollectionSchema.safeParse({ ...split, expiry_days: 7 }).success).toBe(true);
    expect(newCollectionSchema.safeParse({ ...split, expiry_days: 90 }).success).toBe(true);
    expect(newCollectionSchema.safeParse({ ...split, expiry_days: 14 }).success).toBe(false);
  });

  it("AC-F03-08 blocks 0 or more than 50 payers with a clear message", () => {
    const none = newCollectionSchema.safeParse({ ...split, payers: [] });
    expect(none.success).toBe(false);
    if (!none.success) expect(firstIssue(none.error)).toBe("Add at least one payer");
    const many = newCollectionSchema.safeParse({ ...split, payers: Array.from({ length: 51 }, (_, i) => payer(`P${i}`)) });
    expect(many.success).toBe(false);
    if (!many.success) expect(firstIssue(many.error)).toBe("Maximum 50 payers per collection");
  });
});
