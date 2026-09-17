import { NextResponse } from "next/server";
import { searchRoom } from "@/lib/answers";
import { ragSearch } from "@/lib/adapters";
import { FUND_A } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const roomId = url.searchParams.get("room") || FUND_A;
  if (!q.trim()) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  const local = searchRoom(roomId, q);
  const rag = await ragSearch(q);
  const ragScoped = (rag || []).filter((s) => {
    const room = s.room.toLowerCase();
    if (roomId === "fund-a") return room.includes("fund a") || room.includes("alpha") || room === "fund-a";
    if (roomId === "fund-b") return room.includes("fund b") || room === "fund-b";
    return false;
  });

  return NextResponse.json(
    {
      roomId,
      crossRoom: false,
      results: local.length ? local : ragScoped,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
