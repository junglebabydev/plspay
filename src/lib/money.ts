// Money is integer cents everywhere (CLAUDE.md rule 7).

export function formatSGD(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("cents must be an integer");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-SG");
  return `${sign}S$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** "25", "25.5", "1,250.05" -> cents. Returns null for anything else (more than 2 decimals, negatives, junk). */
export function parseAmountToCents(input: string): number | null {
  const s = input.trim().replace(/,/g, "").replace(/^S?\$/, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = m[2] ? Number((m[2] + "0").slice(0, 2)) : 0;
  if (!Number.isSafeInteger(whole * 100 + frac)) return null;
  return whole * 100 + frac;
}
