import { runAgentLoop } from "./agent";
import { wantsAgentTurn } from "./agent-intent";
import { resolveAgent } from "./store.ts";
import { approvalCardForCall } from "./approvals.ts";
import { demoModeEnabled, modelOfflineMessage, planDemoReply, streamText } from "./demo.ts";
import { LITTLE_ELM, migrateWorkspaceId } from "./departments";
import { scheduleImageCaption } from "./image-caption.ts";
import { forStorage, modelTextForTurn, withImageParts } from "./images.ts";
import { agentLlmConfig, connectHelp, isRunpodUrl, llmConfig, probeAgentLlm, probeLlm, streamLlm } from "./llm";
import { buildAskMessages } from "./prompt";
import { missingImageMessage, prepareTurnImages } from "./vision-turn.ts";
import { inspectThreadHistory } from "./thread-history.ts";
import { appendThreadMessages, createThread, fileListing, getThread, recordAuditEntry, retrieveFirm } from "./store";
import { stripThinkBlocks } from "./think.ts";
import { toolNeedsApproval } from "./action-cards.ts";
import { executeTool, mentionedReads, parseToolTrailer, stripToolTrailer } from "./tools";
import type { ApprovalCard, ChatAttachment, ChatMessage, Source, ToolEvent } from "./types";
import { scrubVaultSecrets } from "./vault.ts";

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
  /** File text for the model. Kept out of the saved user bubble. */
  context?: string;
  departmentId?: string;
  roomId?: string;
  threadId?: string;
  accessibleDepartments?: string[];
  enterprise?: boolean;
  attachments?: ChatAttachment[];
  agent?: boolean;
  defaultDepartmentId?: string;
  agentId?: string;
  actor?: string;
  /** Web UI: do not sit on a dead RunPod call. Telegram keeps the long cold-start wait. */
  failFast?: boolean;
  /** Web UI waits for Approve / Cancel before a send, change, delete, or vault use. */
  approvals?: "wait" | "immediate";
  replyTo?: { text: string };
}

export interface ChatTurnResult {
  threadId: string;
  title?: string;
  text: string;
  sources: Source[];
  tools: ToolEvent[];
  error?: boolean;
  historyDropped?: boolean;
  lane?: "ask" | "agent";
  messageId?: string;
  pendingApproval?: ApprovalCard;
  demo?: boolean;
  modelOffline?: boolean;
}

export interface ChatTurnHooks {
  onStart?: (info: { threadId: string }) => void;
  onDelta?: (delta: string) => void;
}

/** Same Ask (Qwen) / agent (Hermes) turn as `/api/chat` and the Chat tab. */
export async function runChatTurn(input: ChatTurnInput, hooks: ChatTurnHooks = {}): Promise<ChatTurnResult> {
  const workspaceId = migrateWorkspaceId(input.departmentId || input.roomId || LITTLE_ELM);
  const query = (input.query || "").trim();
  const prepared = await prepareTurnImages(input.attachments);
  const modelQuery = modelTextForTurn(query, input.context, prepared.hasImage);
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
    attachments: Array.isArray(input.attachments) ? input.attachments.map(forStorage) : undefined,
    replyTo: input.replyTo,
  });
  const assistantMsg = newChatMessage("assistant", "", { done: false });
  appendThreadMessages(active.id, [userMsg]);
  const hatchAgent = resolveAgent(input.agentId);
  recordAuditEntry(
    {
      name: "ask",
      ok: true,
      detail: scrubVaultSecrets(`${hatchAgent.name}: ${query}`).slice(0, 400),
      departmentId: workspaceId,
    },
    { actor: input.actor || "signed-in", agentId: hatchAgent.id, kind: "ask" },
  );

  if (demoModeEnabled()) {
    const demoSources = retrieveFirm(query, 4);
    const plan = planDemoReply({ query: modelQuery, agentId: hatchAgent.id, sources: demoSources });
    await streamText(plan.text, hooks.onDelta);
    const demoMessage: ChatMessage = {
      ...assistantMsg,
      text: plan.text,
      done: true,
      sources: plan.sources,
      tools: plan.tools,
      approval: plan.approval,
    };
    appendThreadMessages(active.id, [demoMessage]);
    return {
      threadId: active.id,
      title: getThread(active.id)?.title,
      text: plan.text,
      sources: plan.sources,
      tools: plan.tools,
      messageId: demoMessage.id,
      pendingApproval: plan.approval,
      demo: true,
      lane: "agent",
    };
  }

  const inspected = inspectThreadHistory(getThread(active.id)?.messages || [], { excludeLastUser: query });
  const history = inspected.turns;

  if (prepared.hasImage && !prepared.dataUrls.length) {
    const detail = missingImageMessage((input.attachments || []).map((file) => file.name));
    const missed: ChatMessage = { ...assistantMsg, text: detail, done: true, sources: [], tools: toolResults };
    appendThreadMessages(active.id, [missed]);
    return {
      threadId: active.id,
      title: getThread(active.id)?.title,
      text: detail,
      sources: [],
      tools: toolResults,
      error: true,
      messageId: missed.id,
      historyDropped: inspected.dropped,
      lane: "ask",
    };
  }

  const agentic = prepared.hasImage ? false : wantsAgentTurn(query, input.agent);
  const probe = agentic ? await probeAgentLlm() : await probeLlm();
  const { primary } = agentic ? agentLlmConfig() : llmConfig();
  const runpodReady = isRunpodUrl(primary.rawBase) && Boolean(primary.apiKey);
  const optimisticTimeout = Boolean(probe.error && /timed out/i.test(probe.error));

  if (input.failFast && (!probe.connected || optimisticTimeout)) {
    const detail = modelOfflineMessage(probe.error);
    const offlineMessage: ChatMessage = { ...assistantMsg, text: detail, done: true, sources: [], tools: toolResults };
    appendThreadMessages(active.id, [offlineMessage]);
    return {
      threadId: active.id,
      title: getThread(active.id)?.title,
      text: detail,
      sources: [],
      tools: toolResults,
      error: true,
      modelOffline: true,
      messageId: offlineMessage.id,
      historyDropped: inspected.dropped,
      lane: agentic ? "agent" : "ask",
    };
  }

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
      historyDropped: inspected.dropped,
      lane: agentic ? "agent" : "ask",
    };
  }

  const promptInput = {
    workspaceId,
    query: modelQuery,
    sources,
    fileListing: listing,
    toolResults,
    extra,
    accessibleDepartments,
    history,
    defaultDepartmentId: input.defaultDepartmentId,
    seeingImage: prepared.hasImage,
  };

  let text = "";
  let pendingApproval: ApprovalCard | undefined;
  try {
    if (agentic) {
      const result = await runAgentLoop(
        { ...promptInput, enterprise: input.enterprise, defaultDepartmentId: input.defaultDepartmentId },
        (delta) => {
          text += delta;
          hooks.onDelta?.(delta);
        },
        { pauseMutations: input.approvals === "wait" },
      );
      text = stripThinkBlocks(result.text || text);
      toolResults.splice(0, toolResults.length, ...result.tools);
      sources.splice(0, sources.length, ...result.sources);
      const held = result.pendingCalls?.[0];
      if (held && input.approvals === "wait") {
        pendingApproval = approvalCardForCall(held, { agentId: hatchAgent.id });
        if (!text.trim()) text = pendingApproval.summary;
      }
    } else {
      const messages = withImageParts(buildAskMessages(promptInput), prepared.dataUrls);
      const streamed = await streamLlm(messages, (delta) => {
        text += delta;
        hooks.onDelta?.(delta);
      });
      text = stripThinkBlocks(streamed.text || text);
      const call = parseToolTrailer(text);
      if (call && input.approvals === "wait" && toolNeedsApproval(call.name)) {
        pendingApproval = approvalCardForCall(call, { agentId: hatchAgent.id });
        text = stripThinkBlocks(stripToolTrailer(text) || text) || pendingApproval.summary;
      } else if (call) {
        const result = executeTool(call, {
          workspaceId,
          accessibleDepartments,
          enterprise: input.enterprise,
          defaultDepartmentId: input.defaultDepartmentId,
        });
        toolResults.push(result.event);
        if (result.sources?.length) sources.push(...result.sources);
        text = stripThinkBlocks(stripToolTrailer(text) || text);
      } else {
        text = stripThinkBlocks(stripToolTrailer(text) || text);
      }
    }
    const final: ChatMessage = {
      ...assistantMsg,
      text,
      done: true,
      sources,
      tools: toolResults,
      approval: pendingApproval,
    };
    appendThreadMessages(active.id, [final]);
    if (prepared.hasImage && prepared.fileIds.length) scheduleImageCaption(prepared.fileIds);
    return {
      threadId: active.id,
      title: getThread(active.id)?.title,
      text,
      sources,
      tools: toolResults,
      messageId: final.id,
      pendingApproval,
      historyDropped: inspected.dropped,
      lane: agentic ? "agent" : "ask",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM failed";
    const rejected = prepared.hasImage && /image|multimodal|vision|content type|unsupported/i.test(msg);
    const help = rejected
      ? `The firm model rejected the picture. The Ask worker needs vLLM 0.17 or newer with the Qwen3.8 vision tower loaded, not a text-only setup. ${msg} Nothing was sent to an outside AI lab.`
      : input.failFast
        ? modelOfflineMessage(msg)
        : `${msg}\n\n${connectHelp(probe)}`;
    const failed: ChatMessage = { ...assistantMsg, text: help, done: true, sources: [], tools: toolResults };
    appendThreadMessages(active.id, [failed]);
    return {
      threadId: active.id,
      title: getThread(active.id)?.title,
      text: help,
      sources: [],
      tools: toolResults,
      error: true,
      modelOffline: Boolean(input.failFast),
      messageId: failed.id,
      historyDropped: inspected.dropped,
      lane: agentic ? "agent" : "ask",
    };
  }
}
