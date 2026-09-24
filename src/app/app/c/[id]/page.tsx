import { notFound } from "next/navigation";
import { createSessionClient } from "@/server/supabase";
import { getCollection, listPayers } from "@/server/data";
import { publicOrigin } from "@/server/url";
import { Board } from "./Board";

export const metadata = { title: "Status board" };

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSessionClient();
  const collection = await getCollection(supabase, id);
  if (!collection) notFound(); // AC-F05-03: RLS returned zero rows
  const [payers, origin] = await Promise.all([listPayers(supabase, id), publicOrigin()]);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">{collection.title}{collection.kind === "business" && <span className="pill bg-sky-100 text-sky-800" data-testid="kind">Business</span>}</h1>
      <Board collection={collection} initialPayers={payers} origin={origin} />
    </main>
  );
}
