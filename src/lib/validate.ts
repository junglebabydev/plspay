// Input rules shared by forms and server actions. Specs: F01, F02, F03.
import { z } from "zod";

/** AC-F01-02: Singapore mobile only. Accepts 91234567, +65 9123 4567, 6591234567. Returns E.164 or null. */
export function normaliseSgPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  const m = /^(?:\+?65)?([89]\d{7})$/.exec(digits);
  return m ? `+65${m[1]}` : null;
}

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

/** AC-F02-02 */
export const paynowMobile = /^[89]\d{7}$/;
export const paynowUen = /^[0-9A-Z]{9,10}$/;

export const profileSchema = z
  .object({
    display_name: z.string().trim().min(1, "Enter a display name").max(40, "Display name is 40 characters max"),
    paynow_type: z.enum(["mobile", "uen"]),
    paynow_id: z.string().trim().transform((s) => s.replace(/\s/g, "").toUpperCase()),
    whatsapp: z
      .string()
      .trim()
      .transform((s) => (s ? normaliseSgPhone(s) ?? "invalid" : ""))
      .refine((s) => s !== "invalid", "WhatsApp must be a Singapore mobile number"),
  })
  .superRefine((p, ctx) => {
    if (p.paynow_type === "mobile" && !paynowMobile.test(p.paynow_id.replace(/^\+?65/, ""))) {
      ctx.addIssue({ code: "custom", path: ["paynow_id"], message: "PayNow mobile must be 8 digits starting with 8 or 9" });
    }
    if (p.paynow_type === "uen" && !paynowUen.test(p.paynow_id)) {
      ctx.addIssue({ code: "custom", path: ["paynow_id"], message: "UEN must be 9 or 10 letters and digits" });
    }
  })
  .transform((p) => ({ ...p, paynow_id: p.paynow_type === "mobile" ? p.paynow_id.replace(/^\+?65/, "") : p.paynow_id }));

export type ProfileInput = z.output<typeof profileSchema>;

/** AC-F03-* */
export const MAX_PAYERS = 50;
export const EXPIRY_DAYS = [7, 30, 90] as const;
export type ExpiryDays = (typeof EXPIRY_DAYS)[number];

export const payerInputSchema = z.object({
  first_name: z.string().trim().min(1, "Every payer needs a name").max(30, "Names are 30 characters max"),
  whatsapp: z
    .string()
    .trim()
    .transform((s) => (s ? normaliseSgPhone(s) ?? "invalid" : ""))
    .refine((s) => s !== "invalid", "WhatsApp must be a Singapore mobile number"),
  amount_cents: z.number().int().nonnegative().optional(),
});

export const COLLECTION_KINDS = ["personal", "business"] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

export const newCollectionSchema = z
  .object({
    title: z.string().trim().min(1, "Give the collection a title").max(40, "Titles are 40 characters max"),
    kind: z.enum(COLLECTION_KINDS, "Choose Personal or Business receipt"), // AC-F03-09
    mode: z.enum(["split", "custom"]),
    total_cents: z.number().int().nonnegative().optional(),
    include_organiser: z.boolean(),
    expiry_days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    payers: z
      .array(payerInputSchema)
      .min(1, "Add at least one payer")                     // AC-F03-08
      .max(MAX_PAYERS, `Maximum ${MAX_PAYERS} payers per collection`), // AC-F03-08
  })
  .superRefine((c, ctx) => {
    if (c.mode === "split" && (!c.total_cents || c.total_cents < 1)) {
      ctx.addIssue({ code: "custom", path: ["total_cents"], message: "Enter the total to split" });
    }
    if (c.mode === "custom" && c.payers.some((p) => !p.amount_cents || p.amount_cents < 1)) {
      ctx.addIssue({ code: "custom", path: ["payers"], message: "Every payer needs an amount above S$0.00" }); // AC-F03-02
    }
  });

export type NewCollectionInput = z.output<typeof newCollectionSchema>;

/** First error message of a zod result, for one-line form feedback. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form";
}
