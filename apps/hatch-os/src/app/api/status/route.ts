import { NextResponse } from "next/server";
import { fetchBoxStatus } from "@/lib/adapters";
import { probeLlm, llmConfig } from "@/lib/llm";
import { MOCK_STATUS } from "@/lib/mock-data";
import type { BoxStatus, EgressCheck } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const demo = url.searchParams.get("egress");
  const llm = await probeLlm();

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
      dryRun: true,
      source: "mock",
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  const status = await fetchBoxStatus();
  const { model, baseUrl } = llmConfig();
  return NextResponse.json(
    {
      ...status,
      ok: llm.connected,
      model: llm.connected ? model : `${model} (disconnected)`,
      label: "Software dry-run — appliance not connected",
      dryRun: true,
      llm: { ...llm, model, baseUrl },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
