import { NextResponse } from "next/server";
import { retrieve } from "@/lib/store";
import { LITTLE_ELM, migrateRoomId } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const roomId = migrateRoomId(url.searchParams.get("room") || LITTLE_ELM);
  if (!q.trim()) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }
  return NextResponse.json(
    { roomId, crossRoom: false, results: retrieve(roomId, q) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
