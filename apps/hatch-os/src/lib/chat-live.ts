import { toolNeedsApproval } from "./action-cards.ts";
import { wantsAgentTurn } from "./agent-intent.ts";
import { connectorToolNeedsApproval, listConnectors, runConnectorTool } from "./connectors.ts";
import { compileEthics, loadEthics } from "./ethics.ts";
import { resolveAgent } from "./store.ts";
import { approvalCardForCall } from "./approvals.ts";
import { newChatMessage } from "./chat.ts";
import { LITTLE_ELM, migrateWorkspaceId } from "./departments.ts";
import { attachmentImageUrls, forStorage, textOnlyContent, withImageParts } from "./images.ts";
import { agentLlmConfig, llmConfig, streamVisionLlm, visionLlmConfig, type ChatMessage as LlmMessage, type LlmEndpoint } from "./llm.ts";
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
import { connectorSchemas, executeTool, mentionedReads, openaiToolSchemas, type ToolCall } from "./tools.ts";
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
  job?: { id: string; endpointId: string; lane: "ask" | "agent"; vision?: boolean };
  vision?: boolean;
  turnsLeft: number;
  testerCode?: string;
  startedAt?: number;
  temperature?: number;
  connectorKinds?: string[];
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
  context?: string;
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
  replyTo?: { text: string };
  testerCode?: string;
  startedAt?: number;
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
  const modelQuery = [query, (input.context || "").trim()].filter(Boolean).join("\n\n");
  const agent = resolveAgent(input.agentId);
  const thread = input.threadId ? getThread(input.threadId) : createThread(workspaceId, query.slice(0, 42), agent.id);
  const active = thread || createThread(workspaceId, query.slice(0, 42), agent.id);
  const sources = retrieveFirm(query);
  const reads = mentionedReads(query);
  const tools = reads.map((item) => item.event);
  const user = newChatMessage("user", query, {
    attachments: Array.isArray(input.attachments) ? input.attachments.map(forStorage) : undefined,
    replyTo: input.replyTo,
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
  const ethics = await loadEthics(input.testerCode || "staff", agent.id);
  const connected = await listConnectors(input.testerCode || "staff");
  const toolTurn = ethics.model === "hermes" || wantsAgentTurn(query, false);
  const images = attachmentImageUrls(input.attachments);
  const visionOn = images.length > 0 && visionLlmConfig().enabled;
  const lane = visionOn || input.agent === false || !toolTurn ? "ask" : "agent";
  const prompt = {
    workspaceId,
    query: modelQuery,
    ethics: compileEthics(ethics, { toolTurn: lane === "agent" }),
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
    vision: visionOn,
    llmMessages: visionOn
      ? withImageParts(buildAskMessages(prompt), images)
      : lane === "agent"
        ? buildAgentMessages(prompt)
        : buildAskMessages(prompt),
    visible: "",
    tools,
    sources,
    turnsLeft: MAX_MODEL_TURNS,
    testerCode: input.testerCode,
    startedAt: input.startedAt || Date.now(),
    temperature: ethics.temperature,
    connectorKinds: connected.map((item) => item.kind),
  };
  return advanceLiveTurn(state);
}

export async function advanceLiveTurn(state: LiveTurnState): Promise<LiveTurnResult> {
  if (state.job) {
    const endpoint = endpointFor(state.job.lane, state.job.endpointId, state.job.vision);
    if (!endpoint) return finishError(state, "That model endpoint is not configured.");
    const job = await readRunpodJob(endpoint, state.job.id);
    if (!job.done && !job.failed) {
      const note =
        job.status === "IN_PROGRESS"
          ? "The firm model is running."
          : "Warming up test server… First message after a break can take 2–5 minutes. You can switch apps and come back.";
      return { phase: "wait", state, note, threadId: state.threadId, messageId: state.messageId };
    }
    state.job = undefined;
    state.turnsLeft -= 1;
    if (job.failed) return finishError(state, job.error || "The firm model failed.");
    state.visible = [state.visible, job.text].filter(Boolean).join("\n\n");
    const needsApproval = (call: ToolCall) => toolNeedsApproval(call.name) || connectorToolNeedsApproval(call.name, call.arguments);
    const held = job.toolCalls.find(needsApproval);
    const safe = job.toolCalls.filter((call) => !needsApproval(call));
    if (state.lane === "agent") {
      const extras: string[] = [];
      for (const call of safe) {
        const result: { event: ToolEvent; sources?: Source[]; extra?: string } = /^(email_|calendar_|cloud_files_|slack_|notion_|github_|linear_|mcp_)/.test(call.name)
          ? await runConnectorTool(state.testerCode || "staff", call.name, stringifyArgs(call.arguments), false)
          : executeTool(call, toolContext(state));
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

function shrinkMessages(messages: LlmMessage[]): LlmMessage[] {
  return messages.map((message) => ({ ...message, content: textOnlyContent(message.content) }));
}

async function submit(state: LiveTurnState): Promise<LiveTurnResult> {
  if (state.vision) {
    const vision = visionLlmConfig();
    const endpoint = vision.endpoint;
    if (!endpoint) return finishError(state, "No vision model is configured.");
    const endpointId = runpodEndpointId(endpoint.rawBase);
    if (endpointId && endpoint.apiKey) {
      try {
        const jobId = await submitRunpodChat(endpoint, {
          model: endpoint.model,
          messages: state.llmMessages,
          temperature: state.temperature,
          extras: thinkingOffExtras(true),
        });
        state.llmMessages = shrinkMessages(state.llmMessages);
        state.job = { id: jobId, endpointId, lane: "ask", vision: true };
        return {
          phase: "wait",
          state,
          note: "Warming up test server… First message after a break can take 2–5 minutes. You can switch apps and come back.",
          threadId: state.threadId,
          messageId: state.messageId,
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : "The vision model did not accept the photo.";
        return finishError(state, detail);
      }
    }
    try {
      const streamed = await streamVisionLlm(state.llmMessages, () => undefined);
      state.visible = streamed.text;
      state.llmMessages = shrinkMessages(state.llmMessages);
      return finishText(state);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "The vision model could not be reached.";
      return finishError(state, detail);
    }
  }
  const lane = state.lane;
  const endpoint = lane === "agent" ? agentLlmConfig().primary : llmConfig().primary;
  const endpointId = runpodEndpointId(endpoint.rawBase);
  if (!endpointId || !endpoint.apiKey) {
    return finishError(state, "The firm model is offline. The RunPod key is not set on this system.");
  }
  const jobId = await submitRunpodChat(endpoint, {
    model: endpoint.model,
    messages: state.llmMessages,
    tools: lane === "agent" ? openaiToolSchemas(connectorSchemas(new Set(state.connectorKinds || []))) : undefined,
    temperature: state.temperature,
    extras: thinkingOffExtras(true),
  });
  state.job = { id: jobId, endpointId, lane };
  return {
    phase: "wait",
    state,
    note: "Warming up test server… First message after a break can take 2–5 minutes. You can switch apps and come back.",
    threadId: state.threadId,
    messageId: state.messageId,
  };
}

function endpointFor(lane: "ask" | "agent", endpointId: string, vision?: boolean): LlmEndpoint | null {
  if (vision) {
    const endpoint = visionLlmConfig().endpoint;
    if (endpoint && runpodEndpointId(endpoint.rawBase) === endpointId) return endpoint;
    return null;
  }
  const endpoint = lane === "agent" ? agentLlmConfig().primary : llmConfig().primary;
  if (runpodEndpointId(endpoint.rawBase) !== endpointId) return null;
  return endpoint;
}

function stringifyArgs(args: Record<string, unknown> | undefined) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(args || {})) {
    out[key] = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  }
  return out;
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
