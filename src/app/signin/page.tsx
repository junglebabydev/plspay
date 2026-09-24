import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };

export default async function SignIn() {
  if (await getUser()) redirect("/app");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">PlsPay</p>
        <h1 className="mt-1 text-2xl font-bold">Sign in</h1>
      </div>
      <div className="card"><SignInForm /></div>
      <p className="text-center text-xs text-stone-500">
        By signing in you agree to our <Link href="/privacy" className="underline">privacy notice</Link>.
      </p>
    </main>
  );
}
