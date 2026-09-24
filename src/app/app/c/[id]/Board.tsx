"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { Collection, Payer } from "@/server/data";
import { formatSGD } from "@/lib/money";
import { groupMessage, payerLink, singleMessage, waLink } from "@/lib/whatsapp";
import { closeCollection, deleteCollection, markPaid, reissuePayer, revokePayer, undoPaid } from "./actions";

type Props = { collection: Collection; initialPayers: Payer[]; origin: string };

const STATUS_LABEL: Record<Payer["status"], string> = { waiting: "Waiting", claimed: "Says paid", paid: "Paid" };
const STATUS_CLASS: Record<Payer["status"], string> = {
  waiting: "bg-stone-200 text-stone-700",
  claimed: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-800",
};

export function Board({ collection, initialPayers, origin }: Props) {
  const [payers, setPayers] = useState(initialPayers);
  const [status, setStatus] = useState(collection.status);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/app/c/${collection.id}/status`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { status: Collection["status"]; payers: Payer[] };
      setPayers(json.payers); setStatus(json.status);
    } catch { /* offline: keep showing the last state */ }
  }, [collection.id]);

  useEffect(() => {
    const t = setInterval(refresh, 5000); // AC-F05-04
    return () => clearInterval(t);
  }, [refresh]);

  const run = (fn: () => Promise<{ error?: string }>) => start(async () => {
    setError(null);
    const r = await fn();
    if (r?.error) setError(r.error);
    await refresh();
  });

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { setError("Couldn't copy. Long-press the link instead."); }
  };

  const total = payers.reduce((s, p) => s + p.amount_cents, 0);
  const collected = payers.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount_cents, 0);
  const unpaid = payers.filter((p) => p.status !== "paid" && !p.revoked);
  const expired = new Date(collection.expires_at) < new Date();
  const open = status === "open" && !expired;

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="error">{error}</p>}

      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-stone-600">Collected</p>
            <p className="text-2xl font-bold" data-testid="collected">{formatSGD(collected)} <span className="text-base font-normal text-stone-500">of {formatSGD(total)}</span></p>
          </div>
          <span className={`pill ${open ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"}`}>{status === "closed" ? "Closed" : expired ? "Expired" : "Open"}</span>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Paying to {collection.payee_name} · PayNow {collection.paynow_id} · {open ? `expires ${new Date(collection.expires_at).toLocaleDateString("en-SG")}` : "links no longer work"}
        </p>
        {open && unpaid.length > 0 && (
          <a className="btn-secondary mt-3 w-full" href={waLink(null, groupMessage(origin, collection.title, collection.payee_name, unpaid))} target="_blank" rel="noopener noreferrer">
            Send all to group chat
          </a>
        )}
      </div>

      <ul className="flex flex-col gap-3" aria-label="Payers">
        {payers.map((p) => (
          <li key={p.id} className="card" data-testid="payer-row" data-payer-status={p.status}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.first_name}</p>
                <p className="text-sm text-stone-700">{formatSGD(p.amount_cents)} · <span className="font-mono text-xs">{p.reference}</span></p>
                {p.revoked && <p className="text-xs text-red-700">Link revoked</p>}
              </div>
              <span className={`pill ${STATUS_CLASS[p.status]}`}>{STATUS_LABEL[p.status]}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.status === "paid" ? (
                <button className="btn-secondary" disabled={pending} onClick={() => run(() => undoPaid(collection.id, p.id))}>Undo</button>
              ) : (
                <button className="btn-primary" disabled={pending} onClick={() => run(() => markPaid(collection.id, p.id))}>Mark paid</button>
              )}
              {open && !p.revoked && (
                <>
                  {p.whatsapp && (
                    <a className="btn-secondary" href={waLink(p.whatsapp, singleMessage(origin, collection.title, collection.payee_name, p))} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  )}
                  <button className="btn-secondary" onClick={() => copy(payerLink(origin, p.token), p.id)}>{copied === p.id ? "Copied" : "Copy link"}</button>
                  <button className="btn-danger" disabled={pending} onClick={() => run(() => revokePayer(collection.id, p.id))}>Revoke</button>
                </>
              )}
              {open && p.revoked && (
                <button className="btn-secondary" disabled={pending} onClick={() => run(() => reissuePayer(collection.id, p.id))}>New link</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="card flex flex-col gap-2">
        {status === "open" && (
          <button className="btn-secondary" disabled={pending} onClick={() => run(() => closeCollection(collection.id))}>Close collection</button>
        )}
        {!confirmDelete ? (
          <button className="btn-danger" onClick={() => setConfirmDelete(true)}>Delete collection</button>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
            <p>This removes the collection and every payer immediately. Links stop working.</p>
            <div className="flex gap-2">
              <button className="btn-danger" disabled={pending} onClick={() => run(() => deleteCollection(collection.id))}>Yes, delete</button>
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>Keep it</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
