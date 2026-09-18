import { streamAgentLlm, type ChatMessage } from "./llm";
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
}

export interface AgentLoopResult {
  text: string;
  tools: ToolEvent[];
  sources: Source[];
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
): Promise<AgentLoopResult> {
  const ctx: ToolContext = {
    workspaceId: input.workspaceId,
    accessibleDepartments: input.accessibleDepartments,
    enterprise: input.enterprise,
  };
  const messages: ChatMessage[] = buildAgentMessages(input);
  const sources = [...input.sources];
  const toolResults = [...(input.toolResults || [])];
  let visible = "";
  const tools = openaiToolSchemas();

  for (let turn = 0; turn < AGENT_MAX_TURNS; turn++) {
    let turnText = "";
    const streamed = await streamAgentLlm(
      messages,
      (delta) => {
        turnText += delta;
        onDelta(delta);
      },
      tools,
    );
    const visibleTurn = stripThinkBlocks(streamed.text || turnText);
    const calls = mergeCalls(streamed.toolCalls, parseToolCalls(visibleTurn));
    const clean = stripThinkBlocks(stripToolMarkup(visibleTurn));
    if (clean) visible = visible ? `${visible}\n${clean}` : clean;
    if (!calls.length) break;

    const extras: string[] = [];
    for (const call of calls) {
      const result = executeTool(call, ctx);
      toolResults.push(result.event);
      if (result.sources?.length) sources.push(...result.sources);
      if (result.extra) extras.push(`${call.name}: ${result.extra}`);
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

  return {
    text: stripThinkBlocks(stripToolMarkup(visible) || visible),
    tools: toolResults,
    sources,
  };
}
