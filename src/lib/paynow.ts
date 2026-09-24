// SGQR PayNow payload builder. Spec: docs/SPEC.md section 5.

export type PayNowInput = {
  type: "mobile" | "uen";
  id: string;            // "91234567" or "201912345K"
  amountCents: number;   // integer cents, > 0
  reference: string;     // max 25 chars
  payeeName: string;
  expiry?: Date;         // optional, encoded as YYYYMMDD (SGT)
};

export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error(`TLV ${id} too long`);
  return id + String(value.length).padStart(2, "0") + value;
}

function sgtDate(d: Date): string {
  const sgt = new Date(d.getTime() + 8 * 3600 * 1000);
  return sgt.toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildPayNowPayload(p: PayNowInput): string {
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) throw new Error("amountCents must be a positive integer");
  if (p.reference.length > 25) throw new Error("reference max 25 chars");
  const proxy = p.type === "uen" ? p.id.toUpperCase() : `+65${p.id}`;
  let merchant =
    tlv("00", "SG.PAYNOW") +
    tlv("01", p.type === "uen" ? "2" : "0") +
    tlv("02", proxy) +
    tlv("03", "0"); // amount not editable
  if (p.expiry) merchant += tlv("04", sgtDate(p.expiry));

  let payload =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("26", merchant) +
    tlv("52", "0000") +
    tlv("53", "702") +
    tlv("54", (p.amountCents / 100).toFixed(2)) +
    tlv("58", "SG") +
    tlv("59", (p.payeeName || "NA").slice(0, 25)) +
    tlv("60", "Singapore") +
    tlv("62", tlv("01", p.reference));
  payload += "6304";
  return payload + crc16(payload);
}
