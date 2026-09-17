import { NextResponse } from "next/server";
import { searchRoom } from "@/lib/answers";
import { ragSearch } from "@/lib/adapters";
import { MATTER_ALPHA } from "@/lib/mock-data";
import { belongsToRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const roomId = url.searchParams.get("room") || MATTER_ALPHA;
  if (!q.trim()) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  const local = searchRoom(roomId, q);
  const rag = await ragSearch(q);
  const ragScoped = (rag || []).filter((s) => belongsToRoom(s.room, roomId));

  return NextResponse.json(
    {
      roomId,
      crossRoom: false,
      results: local.length ? local : ragScoped,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
