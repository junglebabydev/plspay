// AC-F05-04: the board polls this every 5 seconds. Session required, the collection rules scope the rows.
import { NextResponse } from "next/server";
import { createSessionClient, getCurrentUser } from "@/server/pb";
import { getCollection, listPayers } from "@/server/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pb = await createSessionClient();
  if (!(await getCurrentUser(pb))) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const collection = await getCollection(pb, id);
  if (!collection) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const payers = await listPayers(pb, id);
  return NextResponse.json({ status: collection.status, payers }, { headers: { "Cache-Control": "no-store" } });
}
