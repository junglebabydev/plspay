import Link from "next/link";

// AC-F04-04: identical page for invalid, expired and revoked tokens.
export default function LinkGone() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-12 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">PlsPay</p>
      <h1 className="text-xl font-bold">This link no longer works. Ask the person collecting for a new one.</h1>
      <Link href="/privacy" className="text-sm text-stone-500 underline">Privacy notice</Link>
    </main>
  );
}
