"use client";
import { useMemo, useState, useTransition } from "react";
import { createCollection } from "./actions";
import { equalShares, makeReferences, makeUnique } from "@/lib/split";
import { formatSGD, parseAmountToCents } from "@/lib/money";
import { EXPIRY_DAYS, MAX_PAYERS, type CollectionKind, type ExpiryDays } from "@/lib/validate";

type Row = { first_name: string; whatsapp: string; amount: string };
const emptyRow = (): Row => ({ first_name: "", whatsapp: "", amount: "" });

export function NewCollectionForm() {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CollectionKind>("personal");
  const [mode, setMode] = useState<"split" | "custom">("split");
  const [total, setTotal] = useState("");
  const [includeOrganiser, setIncludeOrganiser] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryDays>(30);
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const preview = useMemo(() => {
    const names = rows.map((r) => r.first_name.trim());
    let amounts: number[] | null = null;
    if (mode === "split") {
      const t = parseAmountToCents(total);
      if (t && rows.length >= 1 && rows.length <= MAX_PAYERS) {
        try { amounts = equalShares(t, rows.length, includeOrganiser); } catch { amounts = null; }
      }
    } else {
      const parsed = rows.map((r) => parseAmountToCents(r.amount));
      if (parsed.every((a) => a !== null && a > 0)) amounts = parsed as number[];
    }
    if (!amounts) return null;
    const unique = makeUnique(amounts);
    const refs = makeReferences(title, names.map((n) => n || "?"));
    return { amounts: unique.amounts, extraCents: unique.extraCents, refs };
  }, [rows, mode, total, includeOrganiser, title]);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = () => {
    setError(null);
    const payload = {
      title: title.trim(),
      kind,
      mode,
      total_cents: mode === "split" ? parseAmountToCents(total) ?? 0 : undefined,
      include_organiser: includeOrganiser,
      expiry_days: expiry,
      payers: rows.map((r) => ({
        first_name: r.first_name.trim(),
        whatsapp: r.whatsapp.trim(),
        amount_cents: mode === "custom" ? parseAmountToCents(r.amount) ?? 0 : undefined,
      })),
    };
    if (payload.payers.length === 0) return setError("Add at least one payer");
    if (payload.payers.length > MAX_PAYERS) return setError(`Maximum ${MAX_PAYERS} payers per collection`);
    if (mode === "split" && !payload.total_cents) return setError("Enter the total to split");
    if (mode === "custom" && payload.payers.some((p) => !p.amount_cents)) return setError("Every payer needs an amount above S$0.00");
    start(async () => {
      const res = await createCollection(payload);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="error">{error}</p>}

      <div className="card flex flex-col gap-4">
        <div>
          <label htmlFor="title" className="label">Title</label>
          <input id="title" className="input" maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday dinner" />
        </div>

        <fieldset>
          <legend className="label">What is this for?</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="kind" checked={kind === "personal"} onChange={() => setKind("personal")} /> Personal</label>
            <label className="flex items-center gap-2"><input type="radio" name="kind" checked={kind === "business"} onChange={() => setKind("business")} /> Business receipt</label>
          </div>
          <p className="mt-1 text-xs text-stone-500">{kind === "business" ? "Fees, sales or bookings you collect as a business. Shown as a Business label on your board." : "Splitting a bill or collecting from friends."}</p>
        </fieldset>

        <fieldset>
          <legend className="label">How to work out amounts</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "split"} onChange={() => setMode("split")} /> Split a total</label>
            <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "custom"} onChange={() => setMode("custom")} /> Set each amount</label>
          </div>
        </fieldset>

        {mode === "split" && (
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="total" className="label">Total (S$)</label>
              <input id="total" className="input" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="100.00" />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeOrganiser} onChange={(e) => setIncludeOrganiser(e.target.checked)} /> I&apos;m in the split</label>
          </div>
        )}

        <div>
          <label htmlFor="expiry" className="label">Expires in</label>
          <select id="expiry" className="input" value={expiry} onChange={(e) => setExpiry(Number(e.target.value) as ExpiryDays)}>
            {EXPIRY_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
      </div>

      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Payers <span className="text-sm font-normal text-stone-500">({rows.length} of {MAX_PAYERS})</span></h2>
          <button type="button" className="btn-secondary" disabled={rows.length >= MAX_PAYERS} onClick={() => setRows((rs) => [...rs, emptyRow()])}>Add payer</button>
        </div>
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={i} className="rounded-xl border border-stone-200 p-3">
              <div className="grid grid-cols-2 gap-2">
                <input aria-label={`Payer ${i + 1} name`} className="input" maxLength={30} placeholder="First name" value={r.first_name} onChange={(e) => update(i, { first_name: e.target.value })} />
                <input aria-label={`Payer ${i + 1} WhatsApp`} className="input" type="tel" placeholder="WhatsApp (optional)" value={r.whatsapp} onChange={(e) => update(i, { whatsapp: e.target.value })} />
                {mode === "custom" && (
                  <input aria-label={`Payer ${i + 1} amount`} className="input" inputMode="decimal" placeholder="Amount S$" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-stone-600">
                <span>
                  {preview ? <>{formatSGD(preview.amounts[i]!)} · ref <span className="font-mono">{preview.refs[i]}</span></> : "Amount and reference appear here"}
                </span>
                <button type="button" className="text-red-700 underline" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
        {preview && preview.extraCents > 0 && (
          <p className="notice" data-testid="extra-cents">
            Adds {formatSGD(preview.extraCents)} in total so every amount is unique. Your bank alert then tells you who paid.
          </p>
        )}
      </div>

      <button type="button" onClick={submit} disabled={pending} className="btn-primary">{pending ? "Creating…" : "Create collection"}</button>
    </div>
  );
}
