import { describe, it, expect } from "vitest";
import jsQR from "jsqr";
import qrcode from "qrcode-generator";
import { buildPayNowPayload, crc16 } from "../../src/lib/paynow";

function decode(text: string): string | undefined {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(), s = 4, m = 4, W = (n + 2 * m) * s;
  const px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c))
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = (((r + m) * s + y) * W + ((c + m) * s + x)) * 4; px[i] = px[i + 1] = px[i + 2] = 0;
    }
  return jsQR(px, W, W)?.data;
}

const base = { type: "mobile" as const, id: "91234567", amountCents: 3333, reference: "FRID-PRIYA", payeeName: "Vaibhav" };

describe("PayNow QR", () => {
  it("AC-F04-02 CRC16-CCITT matches reference vector", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("AC-F04-02 payload locks amount, carries reference and valid CRC", () => {
    const p = buildPayNowPayload(base);
    expect(p).toContain("SG.PAYNOW");
    expect(p).toContain("0211+6591234567");
    expect(p).toContain("03010"); // tag 03: amount not editable
    expect(p).toContain("540533.33");
    expect(p).toContain("0110FRID-PRIYA");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  it("AC-F04-02 encodes UEN and expiry date in SGT", () => {
    const p = buildPayNowPayload({ ...base, type: "uen", id: "201912345k", expiry: new Date("2026-10-31T20:00:00Z") });
    expect(p).toContain("010120210201912345K");
    expect(p).toContain("040820261101");
  });

  it("AC-F04-02 QR image decodes to the exact payload", () => {
    const p = buildPayNowPayload(base);
    expect(decode(p)).toBe(p);
  });

  it("AC-F04-02 rejects float or zero amounts", () => {
    expect(() => buildPayNowPayload({ ...base, amountCents: 0 })).toThrow();
    expect(() => buildPayNowPayload({ ...base, amountCents: 10.5 })).toThrow();
  });
});
