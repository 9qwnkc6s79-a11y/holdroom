import { toolNeedsApproval } from "./action-cards.ts";
import { agentById } from "./agents.ts";
import { approvalCardForCall } from "./approvals.ts";
import { newChatMessage } from "./chat.ts";
import { LITTLE_ELM, migrateWorkspaceId } from "./departments.ts";
import { agentLlmConfig, llmConfig, type ChatMessage as LlmMessage, type LlmEndpoint } from "./llm.ts";
import { buildAgentMessages, buildAskMessages } from "./prompt.ts";
import { readRunpodJob, runpodEndpointId, submitRunpodChat } from "./runpod-jobs.ts";
import {
  appendThreadMessages,
  createThread,
  fileListing,
  getThread,
  recordAuditEntry,
  retrieveFirm,
} from "./store.ts";
import { thinkingOffExtras } from "./think.ts";
import { inspectThreadHistory } from "./thread-history.ts";
import { executeTool, mentionedReads, openaiToolSchemas, type ToolCall } from "./tools.ts";
import type { ApprovalCard, ChatAttachment, Source, ToolEvent } from "./types.ts";
import { scrubVaultSecrets } from "./vault.ts";

const MAX_MODEL_TURNS = 4;

export interface LiveTurnState {
  version: 1;
  threadId: string;
  messageId: string;
  query: string;
  agentId: string;
  actor: string;
  workspaceId: string;
  accessibleDepartments: string[];
  enterprise: boolean;
  defaultDepartmentId: string;
  lane: "ask" | "agent";
  llmMessages: LlmMessage[];
  visible: string;
  tools: ToolEvent[];
  sources: Source[];
  job?: { id: string; endpointId: string; lane: "ask" | "agent" };
  turnsLeft: number;
}

export interface LiveTurnResult {
  phase: "wait" | "done";
  state?: LiveTurnState;
  note?: string;
  threadId: string;
  messageId?: string;
  text?: string;
  tools?: ToolEvent[];
  sources?: Source[];
  approval?: ApprovalCard;
  title?: string;
  error?: boolean;
  modelOffline?: boolean;
}

export interface LiveTurnInput {
  query: string;
  departmentId?: string;
  roomId?: string;
  threadId?: string;
  accessibleDepartments?: string[];
  enterprise?: boolean;
  attachments?: ChatAttachment[];
  agent?: boolean;
  agentId?: string;
  actor?: string;
  defaultDepartmentId?: string;
}

export function liveRunpodReady(): boolean {
  const ask = llmConfig().primary;
  const agent = agentLlmConfig().primary;
  return Boolean(
    (ask.kind === "remote" && runpodEndpointId(ask.rawBase) && ask.apiKey) ||
      (agent.kind === "remote" && runpodEndpointId(agent.rawBase) && agent.apiKey),
  );
}

export async function startLiveTurn(input: LiveTurnInput): Promise<LiveTurnResult> {
  const workspaceId = migrateWorkspaceId(input.departmentId || input.roomId || LITTLE_ELM);
  const query = input.query.trim();
  const agent = agentById(input.agentId);
  const thread = input.threadId ? getThread(input.threadId) : createThread(workspaceId, query.slice(0, 42), agent.id);
  const active = thread || createThread(workspaceId, query.slice(0, 42), agent.id);
  const sources = retrieveFirm(query);
  const reads = mentionedReads(query);
  const tools = reads.map((item) => item.event);
  const user = newChatMessage("user", query, {
    attachments: Array.isArray(input.attachments) ? input.attachments : undefined,
  });
  const assistant = newChatMessage("assistant", "", { done: false });
  appendThreadMessages(active.id, [user]);
  recordAuditEntry(
    {
      name: "ask",
      ok: true,
      detail: scrubVaultSecrets(`${agent.name}: ${query}`).slice(0, 400),
      departmentId: workspaceId,
    },
    { actor: input.actor || "signed-in", agentId: agent.id, kind: "ask" },
  );
  const history = inspectThreadHistory(getThread(active.id)?.messages || [], { excludeLastUser: query }).turns;
  const lane = input.agent === false ? "ask" : "agent";
  const prompt = {
    workspaceId,
    query,
    sources,
    fileListing: fileListing(workspaceId),
    toolResults: tools,
    extra: reads.map((item) => item.extra).filter(Boolean),
    accessibleDepartments: input.accessibleDepartments || [],
    history,
    defaultDepartmentId: input.defaultDepartmentId || agent.writeDepartmentId,
  };
  const state: LiveTurnState = {
    version: 1,
    threadId: active.id,
    messageId: assistant.id,
    query,
    agentId: agent.id,
    actor: input.actor || "signed-in",
    workspaceId,
    accessibleDepartments: input.accessibleDepartments || [],
    enterprise: Boolean(input.enterprise),
    defaultDepartmentId: input.defaultDepartmentId || agent.writeDepartmentId,
    lane,
    llmMessages: lane === "agent" ? buildAgentMessages(prompt) : buildAskMessages(prompt),
    visible: "",
    tools,
    sources,
    turnsLeft: MAX_MODEL_TURNS,
  };
  return advanceLiveTurn(state);
}

export async function advanceLiveTurn(state: LiveTurnState): Promise<LiveTurnResult> {
  if (state.job) {
    const endpoint = endpointFor(state.job.lane, state.job.endpointId);
    if (!endpoint) return finishError(state, "That model endpoint is not configured.");
    const job = await readRunpodJob(endpoint, state.job.id);
    if (!job.done && !job.failed) {
      const note =
        job.status === "IN_PROGRESS"
          ? "The firm model is running."
          : "The firm model is waking up. A cold start can take a few minutes.";
      return { phase: "wait", state, note, threadId: state.threadId, messageId: state.messageId };
    }
    state.job = undefined;
    state.turnsLeft -= 1;
    if (job.failed) return finishError(state, job.error || "The firm model failed.");
    state.visible = [state.visible, job.text].filter(Boolean).join("\n\n");
    const held = job.toolCalls.find((call) => toolNeedsApproval(call.name));
    const safe = job.toolCalls.filter((call) => !toolNeedsApproval(call.name));
    if (state.lane === "agent") {
      const extras: string[] = [];
      for (const call of safe) {
        const result = executeTool(call, toolContext(state));
        state.tools.push(result.event);
        if (result.sources?.length) state.sources.push(...result.sources);
        if (result.extra) extras.push(result.extra);
      }
      if (held) return finishApproval(state, held);
      if (safe.length && state.turnsLeft > 0) {
        state.llmMessages = [
          ...state.llmMessages,
          { role: "assistant", content: job.text || "(tool call)" },
          {
            role: "user",
            content: [
              "Tool results:",
              ...state.tools.slice(-safe.length).map((tool) => `- ${tool.name}: ${tool.ok ? "ok" : "denied"} — ${tool.detail}`),
              ...extras,
              "Continue. If you can answer now, answer in prose. If you need another tool, call it.",
            ].join("\n"),
          },
        ];
        return submit(state);
      }
    }
    return finishText(state);
  }
  return submit(state);
}

async function submit(state: LiveTurnState): Promise<LiveTurnResult> {
  const lane = state.lane;
  const endpoint = lane === "agent" ? agentLlmConfig().primary : llmConfig().primary;
  const endpointId = runpodEndpointId(endpoint.rawBase);
  if (!endpointId || !endpoint.apiKey) {
    return finishError(state, "The firm model is offline. The RunPod key is not set on this system.");
  }
  const jobId = await submitRunpodChat(endpoint, {
    model: endpoint.model,
    messages: state.llmMessages,
    tools: lane === "agent" ? openaiToolSchemas() : undefined,
    extras: thinkingOffExtras(true),
  });
  state.job = { id: jobId, endpointId, lane };
  return {
    phase: "wait",
    state,
    note: "The firm model is waking up. A cold start can take a few minutes.",
    threadId: state.threadId,
    messageId: state.messageId,
  };
}

function endpointFor(lane: "ask" | "agent", endpointId: string): LlmEndpoint | null {
  const endpoint = lane === "agent" ? agentLlmConfig().primary : llmConfig().primary;
  if (runpodEndpointId(endpoint.rawBase) !== endpointId) return null;
  return endpoint;
}

function toolContext(state: LiveTurnState) {
  return {
    workspaceId: state.workspaceId,
    accessibleDepartments: state.accessibleDepartments,
    enterprise: state.enterprise,
    defaultDepartmentId: state.defaultDepartmentId,
  };
}

function finishApproval(state: LiveTurnState, call: ToolCall): LiveTurnResult {
  const approval = approvalCardForCall(call, { agentId: state.agentId });
  const text = state.visible.trim() || approval.summary;
  const message = {
    ...newChatMessage("assistant", text),
    id: state.messageId,
    done: true,
    sources: state.sources,
    tools: state.tools,
    approval,
  };
  appendThreadMessages(state.threadId, [message]);
  return {
    phase: "done",
    threadId: state.threadId,
    messageId: message.id,
    text,
    tools: state.tools,
    sources: state.sources,
    approval,
    title: getThread(state.threadId)?.title,
  };
}

function finishText(state: LiveTurnState): LiveTurnResult {
  const text = state.visible.trim() || "The model returned an empty reply.";
  const message = {
    ...newChatMessage("assistant", text),
    id: state.messageId,
    done: true,
    sources: state.sources,
    tools: state.tools,
  };
  appendThreadMessages(state.threadId, [message]);
  return {
    phase: "done",
    threadId: state.threadId,
    messageId: message.id,
    text,
    tools: state.tools,
    sources: state.sources,
    title: getThread(state.threadId)?.title,
  };
}

function finishError(state: LiveTurnState, detail: string): LiveTurnResult {
  const text = `The model is offline. ${detail} Nothing was sent to an outside AI lab.`;
  const message = {
    ...newChatMessage("assistant", text),
    id: state.messageId,
    done: true,
    sources: [],
    tools: state.tools,
  };
  appendThreadMessages(state.threadId, [message]);
  return {
    phase: "done",
    threadId: state.threadId,
    messageId: message.id,
    text,
    tools: state.tools,
    error: true,
    modelOffline: true,
    title: getThread(state.threadId)?.title,
  };
}
