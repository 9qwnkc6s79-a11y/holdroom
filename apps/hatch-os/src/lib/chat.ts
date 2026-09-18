import { runAgentLoop } from "./agent";
import { wantsAgentTurn } from "./agent-intent";
import { LITTLE_ELM, migrateWorkspaceId } from "./departments";
import { agentLlmConfig, connectHelp, isRunpodUrl, llmConfig, probeAgentLlm, probeLlm, streamLlm } from "./llm";
import { buildAskMessages } from "./prompt";
import { appendThreadMessages, createThread, fileListing, getThread, retrieveFirm } from "./store";
import { stripThinkBlocks } from "./think.ts";
import { executeTool, mentionedReads, parseToolTrailer, stripToolTrailer } from "./tools";
import type { ChatAttachment, ChatMessage, Source, ToolEvent } from "./types";

export function newChatMessage(role: ChatMessage["role"], text: string, extra?: Partial<ChatMessage>): ChatMessage {
  return {
    id: `${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    text,
    done: role === "user",
    sources: [],
    ...extra,
  };
}

export interface ChatTurnInput {
  query: string;
  departmentId?: string;
  roomId?: string;
  threadId?: string;
  accessibleDepartments?: string[];
  enterprise?: boolean;
  attachments?: ChatAttachment[];
  agent?: boolean;
}

export interface ChatTurnResult {
  threadId: string;
  title?: string;
  text: string;
  sources: Source[];
  tools: ToolEvent[];
  error?: boolean;
}

export interface ChatTurnHooks {
  onStart?: (info: { threadId: string }) => void;
  onDelta?: (delta: string) => void;
}

/** Same Ask (Qwen) / agent (Hermes) turn as `/api/chat` and the Chat tab. */
export async function runChatTurn(input: ChatTurnInput, hooks: ChatTurnHooks = {}): Promise<ChatTurnResult> {
  const workspaceId = migrateWorkspaceId(input.departmentId || input.roomId || LITTLE_ELM);
  const query = (input.query || "").trim();
  const accessibleDepartments = input.accessibleDepartments || [];
  if (!query) {
    throw new Error("Ask a question.");
  }

  const thread = input.threadId ? getThread(input.threadId) : createThread(workspaceId, query.slice(0, 42));
  const active = thread || createThread(workspaceId, query.slice(0, 42));
  hooks.onStart?.({ threadId: active.id });

  const sources = retrieveFirm(query);
  const listing = fileListing(workspaceId);
  const reads = mentionedReads(query);
  const toolResults: ToolEvent[] = reads.map((r) => r.event);
  const extra = reads.map((r) => r.extra).filter(Boolean);

  const userMsg = newChatMessage("user", query, {
    attachments: Array.isArray(input.attachments) ? input.attachments : undefined,
  });
  const assistantMsg = newChatMessage("assistant", "", { done: false });
  appendThreadMessages(active.id, [userMsg]);

  const agentic = wantsAgentTurn(query, input.agent);
  const probe = agentic ? await probeAgentLlm() : await probeLlm();
  const { primary } = agentic ? agentLlmConfig() : llmConfig();
  const runpodReady = isRunpodUrl(primary.rawBase) && Boolean(primary.apiKey);

  if (!probe.connected && !runpodReady) {
    const help = connectHelp(probe);
    const detail = probe.error ? `${probe.error}\n\n${help}` : help;
    appendThreadMessages(active.id, [{ ...assistantMsg, text: detail, done: true, sources: [], tools: toolResults }]);
    return {
      threadId: active.id,
      title: getThread(active.id)?.title,
      text: detail,
      sources: [],
      tools: toolResults,
      error: true,
    };
  }

  const promptInput = {
    workspaceId,
    query,
    sources,
    fileListing: listing,
    toolResults,
    extra,
    accessibleDepartments,
  };

  let text = "";
  try {
    if (agentic) {
      const result = await runAgentLoop({ ...promptInput, enterprise: input.enterprise }, (delta) => {
        text += delta;
        hooks.onDelta?.(delta);
      });
      text = stripThinkBlocks(result.text || text);
      toolResults.splice(0, toolResults.length, ...result.tools);
      sources.splice(0, sources.length, ...result.sources);
    } else {
      const messages = buildAskMessages(promptInput);
      const streamed = await streamLlm(messages, (delta) => {
        text += delta;
        hooks.onDelta?.(delta);
      });
      text = stripThinkBlocks(streamed.text || text);
      const call = parseToolTrailer(text);
      if (call) {
        const result = executeTool(call, {
          workspaceId,
          accessibleDepartments,
          enterprise: input.enterprise,
        });
        toolResults.push(result.event);
        if (result.sources?.length) sources.push(...result.sources);
      }
      text = stripThinkBlocks(stripToolTrailer(text) || text);
    }
    const final: ChatMessage = {
      ...assistantMsg,
      text,
      done: true,
      sources,
      tools: toolResults,
    };
    appendThreadMessages(active.id, [final]);
    return {
      threadId: active.id,
      title: getThread(active.id)?.title,
      text,
      sources,
      tools: toolResults,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM failed";
    const help = `${msg}\n\n${connectHelp(probe)}`;
    appendThreadMessages(active.id, [{ ...assistantMsg, text: help, done: true, sources: [], tools: toolResults }]);
    return {
      threadId: active.id,
      title: getThread(active.id)?.title,
      text: help,
      sources: [],
      tools: toolResults,
      error: true,
    };
  }
}
