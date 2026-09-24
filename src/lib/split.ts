// Amount and reference rules. Spec: specs/F03-create-collection.md

export function equalShares(totalCents: number, payers: number, includeOrganiser: boolean): number[] {
  const people = payers + (includeOrganiser ? 1 : 0);
  if (payers < 1 || payers > 50) throw new Error("payers must be 1 to 50");
  const share = Math.floor(totalCents / people);
  if (share < 1) throw new Error("total too small to split");
  return Array(payers).fill(share);
}

export function makeUnique(amounts: number[]): { amounts: number[]; extraCents: number } {
  const seen = new Set<number>();
  let extra = 0;
  const out = amounts.map((a) => {
    let v = a;
    while (seen.has(v)) v += 1;
    seen.add(v);
    extra += v - a;
    return v;
  });
  return { amounts: out, extraCents: extra };
}

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function makeReferences(title: string, names: string[]): string[] {
  const prefix = clean(title).slice(0, 4) || "PAY";
  const used = new Set<string>();
  return names.map((n) => {
    const base = `${prefix}-${clean(n).slice(0, 10) || "X"}`;
    let ref = base;
    let i = 2;
    while (used.has(ref)) ref = `${base}${i++}`;
    used.add(ref);
    return ref.slice(0, 25);
  });
}
