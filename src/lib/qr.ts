// QR image for the payer page. Rendered on the server as a PNG data URL so the page needs no image route
// and phones can long-press to save it (AC-F04-05).
import qrcode from "qrcode-generator";
import { encodeGreyPng } from "./png";

export type QrImage = { dataUrl: string; size: number };

export function qrPngDataUrl(text: string, scale = 8, margin = 4): QrImage {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const size = (n + 2 * margin) * scale;
  const px = new Uint8Array(size * size).fill(255);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      for (let y = 0; y < scale; y++) {
        const row = (r + margin) * scale + y;
        px.fill(0, row * size + (c + margin) * scale, row * size + (c + margin + 1) * scale);
      }
    }
  }
  const png = encodeGreyPng(size, size, px);
  return { dataUrl: `data:image/png;base64,${png.toString("base64")}`, size };
}
