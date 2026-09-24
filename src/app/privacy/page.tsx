import Link from "next/link";

export const metadata = { title: "Privacy notice" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Privacy notice</h1>
      <div className="prose prose-stone mt-4 space-y-3 text-sm text-stone-700">
        <p>PlsPay helps an organiser collect PayNow payments from a group. We never receive, hold or move money. Payments go bank to bank.</p>
        <h2 className="font-semibold text-stone-900">What we store</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Organisers: mobile number (for sign-in), display name, PayNow mobile number or UEN, optional WhatsApp number.</li>
          <li>Payers: first name, amount, payment reference, optional WhatsApp number, and whether they said they have paid.</li>
        </ul>
        <h2 className="font-semibold text-stone-900">Who can see it</h2>
        <p>Only the organiser sees a collection&apos;s status. A payer sees only their own amount, the organiser&apos;s display name and PayNow ID.</p>
        <h2 className="font-semibold text-stone-900">How long we keep it</h2>
        <p>Collections and payer details are deleted 90 days after the collection closes or expires. Organisers can delete a collection at any time, which removes every payer immediately.</p>
        <h2 className="font-semibold text-stone-900">Contact</h2>
        <p>Questions about your data: ask the organiser who sent you the link, or the PlsPay team through the address on the sign-in page.</p>
      </div>
      <Link href="/" className="mt-6 inline-block text-sm text-brand underline">Back</Link>
    </main>
  );
}
