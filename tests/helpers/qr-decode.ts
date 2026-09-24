// Shared by unit and e2e tests: decode our greyscale PNG and read the QR with jsQR.
import { inflateSync } from "node:zlib";
import jsQR from "jsqr";

export function pngToRgba(png: Buffer): { data: Uint8ClampedArray; width: number; height: number } {
  let off = 8; const idat: Buffer[] = []; let width = 0, height = 0;
  while (off < png.length) {
    const len = png.readUInt32BE(off); const type = png.toString("ascii", off + 4, off + 8);
    const body = png.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); }
    if (type === "IDAT") idat.push(body);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = raw[y * (width + 1) + 1 + x]!; const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width, height };
}

export function decodeQrDataUrl(dataUrl: string): string | undefined {
  const b64 = dataUrl.split(",")[1] ?? "";
  const img = pngToRgba(Buffer.from(b64, "base64"));
  return jsQR(img.data, img.width, img.height)?.data;
}

/** EMVCo TLV -> map of tag -> value (one level). */
export function parseTlv(payload: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2); const len = Number(payload.slice(i + 2, i + 4));
    out.set(tag, payload.slice(i + 4, i + 4 + len)); i += 4 + len;
  }
  return out;
}
