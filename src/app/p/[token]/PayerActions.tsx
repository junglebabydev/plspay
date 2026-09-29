"use client";
import { useState, useTransition } from "react";

type Props = { token: string; paynowType: "mobile" | "uen"; paynowId: string; amountText: string; reference: string; initialStatus: "waiting" | "claimed" | "paid"; payeeName: string };

export function PayerActions({ token, paynowType, paynowId, amountText, reference, initialStatus, payeeName }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); }
    catch { setError("Couldn't copy on this browser. Long-press the text to copy it."); }
  };

  // AC-F04-07: the payer can only ever claim. Confirming is the organiser's job.
  const claim = () => start(async () => {
    setError(null);
    try {
      const res = await fetch("/api/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      if (res.status === 429) return setError("Too many taps. Wait a minute and try again.");
      const json = (await res.json()) as { ok: boolean };
      if (json.ok || status !== "waiting") setStatus("claimed");
      else setError("Couldn't record that. Reload the page and try again.");
    } catch { setError("You seem to be offline. Try again in a moment."); }
  });

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="error">{error}</p>}
      {/* AC-F04-10: manual transfer for payers who can't scan (e.g. the QR is on the same phone). */}
      <details className="card group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-stone-800 [&::-webkit-details-marker]:hidden">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span> Can&apos;t scan? Pay by PayNow transfer
        </summary>
        <ol data-testid="transfer-steps" className="mt-3 flex flex-col gap-3 text-sm">
          <Step n={1}>Open your bank app and choose <strong>PayNow</strong> transfer.</Step>
          <Step n={2}>Choose <strong>{paynowType === "uen" ? "UEN" : "Mobile"}</strong>.</Step>
          <Step n={3} value={paynowId} copyLabel="Copy PayNow ID" copied={copied === "id"} onCopy={() => copy(paynowId, "id")}>Paste the {paynowType === "uen" ? "UEN" : "mobile number"}:</Step>
          <Step n={4}>Check the name shown is <strong>{payeeName}</strong>.</Step>
          <Step n={5} value={amountText.replace(/^S\$/, "")} copyLabel="Copy amount" copied={copied === "amt"} onCopy={() => copy(amountText.replace(/^S\$/, ""), "amt")}>Paste the exact amount:</Step>
          <Step n={6} value={reference} copyLabel="Copy reference" copied={copied === "ref"} onCopy={() => copy(reference, "ref")}>Paste the reference into the comments or reference field so the organiser can match your payment:</Step>
        </ol>
      </details>
      <p className="notice">Check your bank shows the name <strong>{payeeName}</strong> before you confirm.</p>
      {status === "waiting" ? (
        <button className="btn-primary" disabled={pending} onClick={claim}>{pending ? "Saving…" : "I've paid"}</button>
      ) : status === "claimed" ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-center text-sm font-medium text-emerald-800">Thanks, we&apos;ve told the organiser you&apos;ve paid.</p>
      ) : (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-center text-sm font-medium text-emerald-800">The organiser has confirmed your payment. Thank you!</p>
      )}
    </div>
  );
}

type StepProps = { n: number; children: React.ReactNode; value?: string; copyLabel?: string; copied?: boolean; onCopy?: () => void };

function Step({ n, children, value, copyLabel, copied, onCopy }: StepProps) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-700">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-stone-700">{children}</p>
        {value !== undefined && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 py-1.5 pl-3 pr-1.5">
            <span className="min-w-0 break-all font-mono text-stone-900">{value}</span>
            <button className="btn-secondary shrink-0 px-3 py-1.5 text-xs" aria-label={copyLabel} onClick={onCopy}>{copied ? "Copied" : "Copy"}</button>
          </div>
        )}
      </div>
    </li>
  );
}
