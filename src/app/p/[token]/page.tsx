import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPayment } from "@/server/payer";
import { buildPayNowPayload } from "@/lib/paynow";
import { qrPngDataUrl } from "@/lib/qr";
import { formatSGD } from "@/lib/money";
import { PayerActions } from "./PayerActions";

// AC-F04-09 / SEC-06: nothing identifying in the head. Same metadata for every token.
export const metadata: Metadata = {
  title: "PayNow payment request",
  description: "Scan the PayNow QR in your bank app to pay.",
  robots: { index: false, follow: false },
  openGraph: { title: "PlsPay payment request", description: "Scan the PayNow QR in your bank app to pay.", type: "website" },
};
export const dynamic = "force-dynamic";

export default async function PayerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payment = await getPayment(token);
  if (!payment) notFound(); // AC-F04-04

  const payload = buildPayNowPayload({
    type: payment.paynow_type,
    id: payment.paynow_id,
    amountCents: payment.amount_cents,
    reference: payment.reference,
    payeeName: payment.payee_name,
    expiry: new Date(payment.expires_at),
  });
  const qr = qrPngDataUrl(payload);
  const amountText = formatSGD(payment.amount_cents);
  const paynowLabel = payment.paynow_type === "uen" ? "UEN" : "mobile";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-8">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">PlsPay</p>
        <h1 className="mt-1 text-xl font-bold">{payment.title}</h1>
        <p className="mt-3 text-4xl font-bold tabular-nums" data-testid="amount">{amountText}</p>
        <p className="mt-1 text-sm text-stone-600">to <span className="font-semibold text-stone-900">{payment.payee_name}</span></p>
      </div>

      <div className="card flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered data URL, no optimisation wanted */}
        <img src={qr.dataUrl} width={qr.size} height={qr.size} alt="PayNow QR code" className="h-auto w-full max-w-64" />
        <dl className="w-full text-sm">
          <div className="flex justify-between border-t border-stone-100 py-2"><dt className="text-stone-600">PayNow {paynowLabel}</dt><dd className="font-mono">{payment.paynow_id}</dd></div>
          <div className="flex justify-between border-t border-stone-100 py-2"><dt className="text-stone-600">Reference</dt><dd className="font-mono">{payment.reference}</dd></div>
          <div className="flex justify-between border-t border-stone-100 py-2"><dt className="text-stone-600">Amount</dt><dd className="font-mono">{amountText}</dd></div>
        </dl>
        <p className="text-xs text-stone-500">Open your bank app, scan or upload this QR. The amount and reference are locked so the organiser can match your payment.</p>
        <a className="btn-secondary w-full" href={qr.dataUrl} download={`paynow-${payment.reference}.png`}>Save QR</a>
      </div>

      <PayerActions token={token} paynowType={payment.paynow_type} paynowId={payment.paynow_id} amountText={amountText} reference={payment.reference} initialStatus={payment.status} payeeName={payment.payee_name} />

      <Link href="/privacy" className="text-center text-xs text-stone-500 underline">Privacy notice</Link>
    </main>
  );
}
