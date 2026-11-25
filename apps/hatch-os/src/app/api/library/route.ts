import { NextResponse } from "next/server";
import { ENTERPRISE, NORTH_DESK, migrateWorkspaceId, workspaceLabel } from "@/lib/departments";
import { libraryIn, listDepartments } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const departmentId = migrateWorkspaceId(new URL(req.url).searchParams.get("department") || new URL(req.url).searchParams.get("room") || NORTH_DESK);
  if (departmentId !== ENTERPRISE && !listDepartments().some((d) => d.id === departmentId)) {
    return NextResponse.json({ error: "Unknown department." }, { status: 404 });
  }
  return NextResponse.json(
    { department: workspaceLabel(departmentId), files: libraryIn(departmentId), firmWideRead: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
