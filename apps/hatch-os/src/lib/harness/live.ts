/**
 * Live driver: runs the harness inside Hatch's poll-based chat API.
 *
 * POST /api/chat        -> startHarnessTurn()  (gathers, submits the first model job)
 * POST /api/chat/step   -> advanceHarnessTurn() (polls the job, runs tools, submits the next job)
 *
 * Every response carries `activity` (ActivityEvent[]) and `status` (one line for
 * the bottom of the chat). `note` mirrors `status` so the current UI shows it.
 * The state that round-trips through the client is HMAC-signed, so a client
 * cannot swap in another tester's scope or edit the gathered evidence.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { approvalCardForCall } from "../approvals.ts";
import { newChatMessage } from "../chat.ts";
import { LITTLE_ELM, migrateWorkspaceId } from "../departments.ts";
import { compileEthics, loadEthics } from "../ethics.ts";
import { forStorage } from "../images.ts";
import { agentLlmConfig, llmConfig, type LlmEndpoint } from "../llm.ts";
import { readRunpodJob, runpodEndpointId, submitRunpodChat } from "../runpod-jobs.ts";
import { appendThreadMessages, createThread, getThread, recordAuditEntry, resolveAgent } from "../store.ts";
import { inspectThreadHistory } from "../thread-history.ts";
import { thinkingOffExtras } from "../think.ts";
import type { ApprovalCard, ChatAttachment, Source, ToolEvent } from "../types.ts";
import { scrubVaultSecrets } from "../vault.ts";
import { vaultKey } from "../vault-crypto.ts";
import type { Evidence } from "./context.ts";
import { advance, applyModelOutput, currentStatus, finishRemember, initHarness, type HarnessConfig, type HarnessState, type Lane, type ModelRequest } from "./engine.ts";
import type { ActivityEvent } from "./events.ts";
import { connectedKinds, liveRunNamed, liveTools } from "./live-sources.ts";
import { loadMemory, rememberFact } from "./memory-store.ts";

export interface HarnessLiveState {
  version: 2;
  threadId: string;
  messageId: string;
  agentId: string;
  actor: string;
  workspaceId: string;
  testerCode: string;
  startedAt: number;
  temperature?: number;
  harness: HarnessState;
  job?: { id: string; endpointId: string; lane: Lane; purpose: ModelRequest["purpose"] };
  sig?: string;
}

export interface HarnessTurnResult {
  phase: "wait" | "done";
  state?: HarnessLiveState;
  note?: string;
  status?: string;
  activity?: ActivityEvent[];
  threadId: string;
  messageId?: string;
  text?: string;
  tools?: ToolEvent[];
  sources?: Source[];
  approval?: ApprovalCard;
  title?: string;
  error?: boolean;
  modelOffline?: boolean;
  harness?: true;
}

export interface HarnessTurnInput {
  query: string;
  departmentId?: string;
  roomId?: string;
  threadId?: string;
  attachments?: ChatAttachment[];
  agent?: boolean;
  agentId?: string;
  actor?: string;
  testerCode?: string;
  startedAt?: number;
  replyTo?: { text: string };
}

/** On unless HATCH_AGENT_HARNESS=off. Image turns keep the existing vision path. */
export function harnessEnabled(): boolean {
  return (process.env.HATCH_AGENT_HARNESS || "on").toLowerCase() !== "off";
}

export function harnessHandles(input: { attachments?: ChatAttachment[] }): boolean {
  return harnessEnabled() && !(input.attachments || []).some((file) => file.kind === "Image" || Boolean(file.image));
}

/** Lane config from env. Defaults to Qwen (Ask lane) for everything: one endpoint to wake, 32k context, better writer. */
export function harnessConfigFromEnv(ethicsModel?: string): Partial<HarnessConfig> {
  const lane = (process.env.HATCH_AGENT_TOOL_LANE || "").toLowerCase();
  const synth = (process.env.HATCH_AGENT_SYNTH_LANE || "same").toLowerCase();
  const toolLane: Lane = lane === "agent" || lane === "hermes" || (!lane && ethicsModel === "hermes") ? "agent" : "ask";
  const askWindow = Number(process.env.HATCH_ASK_CONTEXT_TOKENS || 32768);
  const agentWindow = Number(process.env.HATCH_AGENT_CONTEXT_TOKENS || 16384);
  return {
    toolLane,
    synthLane: synth === "ask" || synth === "agent" ? synth : "same",
    windows: { ask: { contextTokens: askWindow, outputTokens: 1600 }, agent: { contextTokens: agentWindow, outputTokens: 1400 } },
    toolProtocol: {
      ask: (process.env.HATCH_ASK_TOOL_PROTOCOL || "text") === "native" ? "native" : "text",
      agent: (process.env.HATCH_AGENT_TOOL_PROTOCOL || "native") === "text" ? "text" : "native",
    },
  };
}

function todayIsoCentral(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.HATCH_TIME_ZONE || "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function todayHuman(now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: process.env.HATCH_TIME_ZONE || "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
}

function sign(state: HarnessLiveState): string {
  const { sig: _sig, ...rest } = state;
  void _sig;
  return createHmac("sha256", vaultKey()).update(JSON.stringify(rest)).digest("base64url");
}

export function verifyHarnessState(state: HarnessLiveState): boolean {
  if (!state?.sig) return false;
  const want = Buffer.from(sign(state));
  const got = Buffer.from(state.sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

function endpointFor(lane: Lane): LlmEndpoint {
  return lane === "agent" ? agentLlmConfig().primary : llmConfig().primary;
}

function deps(state: HarnessLiveState, startedAt: number) {
  const kinds = new Set(state.harness.connected);
  const tools = liveTools(state.testerCode, { kinds, dateRange: state.harness.intent.dateRange });
  return { tools, runNamed: liveRunNamed(state.testerCode, tools), outOfTime: () => Date.now() - startedAt > 40_000 };
}

function toolEvents(state: HarnessState): ToolEvent[] {
  return state.activity.events
    .filter((event) => event.kind === "searching" || event.kind === "reading" || event.kind === "retrying")
    .map((event) => ({ name: event.source || "search", ok: event.status !== "failed", detail: event.label }));
}

function sourcesOf(evidence: Evidence[]): Source[] {
  return evidence
    .filter((item) => !item.shallow && item.source !== "memory")
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => ({
      file: item.title,
      room: item.source === "mail" ? "Email" : item.source === "files" ? "Files" : item.source === "calendar" ? "Calendar" : "Library",
      snippet: item.text.replace(/\s+/g, " ").slice(0, 240),
    }));
}

function pack(state: HarnessLiveState, result: Omit<HarnessTurnResult, "threadId" | "messageId" | "activity" | "status" | "harness">): HarnessTurnResult {
  const status = currentStatus(state.harness);
  const out: HarnessTurnResult = {
    ...result,
    harness: true,
    threadId: state.threadId,
    messageId: state.messageId,
    activity: state.harness.activity.events,
    status,
    note: result.phase === "wait" ? result.note || status : undefined,
  };
  if (out.state) out.state.sig = sign(out.state);
  return out;
}

function finish(state: HarnessLiveState, text: string, approval?: ApprovalCard, error = false): HarnessTurnResult {
  const message = {
    ...newChatMessage("assistant", text),
    id: state.messageId,
    done: true,
    sources: sourcesOf(state.harness.evidence),
    tools: toolEvents(state.harness),
    approval,
  };
  appendThreadMessages(state.threadId, [message]);
  return pack(state, {
    phase: "done",
    text,
    tools: message.tools,
    sources: message.sources,
    approval,
    title: getThread(state.threadId)?.title,
    error: error || undefined,
    modelOffline: error || undefined,
  });
}

async function submit(state: HarnessLiveState, request: ModelRequest): Promise<HarnessTurnResult> {
  let lane = request.lane;
  let endpoint = endpointFor(lane);
  if (!runpodEndpointId(endpoint.rawBase) || !endpoint.apiKey) {
    // Agent lane not configured: fall back to Ask rather than failing.
    lane = "ask";
    endpoint = endpointFor("ask");
  }
  const endpointId = runpodEndpointId(endpoint.rawBase);
  if (!endpointId || !endpoint.apiKey) return finish(state, "The firm model is offline. The RunPod key is not set on this system. Nothing was sent to an outside AI lab.", undefined, true);
  const tools = request.nativeTools?.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: { type: "object" as const, properties: Object.fromEntries(tool.parameters.map((p) => [p, { type: "string" }])), required: tool.parameters },
    },
  }));
  const jobId = await submitRunpodChat(endpoint, {
    model: endpoint.model,
    messages: request.messages,
    tools,
    temperature: typeof state.temperature === "number" ? Math.min(state.temperature, 0.5) : 0.3,
    extras: { ...thinkingOffExtras(true), max_tokens: request.maxTokens },
  });
  state.job = { id: jobId, endpointId, lane, purpose: request.purpose };
  return pack(state, { phase: "wait", state });
}

async function drive(state: HarnessLiveState, startedAt: number): Promise<HarnessTurnResult> {
  for (let guard = 0; guard < 6; guard++) {
    const next = await advance(state.harness, deps(state, startedAt));
    if (next.kind === "yield") return pack(state, { phase: "wait", state });
    if (next.kind === "remember") {
      await rememberFact(state.testerCode, next.fact).catch(() => undefined);
      finishRemember(state.harness, next.fact);
      continue;
    }
    if (next.kind === "done") return finish(state, next.text || "I could not write an answer this time.");
    if (next.kind === "approval") {
      const card = approvalCardForCall({ name: next.call.name, arguments: next.call.arguments }, { agentId: state.agentId });
      return finish(state, next.text || card.summary, card);
    }
    return submit(state, next.request);
  }
  return finish(state, state.harness.answer || "I could not finish that. Try asking again.");
}

export async function startHarnessTurn(input: HarnessTurnInput): Promise<HarnessTurnResult> {
  const startedAt = Date.now();
  const scope = input.testerCode || "staff";
  const workspaceId = migrateWorkspaceId(input.departmentId || input.roomId || LITTLE_ELM);
  const query = input.query.trim();
  const agent = resolveAgent(input.agentId);
  const existing = input.threadId ? getThread(input.threadId) : null;
  const thread = existing || createThread(workspaceId, query.slice(0, 42), agent.id);
  const priorMessages = thread.messages || [];
  const history = inspectThreadHistory(priorMessages, { maxMessages: 8, maxChars: 6000 }).turns;
  appendThreadMessages(thread.id, [
    newChatMessage("user", query, {
      attachments: Array.isArray(input.attachments) ? input.attachments.map(forStorage) : undefined,
      replyTo: input.replyTo,
    }),
  ]);
  recordAuditEntry(
    { name: "ask", ok: true, detail: scrubVaultSecrets(`${agent.name}: ${query}`).slice(0, 400), departmentId: workspaceId },
    { actor: input.actor || "signed-in", agentId: agent.id, kind: "ask" },
  );
  const [ethics, kinds, memory] = await Promise.all([loadEthics(scope, agent.id), connectedKinds(scope), loadMemory(scope)]);
  const attachedText = (input.attachments || [])
    .filter((file) => file.text)
    .map((file) => `Attached file "${file.name}":\n${String(file.text).slice(0, 6000)}`)
    .join("\n\n");
  const harness = initHarness({
    query: attachedText ? `${query}\n\n${attachedText}` : query,
    history,
    connected: kinds,
    memory,
    ethics: compileEthics(ethics, { toolTurn: true }),
    today: todayHuman(),
    todayIso: todayIsoCentral(),
    config: harnessConfigFromEnv(ethics.model),
  });
  // Plain agent:true from the web composer is a hint, not an order: the harness decides.
  if (input.agent === false) harness.intent = { ...harness.intent, needsTools: false, sources: [] };
  if (input.agent === false) harness.plan = [];
  const state: HarnessLiveState = {
    version: 2,
    threadId: thread.id,
    messageId: newChatMessage("assistant", "").id,
    agentId: agent.id,
    actor: input.actor || "signed-in",
    workspaceId,
    testerCode: scope,
    startedAt: input.startedAt || startedAt,
    temperature: ethics.temperature,
    harness,
  };
  return drive(state, startedAt);
}

export async function advanceHarnessTurn(state: HarnessLiveState): Promise<HarnessTurnResult> {
  const startedAt = Date.now();
  if (!verifyHarnessState(state)) {
    return { phase: "done", threadId: state?.threadId || "", text: "This reply expired. Please send your message again.", error: true };
  }
  if (state.job) {
    const endpoint = endpointFor(state.job.lane);
    if (runpodEndpointId(endpoint.rawBase) !== state.job.endpointId) return finish(state, "That model endpoint is not configured.", undefined, true);
    const job = await readRunpodJob(endpoint, state.job.id);
    if (!job.done && !job.failed) {
      const waking = job.status !== "IN_PROGRESS";
      return pack(state, {
        phase: "wait",
        state,
        note: waking ? "Waking the firm model… the first message after a break can take 2–5 minutes." : currentStatus(state.harness),
      });
    }
    const purpose = state.job.purpose;
    state.job = undefined;
    if (job.failed) return finish(state, `The model is offline. ${job.error || "The firm model failed."} Nothing was sent to an outside AI lab.`, undefined, true);
    applyModelOutput(state.harness, { text: job.text, toolCalls: job.toolCalls }, purpose);
  }
  return drive(state, startedAt);
}
