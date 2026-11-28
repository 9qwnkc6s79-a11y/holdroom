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
import { previewProfile } from "../preview-overrides.ts";
import { createHmac, timingSafeEqual } from "node:crypto";
import { approvalCardForCall } from "../approvals.ts";
import { newChatMessage } from "../chat.ts";
import { NORTH_DESK, migrateWorkspaceId } from "../departments.ts";
import { compileEthics, loadEthics } from "../ethics.ts";
import { forStorage } from "../images.ts";
import { agentLlmConfig, llmConfig, type LlmEndpoint } from "../llm.ts";
import { readRunpodHealth, readRunpodJob, runpodEndpointId, submitRunpodChat } from "../runpod-jobs.ts";
import { appendThreadMessages, createThread, getThread, recordAuditEntry, resolveAgent } from "../store.ts";
import { buildLongThreadContext } from "../thread-history.ts";
import { ensureThreadScoped, saveThreadScoped } from "../thread-store.ts";
import { thinkingOffExtras } from "../think.ts";
import type { ApprovalCard, ChatAttachment, EmailDraftCard, Source, ToolEvent, TurnAnchor } from "../types.ts";
import { scrubVaultSecrets } from "../vault.ts";
import { vaultKey } from "../vault-crypto.ts";
import type { Evidence } from "./context.ts";
import { openAiTool } from "./system-prompt.ts";
import type { RunpodChatBody } from "../runpod-jobs.ts";
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
  /** Preview-only QA profile name (signed with the rest of the state). */
  profile?: string;
  job?: { id: string; endpointId: string; lane: Lane; purpose: ModelRequest["purpose"]; submittedAt?: number; native?: boolean };
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
  emailDraft?: EmailDraftCard;
  title?: string;
  error?: boolean;
  modelOffline?: boolean;
  harness?: true;
  /** Claim-check counts for the final answer (no text). */
  verification?: HarnessState["verification"];
}

export interface HarnessTurnInput {
  query: string;
  /** Preview-only QA profile (x-hatch-qa-profile). Ignored in production. */
  profile?: string;
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
export function harnessConfigFromEnv(ethicsModel?: string, profile?: string): Partial<HarnessConfig> {
  const p = previewProfile(profile) || {};
  const env = (key: string) => p[key] ?? process.env[key];
  const lane = (env("HATCH_AGENT_TOOL_LANE") || "").toLowerCase();
  const synth = (env("HATCH_AGENT_SYNTH_LANE") || "same").toLowerCase();
  const toolLane: Lane = lane === "agent" || lane === "hermes" || (!lane && ethicsModel === "hermes") ? "agent" : "ask";
  const askWindow = Number(env("HATCH_ASK_CONTEXT_TOKENS") || 32768);
  const agentWindow = Number(env("HATCH_AGENT_CONTEXT_TOKENS") || 16384);
  return {
    toolLane,
    synthLane: synth === "ask" || synth === "agent" ? synth : "same",
    windows: { ask: { contextTokens: askWindow, outputTokens: 1600 }, agent: { contextTokens: agentWindow, outputTokens: 1400 } },
    verifyClaims: (env("HATCH_VERIFY_CLAIMS") || "on").toLowerCase() !== "off",
    thinkOnTools: (env("HATCH_THINK_ON_TOOLS") || "off").toLowerCase() === "on",
    toolProtocol: {
      ask: (env("HATCH_ASK_TOOL_PROTOCOL") || "text") === "native" ? "native" : "text",
      agent: (env("HATCH_AGENT_TOOL_PROTOCOL") || "native") === "text" ? "text" : "native",
    },
  };
}

function todayIsoCentral(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.HATCH_TIME_ZONE || "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function todayHuman(now = new Date()): string {
  const tz = process.env.HATCH_TIME_ZONE || "America/Chicago";
  const datePart = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
  const timePart = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now);
  return `${datePart}, ${timePart} CT`;
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

function endpointFor(lane: Lane, profile?: string): LlmEndpoint {
  const base = lane === "agent" ? agentLlmConfig().primary : llmConfig().primary;
  const p = lane === "ask" ? previewProfile(profile) : null;
  if (!p?.HATCH_LLM_BASE_URL) return base;
  const raw = p.HATCH_LLM_BASE_URL.replace(/\/$/, "");
  return { ...base, rawBase: raw, openaiRoot: raw, nativeRoot: raw.replace(/\/v1$/, ""), host: new URL(raw).host, model: p.HATCH_LLM_MODEL || base.model };
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
      ...(item.url ? { url: item.url } : {}),
    }));
}

function extractTurnAnchor(state: HarnessState): TurnAnchor | undefined {
  const used = state.evidence
    .filter((e) => !e.shallow && e.source !== "memory")
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.08) return b.score - a.score;
      return (b.date || "").localeCompare(a.date || "");
    })
    .slice(0, 4);
  if (!used.length) return undefined;
  const people: string[] = [];
  const emails: string[] = [];
  const subjects: string[] = [];
  const refs: string[] = [];
  const fileRefs: string[] = [];
  for (const item of used) {
    if (item.source === "mail" && item.ref) refs.push(item.ref);
    if (item.source === "files" && item.ref) fileRefs.push(item.ref);
    if (item.title) subjects.push(item.title);
    if (item.meta?.replyToEmail) emails.push(item.meta.replyToEmail.toLowerCase());
    const fromMatches = item.text.matchAll(/^From:\s*([^\n<]+)?(?:<([^>\n]+)>)?/gim);
    for (const m of fromMatches) {
      const name = (m[1] || "").replace(/["']/g, "").trim();
      const addr = (m[2] || "").trim().toLowerCase();
      if (addr && (!item.meta?.accountEmail || addr !== item.meta.accountEmail.toLowerCase())) emails.push(addr);
      if (name && !/daniel keene/i.test(name)) people.push(name);
    }
  }
  return {
    topic: state.intent.phrases[0] || state.intent.terms.slice(0, 3).join(" "),
    people: [...new Set(people)].slice(0, 4),
    emails: [...new Set(emails)].slice(0, 4),
    subjects: [...new Set(subjects)].slice(0, 4),
    refs: [...new Set(refs)].slice(0, 4),
    fileRefs: [...new Set(fileRefs)].slice(0, 4),
  };
}

function pack(state: HarnessLiveState, result: Omit<HarnessTurnResult, "threadId" | "messageId" | "activity" | "status" | "harness">): HarnessTurnResult {
  const status = currentStatus(state.harness);
  const out: HarnessTurnResult = {
    ...result,
    harness: true,
    threadId: state.threadId,
    messageId: state.messageId,
    activity: state.harness.activity.events,
    status: result.phase === "done" ? "" : status,
    note: result.phase === "wait" ? result.note || status : undefined,
    verification: result.phase === "done" ? state.harness.verification : undefined,
  };
  if (out.state) out.state.sig = sign(out.state);
  return out;
}

async function finish(
  state: HarnessLiveState,
  text: string,
  approval?: ApprovalCard,
  error = false,
  emailDraft?: EmailDraftCard,
): Promise<HarnessTurnResult> {
  const anchor = !error ? extractTurnAnchor(state.harness) : undefined;
  const message = {
    ...newChatMessage("assistant", text),
    id: state.messageId,
    done: true,
    sources: sourcesOf(state.harness.evidence),
    tools: toolEvents(state.harness),
    approval,
    emailDraft,
    anchor,
  };
  await ensureThreadScoped(state.testerCode, state.threadId);
  appendThreadMessages(state.threadId, [message]);
  await saveThreadScoped(state.testerCode, getThread(state.threadId));
  return pack(state, {
    phase: "done",
    text,
    tools: message.tools,
    sources: message.sources,
    approval,
    emailDraft,
    title: getThread(state.threadId)?.title,
    error: error || undefined,
    modelOffline: error || undefined,
  });
}

/** vLLM's answer when tools are sent to a server without auto tool choice. */
export function isNativeToolRefusal(error: string): boolean {
  return /auto.?tool.?choice|tool.?call.?parser|tool_choice|enable-auto-tool-choice/i.test(error);
}

async function waitNoteForJob(
  endpoint: LlmEndpoint,
  jobStatus: string,
  submittedAt: number | undefined,
  fallbackStatus: string,
): Promise<string> {
  if (jobStatus === "IN_PROGRESS") return fallbackStatus;
  const queuedMs = submittedAt ? Date.now() - submittedAt : 0;
  const health = await readRunpodHealth(endpoint);
  const cold = (health !== null && health.readyWorkers === 0) || queuedMs >= 20_000;
  return cold
    ? "Warming up the firm model… the first message after a break can take 2–5 minutes."
    : fallbackStatus;
}

async function submit(state: HarnessLiveState, request: ModelRequest): Promise<HarnessTurnResult> {
  let lane = request.lane;
  let endpoint = endpointFor(lane, state.profile);
  if (!runpodEndpointId(endpoint.rawBase) || !endpoint.apiKey) {
    // Agent lane not configured: fall back to Ask rather than failing.
    lane = "ask";
    endpoint = endpointFor("ask", state.profile);
  }
  const endpointId = runpodEndpointId(endpoint.rawBase);
  if (!endpointId || !endpoint.apiKey) {
    return await finish(state, "The firm model is offline. The RunPod key is not set on this system. Nothing was sent to an outside AI lab.", undefined, true);
  }
  const tools = request.nativeTools?.map(openAiTool);
  const [jobId, health] = await Promise.all([
    submitRunpodChat(endpoint, {
      model: endpoint.model,
      messages: request.messages as RunpodChatBody["messages"],
      tools,
      temperature: typeof state.temperature === "number" ? Math.min(state.temperature, 0.5) : 0.3,
      extras: request.think
        ? { max_tokens: request.maxTokens, chat_template_kwargs: { enable_thinking: true } }
        : { ...thinkingOffExtras(true), max_tokens: request.maxTokens },
    }),
    readRunpodHealth(endpoint),
  ]);
  state.job = { id: jobId, endpointId, lane, purpose: request.purpose, submittedAt: Date.now(), native: request.protocol === "native" };
  const cold = health !== null && health.readyWorkers === 0;
  return pack(state, {
    phase: "wait",
    state,
    note: cold ? "Warming up the firm model… the first message after a break can take 2–5 minutes." : currentStatus(state.harness),
  });
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
    if (next.kind === "done") {
      return await finish(state, next.emailDraft ? next.text || "" : next.text || "I could not write an answer this time.", undefined, false, next.emailDraft);
    }
    if (next.kind === "approval") {
      const card = approvalCardForCall({ name: next.call.name, arguments: next.call.arguments }, { agentId: state.agentId });
      return await finish(state, next.text || card.summary, card);
    }
    return submit(state, next.request);
  }
  return await finish(state, state.harness.answer || "I could not finish that. Try asking again.");
}

export async function startHarnessTurn(input: HarnessTurnInput): Promise<HarnessTurnResult> {
  const startedAt = Date.now();
  const scope = input.testerCode || "staff";
  const workspaceId = migrateWorkspaceId(input.departmentId || input.roomId || NORTH_DESK);
  const query = input.query.trim();
  const agent = resolveAgent(input.agentId);
  if (input.threadId) await ensureThreadScoped(scope, input.threadId);
  const existing = input.threadId ? getThread(input.threadId) : null;
  const thread = existing || createThread(workspaceId, query.slice(0, 42), agent.id);
  const priorMessages = thread.messages || [];
  const longCtx = buildLongThreadContext(priorMessages, { maxMessages: 8, maxChars: 6000 });
  appendThreadMessages(thread.id, [
    newChatMessage("user", query, {
      attachments: Array.isArray(input.attachments) ? input.attachments.map(forStorage) : undefined,
      replyTo: input.replyTo,
    }),
  ]);
  await saveThreadScoped(scope, getThread(thread.id));
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
    history: longCtx.turns,
    earlierSummary: longCtx.earlierSummary,
    anchor: longCtx.anchor,
    priorAnchors: longCtx.priorAnchors,
    connected: kinds,
    memory,
    ethics: compileEthics(ethics, { toolTurn: true }),
    today: todayHuman(),
    todayIso: todayIsoCentral(),
    config: harnessConfigFromEnv(ethics.model, input.profile),
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
    profile: previewProfile(input.profile) ? input.profile : undefined,
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
    const endpoint = endpointFor(state.job.lane, state.profile);
    if (runpodEndpointId(endpoint.rawBase) !== state.job.endpointId) return await finish(state, "That model endpoint is not configured.", undefined, true);
    const job = await readRunpodJob(endpoint, state.job.id);
    if (!job.done && !job.failed) {
      const note = await waitNoteForJob(endpoint, job.status, state.job.submittedAt, currentStatus(state.harness));
      return pack(state, { phase: "wait", state, note });
    }
    const purpose = state.job.purpose;
    const wasNative = Boolean(state.job.native);
    const jobLane = state.job.lane;
    state.job = undefined;
    const nativeRefused = state.job === undefined && wasNative && isNativeToolRefusal(job.error || job.outputError || "");
    if (nativeRefused) {
      // The endpoint was started without --enable-auto-tool-choice: retry this turn with the text protocol.
      state.harness.config.toolProtocol = { ...state.harness.config.toolProtocol, [jobLane]: "text" };
      state.harness.nativeFallback = true;
      state.harness.modelTurns = Math.max(0, state.harness.modelTurns);
      return drive(state, startedAt);
    }
    const overflow = /maximum context length|reduce the length of the input|context_length_exceeded/i.test(`${job.error || ""} ${job.outputError || ""}`);
    if (overflow && (state.harness.contextRetries || 0) < 2) {
      // Too much evidence for this model's window: shrink the budget and ask again instead of failing the turn.
      state.harness.contextRetries = (state.harness.contextRetries || 0) + 1;
      const win = state.harness.config.windows[jobLane];
      state.harness.config.windows = { ...state.harness.config.windows, [jobLane]: { ...win, contextTokens: Math.floor(win.contextTokens * 0.72) } };
      return drive(state, startedAt);
    }
    if (job.failed) return await finish(state, `The model is offline. ${job.error || "The firm model failed."} Nothing was sent to an outside AI lab.`, undefined, true);
    applyModelOutput(state.harness, { text: job.text, toolCalls: job.toolCalls }, purpose);
  }
  return drive(state, startedAt);
}
