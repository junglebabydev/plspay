// AC-F04-07. Rate limited per IP in src/proxy.ts (SEC-03). Same shape of answer whatever the token.
import { NextResponse } from "next/server";
import { claimPayment } from "@/server/payer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body.token === "string") token = body.token;
  } catch { /* fall through with empty token */ }
  const ok = token ? await claimPayment(token) : false;
  return NextResponse.json({ ok }, { headers: { "Cache-Control": "no-store" } });
}
