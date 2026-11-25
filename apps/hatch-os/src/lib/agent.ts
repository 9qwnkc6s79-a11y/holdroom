import { toolNeedsApproval } from "./action-cards.ts";
import { DRAFT_NUDGE, finishSoftDraft, shouldNudgeSoftDraft } from "./agent-draft.ts";
import { streamAgentLlm, type ChatMessage } from "./llm";
import { assertHasTokens, deductUsage, OUT_OF_CREDIT_TEXT } from "./tokens.ts";
import { buildAgentMessages, type PromptInput } from "./prompt";
import { stripThinkBlocks } from "./think.ts";
import {
  executeTool,
  openaiToolSchemas,
  parseToolCalls,
  stripToolMarkup,
  type ToolCall,
  type ToolContext,
} from "./tools";
import type { Source, ToolEvent } from "./types";

export const AGENT_MAX_TURNS = 4;

export interface AgentLoopInput extends PromptInput {
  workspaceId: string;
  accessibleDepartments: string[];
  enterprise?: boolean;
  defaultDepartmentId?: string;
  testerCode?: string;
}

export interface AgentLoopResult {
  text: string;
  tools: ToolEvent[];
  sources: Source[];
  pendingCalls?: ToolCall[];
}

function mergeCalls(streamed: ToolCall[], fromText: ToolCall[]): ToolCall[] {
  const out = [...streamed];
  for (const call of fromText) {
    if (!out.some((c) => c.name === call.name && JSON.stringify(c.arguments) === JSON.stringify(call.arguments))) {
      out.push(call);
    }
  }
  return out;
}

export async function runAgentLoop(
  input: AgentLoopInput,
  onDelta: (text: string) => void,
  options?: { pauseMutations?: boolean },
): Promise<AgentLoopResult> {
  const ctx: ToolContext = {
    workspaceId: input.workspaceId,
    accessibleDepartments: input.accessibleDepartments,
    enterprise: input.enterprise,
    defaultDepartmentId: input.defaultDepartmentId,
  };
  const messages: ChatMessage[] = buildAgentMessages(input);
  const sources = [...input.sources];
  const toolResults = [...(input.toolResults || [])];
  let visible = "";
  const tools = openaiToolSchemas();

  for (let turn = 0; turn < AGENT_MAX_TURNS; turn++) {
    if (input.testerCode && turn > 0) {
      const gate = await assertHasTokens(input.testerCode);
      if (!gate.ok) {
        const notice = visible ? `${visible}\n\n${OUT_OF_CREDIT_TEXT}` : OUT_OF_CREDIT_TEXT;
        return { text: notice, tools: toolResults, sources };
      }
    }
    let turnText = "";
    const streamed = await streamAgentLlm(
      messages,
      (delta) => {
        turnText += delta;
        onDelta(delta);
      },
      tools,
    );
    if (input.testerCode) void deductUsage(input.testerCode, streamed.usage, "agent").catch(() => undefined);
    const visibleTurn = stripThinkBlocks(streamed.text || turnText);
    const calls = mergeCalls(streamed.toolCalls, parseToolCalls(visibleTurn));
    const clean = stripThinkBlocks(stripToolMarkup(visibleTurn));
    if (clean) visible = visible ? `${visible}\n${clean}` : clean;
    if (!calls.length) {
      if (shouldNudgeSoftDraft(turn, input.query, toolResults)) {
        messages.push({ role: "assistant", content: visibleTurn || turnText || "(no tool)" });
        messages.push({ role: "user", content: DRAFT_NUDGE });
        continue;
      }
      break;
    }

    const extras: string[] = [];
    const pending: ToolCall[] = [];
    for (const call of calls) {
      if (options?.pauseMutations && toolNeedsApproval(call.name)) {
        pending.push(call);
        continue;
      }
      const result = executeTool(call, ctx);
      toolResults.push(result.event);
      if (result.sources?.length) sources.push(...result.sources);
      if (result.extra) extras.push(`${call.name}: ${result.extra}`);
    }
    if (pending.length) {
      return {
        text: stripThinkBlocks(stripToolMarkup(visible) || visible),
        tools: toolResults,
        sources,
        pendingCalls: pending,
      };
    }

    messages.push({ role: "assistant", content: visibleTurn || turnText });
    messages.push({
      role: "user",
      content: [
        "Tool results:",
        ...toolResults.slice(-calls.length).map((t) => `- ${t.name}: ${t.ok ? "ok" : "denied"} — ${t.detail}`),
        ...extras,
        "Continue. If you can answer now, answer in prose. If you need another tool, call it.",
      ].join("\n"),
    });
  }

  const finished = finishSoftDraft({
    query: input.query,
    text: stripThinkBlocks(stripToolMarkup(visible) || visible),
    tools: toolResults,
    defaultDepartmentId: input.defaultDepartmentId,
  });
  if (finished.toolCall && options?.pauseMutations && toolNeedsApproval(finished.toolCall.name)) {
    return {
      text: stripThinkBlocks(finished.text || visible),
      tools: toolResults,
      sources,
      pendingCalls: [finished.toolCall],
    };
  }
  if (finished.toolCall) {
    const result = executeTool(finished.toolCall, ctx);
    toolResults.push(result.event);
    if (result.sources?.length) sources.push(...result.sources);
  }
  const text = [finished.text, finished.notice].filter(Boolean).join("\n\n");

  return {
    text: stripThinkBlocks(text),
    tools: toolResults,
    sources,
  };
}
