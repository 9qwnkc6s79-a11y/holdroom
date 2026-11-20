import { NextResponse } from "next/server";
import { migrateWorkspaceId } from "@/lib/departments";
import { createHandoff, listHandoffs } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const departmentId = new URL(req.url).searchParams.get("department");
  return NextResponse.json(
    { handoffs: listHandoffs(departmentId ? migrateWorkspaceId(departmentId) : undefined) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    fromDepartmentId?: string;
    toDepartmentId?: string;
    summary?: string;
    facts?: string;
  } | null;
  if (!body?.toDepartmentId) {
    return NextResponse.json({ error: "toDepartmentId is required." }, { status: 400 });
  }
  const result = createHandoff({
    fromDepartmentId: body.fromDepartmentId || "enterprise",
    toDepartmentId: body.toDepartmentId,
    summary: body.summary || "",
    facts: body.facts,
  });
  return NextResponse.json(result, { status: result.event.ok ? 200 : 400 });
}
