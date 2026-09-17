import { NextResponse } from "next/server";
import { runAgentLoop } from "@/lib/agent";
import { LITTLE_ELM, migrateWorkspaceId } from "@/lib/departments";
import { agentLlmConfig, probeAgentLlm } from "@/lib/llm";
import { fileListing, listAudit, retrieveFirm } from "@/lib/store";
import { TOOL_SCHEMAS, executeTool, mentionedReads } from "@/lib/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  const agent = agentLlmConfig();
  const probe = await probeAgentLlm();
  return NextResponse.json({
    tools: TOOL_SCHEMAS,
    read: "firm-capable",
    writeAcl: "user-departments",
    audit: listAudit().slice(0, 20),
    llm: {
      lane: "agent",
      model: probe.model,
      host: probe.host,
      label: probe.label,
      dedicated: agent.dedicated,
      usingAskFallback: agent.usingAskFallback,
      connected: probe.connected,
    },
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    arguments?: Record<string, unknown>;
    workspaceId?: string;
    departmentId?: string;
    query?: string;
    accessibleDepartments?: string[];
    enterprise?: boolean;
  } | null;

  const workspaceId = migrateWorkspaceId(body?.workspaceId || body?.departmentId || LITTLE_ELM);
  const accessibleDepartments = body?.accessibleDepartments || [];
  const query = (body?.query || "").trim();

  if (query && !body?.name) {
    const sources = retrieveFirm(query);
    const reads = mentionedReads(query);
    const result = await runAgentLoop(
      {
        workspaceId,
        query,
        sources,
        fileListing: fileListing(workspaceId),
        toolResults: reads.map((r) => r.event),
        extra: reads.map((r) => r.extra).filter(Boolean),
        accessibleDepartments,
        enterprise: body?.enterprise,
      },
      () => undefined,
    );
    return NextResponse.json(result);
  }

  if (!body?.name) {
    return NextResponse.json({ error: "Missing tool name." }, { status: 400 });
  }
  const result = executeTool(
    { name: body.name, arguments: body.arguments || {} },
    {
      workspaceId,
      accessibleDepartments,
      enterprise: body.enterprise,
    },
  );
  return NextResponse.json(result, { status: result.event.ok ? 200 : 400 });
}
