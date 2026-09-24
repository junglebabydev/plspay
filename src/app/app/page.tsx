import Link from "next/link";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/server/supabase";
import { getProfile, listCollections, payerCounts } from "@/server/data";

export const metadata = { title: "Collections" };

export default async function Collections() {
  const supabase = await createSessionClient();
  const profile = await getProfile(supabase);
  if (!profile) redirect("/app/profile?first=1"); // AC-F02-01
  const [collections, counts] = await Promise.all([listCollections(supabase), payerCounts(supabase)]);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Collections</h1>
        <Link href="/app/new" className="btn-primary">New collection</Link>
      </div>
      {collections.length === 0 ? (
        <div className="card text-sm text-stone-600">No collections yet. Create one, then send each person their link on WhatsApp.</div>
      ) : (
        <ul className="flex flex-col gap-3">
          {collections.map((c) => {
            const n = counts.get(c.id) ?? { total: 0, paid: 0 };
            const expired = new Date(c.expires_at) < new Date();
            const label = c.status === "closed" ? "Closed" : expired ? "Expired" : "Open";
            return (
              <li key={c.id}>
                <Link href={`/app/c/${c.id}`} className="card flex items-center justify-between hover:bg-stone-50">
                  <div>
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-sm text-stone-600">{n.paid} of {n.total} paid</p>
                  </div>
                  <span className={`pill ${label === "Open" ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"}`}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
