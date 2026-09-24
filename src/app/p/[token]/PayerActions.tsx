"use client";
import { useState, useTransition } from "react";

type Props = { token: string; paynowId: string; amountText: string; reference: string; initialStatus: "waiting" | "claimed" | "paid"; qrDataUrl: string; payeeName: string };

export function PayerActions({ token, paynowId, amountText, reference, initialStatus, qrDataUrl, payeeName }: Props) {
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
      <div className="grid grid-cols-2 gap-2">
        <a className="btn-secondary" href={qrDataUrl} download={`paynow-${reference}.png`}>Save QR</a>
        <button className="btn-secondary" onClick={() => copy(paynowId, "id")}>{copied === "id" ? "Copied" : "Copy PayNow ID"}</button>
        <button className="btn-secondary" onClick={() => copy(amountText.replace(/^S\$/, ""), "amt")}>{copied === "amt" ? "Copied" : "Copy amount"}</button>
        <button className="btn-secondary" onClick={() => copy(reference, "ref")}>{copied === "ref" ? "Copied" : "Copy reference"}</button>
      </div>
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
