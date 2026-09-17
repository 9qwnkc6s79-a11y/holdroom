import { NextResponse } from "next/server";
import { filesIn, listRooms } from "@/lib/store";
import { LITTLE_ELM, migrateRoomId } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const roomId = migrateRoomId(new URL(req.url).searchParams.get("room") || LITTLE_ELM);
  const room = listRooms().find((r) => r.id === roomId);
  if (!room) {
    return NextResponse.json({ error: "Unknown room." }, { status: 404 });
  }
  return NextResponse.json(
    { room: room.name, files: filesIn(roomId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
