import { NextResponse } from "next/server";
import { retrieveFirm } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q.trim()) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }
  return NextResponse.json(
    { firmWide: true, crossRoom: true, results: retrieveFirm(q) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
