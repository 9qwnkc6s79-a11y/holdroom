import { NextResponse } from "next/server";
import { readFileRecord } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rec = readFileRecord(decodeURIComponent(id));
  if (!rec) return NextResponse.json({ error: "Unknown file." }, { status: 404 });
  return NextResponse.json(
    { file: rec.file, text: rec.text },
    { headers: { "Cache-Control": "no-store" } },
  );
}
