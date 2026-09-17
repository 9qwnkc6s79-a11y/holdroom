import { NextResponse } from "next/server";
import { DRIVE_STUB_ITEMS, DRIVE_STUB_NOTE } from "@/lib/drive";
import { LITTLE_ELM, migrateWorkspaceId } from "@/lib/departments";
import { importDriveStub } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    connected: false,
    stub: true,
    note: DRIVE_STUB_NOTE,
    items: DRIVE_STUB_ITEMS.map(({ id, name, path, departmentHint }) => ({
      id,
      name,
      path,
      departmentHint,
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    departmentId?: string;
    accessibleDepartments?: string[];
  } | null;

  if (body?.action === "connect") {
    return NextResponse.json({
      ok: true,
      stub: true,
      connected: false,
      note: DRIVE_STUB_NOTE,
    });
  }

  const departmentId = migrateWorkspaceId(body?.departmentId || LITTLE_ELM);
  const result = importDriveStub({
    departmentId,
    accessibleDepartments: body?.accessibleDepartments || [],
  });
  return NextResponse.json({
    ok: !result.error,
    stub: true,
    ...result,
  });
}
