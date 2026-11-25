import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { NORTH_DESK, migrateWorkspaceId, workspaceLabel } from "@/lib/departments";
import { createFolder, filesIn, listFolders } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const departmentId = migrateWorkspaceId(
    new URL(req.url).searchParams.get("department") || NORTH_DESK,
  );
  return NextResponse.json(
    {
      department: workspaceLabel(departmentId),
      departmentId,
      folders: listFolders(departmentId),
      files: filesIn(departmentId),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    departmentId?: string;
    name?: string;
    parentId?: string | null;
  } | null;
  if (body?.action === "folder" && body.departmentId && body.name) {
    const folder = createFolder(body.departmentId, body.name, body.parentId ?? null);
    if ("error" in folder) return NextResponse.json(folder, { status: 400 });
    return NextResponse.json({ folder });
  }
  return NextResponse.json({ error: "Unknown files action." }, { status: 400 });
}
