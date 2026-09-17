import { NextResponse } from "next/server";
import { fetchBoxStatus } from "@/lib/adapters";
import { probeLlm, probeAgentLlm, llmConfig, agentLlmConfig } from "@/lib/llm";
import { MOCK_STATUS } from "@/lib/mock-data";
import type { BoxStatus, EgressCheck } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const demo = url.searchParams.get("egress");
  const llm = await probeLlm();
  const agentLlm = await probeAgentLlm();

  if (demo === "pass") {
    const egress: EgressCheck = {
      status: "checked",
      detail: "Demo: public APIs reachable. In production this is an error — fix the firewall before accept.",
      openai: "PASS=reachable",
      anthropic: "PASS=reachable",
    };
    const body: BoxStatus = {
      ...MOCK_STATUS,
      ok: false,
      egress_check: egress,
      llm,
      agentLlm,
      dryRun: true,
      source: "mock",
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  if (demo === "unknown") {
    const egress: EgressCheck = {
      status: "unknown",
      detail: "Egress not checked — run the proof before anyone treats this as live.",
      openai: null,
      anthropic: null,
    };
    const body: BoxStatus = {
      ...MOCK_STATUS,
      ok: false,
      last_egress_check: "never",
      egress_check: egress,
      llm,
      agentLlm,
      dryRun: true,
      source: "mock",
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  const status = await fetchBoxStatus();
  const { primary } = llmConfig();
  const agent = agentLlmConfig();
  return NextResponse.json(
    {
      ...status,
      ok: llm.reachable,
      model: llm.model,
      label: "Software dry-run — appliance not connected",
      dryRun: true,
      llm: {
        ...llm,
        model: llm.model,
        baseUrl: primary.rawBase,
        host: llm.host || primary.host,
        label: llm.label || primary.label,
        lane: "ask" as const,
      },
      agentLlm: {
        ...agentLlm,
        model: agentLlm.model,
        baseUrl: agent.primary.rawBase,
        host: agentLlm.host || agent.primary.host,
        label: agentLlm.label || agent.primary.label,
        lane: "agent" as const,
        dedicated: agent.dedicated,
        usingAskFallback: agent.usingAskFallback,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
