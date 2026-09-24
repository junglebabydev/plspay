// AC-F05-04: the board polls this every 5 seconds. Session required, RLS scopes the rows.
import { NextResponse } from "next/server";
import { createSessionClient } from "@/server/supabase";
import { getCollection, listPayers } from "@/server/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSessionClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const collection = await getCollection(supabase, id);
  if (!collection) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const payers = await listPayers(supabase, id);
  return NextResponse.json({ status: collection.status, payers }, { headers: { "Cache-Control": "no-store" } });
}
