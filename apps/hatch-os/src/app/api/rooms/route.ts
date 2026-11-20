import { NextResponse } from "next/server";
import { listDepartments } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Alias of /api/departments for older clients. */
export async function GET() {
  const departments = listDepartments();
  return NextResponse.json(
    {
      rooms: departments.map((room) => ({
        id: room.id,
        name: room.name,
        kind: room.kind,
        isolation: room.isolation,
        fileCount: room.files.length,
        files: room.files,
      })),
      departments,
      crossRoomSearch: true,
      firmWideRead: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
