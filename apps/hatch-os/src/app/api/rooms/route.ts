import { NextResponse } from "next/server";
import { listRooms } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const rooms = listRooms();
  return NextResponse.json(
    {
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        isolation: room.isolation,
        fileCount: room.files.length,
        files: room.files,
      })),
      crossRoomSearch: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
