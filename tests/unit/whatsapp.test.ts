import { describe, it, expect } from "vitest";
import { groupMessage, payerLink, singleMessage, waLink } from "../../src/lib/whatsapp";

const origin = "https://plspay.sg";
const priya = { first_name: "Priya", whatsapp: "+6591234567", amount_cents: 2500, token: "tokA" };
const ravi = { first_name: "Ravi", whatsapp: null, amount_cents: 2501, token: "tokB" };

describe("WhatsApp messages", () => {
  it("AC-F05-05 single message carries the payer's own link and amount", () => {
    const m = singleMessage(origin, "Dinner", "Vaibhav", priya);
    expect(m).toContain("Priya");
    expect(m).toContain("S$25.00");
    expect(m).toContain(payerLink(origin, "tokA"));
    expect(m).not.toContain("tokB");
    expect(waLink(priya.whatsapp, m)).toBe(`https://wa.me/6591234567?text=${encodeURIComponent(m)}`);
  });

  it("AC-F05-05 group message lists every unpaid payer's link and opens a chat picker", () => {
    const m = groupMessage(origin, "Dinner", "Vaibhav", [priya, ravi]);
    expect(m).toContain(`${origin}/p/tokA`);
    expect(m).toContain(`${origin}/p/tokB`);
    expect(m).toContain("S$25.01");
    expect(waLink(null, m).startsWith("https://wa.me/?text=")).toBe(true);
  });
});
