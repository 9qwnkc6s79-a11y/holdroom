import { NextResponse } from "next/server";
import { INITIAL_ROOMS } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      rooms: INITIAL_ROOMS.map((room) => ({
        id: room.id,
        name: room.name,
        isolation: room.isolation,
        fileCount: room.files.length,
      })),
      crossRoomSearch: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
