import { NextResponse } from "next/server";
import { INITIAL_ROOMS } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const roomId = new URL(req.url).searchParams.get("room") || "fund-a";
  const room = INITIAL_ROOMS.find((r) => r.id === roomId);
  if (!room) {
    return NextResponse.json({ error: "Unknown room." }, { status: 404 });
  }
  return NextResponse.json(
    { room: room.name, files: room.files },
    { headers: { "Cache-Control": "no-store" } },
  );
}
