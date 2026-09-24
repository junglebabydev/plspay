import Link from "next/link";
import { requireUser } from "@/server/auth";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser(); // AC-F01-05
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <Link href="/app" className="text-lg font-bold text-brand">PlsPay</Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/app/profile" className="text-stone-700 underline">Profile</Link>
          <form action={signOut}><button type="submit" className="text-stone-500 underline">Sign out</button></form>
        </nav>
      </header>
      {children}
    </div>
  );
}
