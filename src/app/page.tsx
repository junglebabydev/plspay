import Link from "next/link";
import { getUser } from "@/server/auth";

export default async function Home() {
  const user = await getUser();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">PlsPay</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight">Collect money from a group with PayNow. Know who has paid.</h1>
        <p className="mt-3 text-stone-600">
          Every payer gets their own link and a locked PayNow QR with a unique amount and reference. Money goes straight to your bank. We never hold it.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Link href={user ? "/app" : "/signin"} className="btn-primary">{user ? "Open my collections" : "Sign in with your mobile number"}</Link>
        <Link href="/privacy" className="text-center text-sm text-stone-500 underline">Privacy notice</Link>
      </div>
    </main>
  );
}
