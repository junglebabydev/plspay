import { describe, it, expect } from "vitest";
import { decodeQrDataUrl } from "../helpers/qr-decode";
import { qrPngDataUrl } from "../../src/lib/qr";
import { encodeGreyPng } from "../../src/lib/png";
import { buildPayNowPayload } from "../../src/lib/paynow";

describe("QR PNG", () => {
  it("AC-F04-05 produces a valid PNG data URL a phone can save", () => {
    const { dataUrl, size } = qrPngDataUrl("hello");
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    const png = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  });

  it("AC-F04-02 the rendered PayNow QR decodes back to the exact payload", () => {
    const payload = buildPayNowPayload({ type: "mobile", id: "91234567", amountCents: 2500, reference: "DINN-PRIYA", payeeName: "Vaibhav", expiry: new Date("2026-12-31T00:00:00Z") });
    const { dataUrl } = qrPngDataUrl(payload);
    expect(decodeQrDataUrl(dataUrl)).toBe(payload);
  });

  it("AC-F04-05 encoder rejects a mismatched pixel buffer", () => {
    expect(() => encodeGreyPng(2, 2, new Uint8Array(3))).toThrow();
  });
});
