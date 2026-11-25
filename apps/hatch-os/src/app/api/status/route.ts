import { NextResponse } from "next/server";
import { fetchBoxStatus } from "@/lib/adapters";
import { demoModeEnabled } from "@/lib/demo.ts";
import { probeLlm, probeAgentLlm, llmConfig, agentLlmConfig } from "@/lib/llm";
import { MOCK_STATUS } from "@/lib/mock-data";
import { operatorUiEnabled } from "@/lib/operator";
import { verifySessionRequest } from "@/lib/session-auth";
import type { BoxStatus, EgressCheck } from "@/lib/types";

export const dynamic = "force-dynamic";

function customerHostLabel(connected: boolean, kind: "ask" | "agent") {
  if (kind === "ask") return connected ? "Ask model ready" : "Ask model offline";
  return connected ? "Agent model ready" : "Agent model offline";
}

export async function GET(req: Request) {
  const operator = operatorUiEnabled();

  if (demoModeEnabled()) {
    const body: BoxStatus = {
      ...MOCK_STATUS,
      ok: true,
      label: "Demo mode — the firm model is not called",
      model: "demo",
      demoMode: true,
      modelState: "demo",
      dryRun: operator,
      source: operator ? "mock" : "adapter",
      egress_check: operator ? MOCK_STATUS.egress_check : { status: "unknown", detail: "Demo mode", openai: null, anthropic: null },
      llm: {
        connected: false,
        reachable: false,
        model: "demo",
        baseUrl: "",
        host: operator ? "demo" : "",
        label: "Demo mode",
        lane: "ask",
      },
      agentLlm: {
        connected: false,
        reachable: false,
        model: "demo",
        baseUrl: "",
        host: operator ? "demo" : "",
        label: "Demo mode",
        lane: "agent",
        dedicated: false,
        usingAskFallback: false,
      },
    };
    return NextResponse.json({ ...body, authenticated: Boolean(verifySessionRequest(req)) }, { headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL(req.url);
  const demo = operator ? url.searchParams.get("egress") : null;
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
  const ready = llm.connected && !/timed out/i.test(llm.error || "");
  const agentReady = agentLlm.connected && !/timed out/i.test(agentLlm.error || "");

  if (!operator) {
    return NextResponse.json(
      {
        ok: llm.reachable,
        host: "",
        model: llm.model,
        label: ready ? "Firm host is ready" : "Firm host is offline",
        disk_free: status.disk_free,
        last_backup: "Managed",
        last_egress_check: status.last_egress_check,
        dryRun: false,
        demoMode: false,
        modelState: ready ? "ready" : "offline",
        llm: {
          connected: llm.connected,
          reachable: llm.reachable,
          model: llm.model,
          baseUrl: "",
          host: "",
          label: customerHostLabel(ready, "ask"),
          lane: "ask" as const,
          error: ready ? undefined : "Temporarily unavailable",
        },
        agentLlm: {
          connected: agentLlm.connected,
          reachable: agentLlm.reachable,
          model: agentLlm.model,
          baseUrl: "",
          host: "",
          label: customerHostLabel(agentReady, "agent"),
          lane: "agent" as const,
          dedicated: agent.dedicated,
          usingAskFallback: agent.usingAskFallback,
          error: agentReady ? undefined : "Temporarily unavailable",
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ...status,
      ok: llm.reachable,
      model: llm.model,
      label: ready ? `${llm.label || "Firm model"} is ready` : "The firm model is offline",
      dryRun: true,
      demoMode: false,
      modelState: ready ? "ready" : "offline",
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
