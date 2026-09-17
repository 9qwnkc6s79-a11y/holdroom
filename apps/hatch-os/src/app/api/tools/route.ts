import { NextResponse } from "next/server";
import { LITTLE_ELM } from "@/lib/departments";
import { TOOL_SCHEMAS, executeTool } from "@/lib/tools";
import { listAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    tools: TOOL_SCHEMAS,
    read: "firm-capable",
    writeAcl: "user-departments",
    audit: listAudit().slice(0, 20),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    arguments?: Record<string, unknown>;
    workspaceId?: string;
    accessibleDepartments?: string[];
    enterprise?: boolean;
  } | null;
  if (!body?.name) {
    return NextResponse.json({ error: "Missing tool name." }, { status: 400 });
  }
  const result = executeTool(
    { name: body.name, arguments: body.arguments || {} },
    {
      workspaceId: body.workspaceId || LITTLE_ELM,
      accessibleDepartments: body.accessibleDepartments || [],
      enterprise: body.enterprise,
    },
  );
  return NextResponse.json(result, { status: result.event.ok ? 200 : 400 });
}
