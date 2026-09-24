// AC-F05-05: prefilled WhatsApp messages. Links only ever point at our own domain.
import { formatSGD } from "./money";

export type LinkablePayer = { first_name: string; whatsapp: string | null; amount_cents: number; token: string };

export function payerLink(origin: string, token: string): string {
  return `${origin}/p/${token}`;
}

export function singleMessage(origin: string, title: string, payeeName: string, p: LinkablePayer): string {
  return `Hi ${p.first_name}, please pay ${formatSGD(p.amount_cents)} for ${title} to ${payeeName} via PayNow. Tap for the QR: ${payerLink(origin, p.token)}`;
}

export function groupMessage(origin: string, title: string, payeeName: string, unpaid: LinkablePayer[]): string {
  const lines = unpaid.map((p) => `${p.first_name}: ${formatSGD(p.amount_cents)} ${payerLink(origin, p.token)}`);
  return `${title}: please pay ${payeeName} via PayNow. Tap your own link for the QR.\n${lines.join("\n")}`;
}

/** wa.me deep link. `to` is E.164 (+65...) or null for "choose a chat". */
export function waLink(to: string | null, text: string): string {
  const num = to ? to.replace(/[^\d]/g, "") : "";
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
