/**
 * The Hatch agent loop: understand -> gather -> (model <-> tools)* -> answer.
 *
 * Resumable by design. Vercel functions only live 60s and RunPod jobs are
 * polled, so the whole loop state is plain JSON that can be handed back to the
 * client between polls. `advance()` does all the work it can without a model
 * (tool calls are fast HTTP), then returns either a model request or the answer.
 * `applyModelOutput()` feeds a finished model job back in.
 *
 * No imports from the app store here: the offline eval runs this file with
 * mocked tools and models.
 */
import { budgetEvidence, evidenceBudgetChars, type Evidence, type LaneWindow } from "./context.ts";
import { newActivityLog, pushActivity, settleActivity, statusLine, SOURCE_LABEL, type ActivityLog, type ActivitySource } from "./events.ts";
import { analyzeIntent, type Intent, type SourceKind } from "./intent.ts";
import { matchEntities, renderMemory, type FirmMemory } from "./memory.ts";
import { buildSystemPrompt, type HarnessToolSpec } from "./system-prompt.ts";

export type Lane = "ask" | "agent";

export interface HarnessConfig {
  /** Lane that runs the tool-using model. "ask" = Qwen (text tool protocol), "agent" = Hermes (native tools). */
  toolLane: Lane;
  toolProtocol: { ask: "text" | "native"; agent: "text" | "native" };
  /** Lane that writes the final answer after tools. "same" = no separate synthesis call. */
  synthLane: "same" | Lane;
  windows: Record<Lane, LaneWindow>;
  maxModelTurns: number;
  maxReadsPerSource: number;
  maxSearchTries: number;
  /** Let plain-chat turns call tools if the model decides it needs them. */
  chatTools: boolean;
}

export const DEFAULT_CONFIG: HarnessConfig = {
  toolLane: "ask",
  toolProtocol: { ask: "text", agent: "native" },
  synthLane: "same",
  // Matches MAX_MODEL_LEN on the RunPod endpoints (Qwen 32768, Hermes 16384).
  windows: { ask: { contextTokens: 32768, outputTokens: 1600 }, agent: { contextTokens: 16384, outputTokens: 1400 } },
  maxModelTurns: 3,
  maxReadsPerSource: 3,
  maxSearchTries: 4,
  chatTools: true,
};

export interface Hit {
  title: string;
  ref?: string;
  date?: string;
  snippet?: string;
  /** Full body when the source already returned it (deep search). */
  body?: string;
  from?: string;
}

export interface HarnessTools {
  search(source: SourceKind, query: string, opts: { timeFilter?: string }): Promise<{ ok: boolean; hits: Hit[]; note?: string }>;
  read(source: SourceKind, ref: string, title?: string): Promise<{ ok: boolean; title?: string; text: string; date?: string }>;
}

export interface ToolCallLike {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelRequest {
  lane: Lane;
  messages: ChatTurn[];
  /** Only for native protocol. */
  nativeTools?: HarnessToolSpec[];
  maxTokens: number;
  purpose: "answer" | "tools" | "synthesis";
}

type PlanStep =
  | { op: "search"; source: SourceKind; queries: string[]; tried: number; widened?: number }
  | { op: "read"; source: SourceKind; ref: string; title: string; score: number };

export interface HarnessState {
  v: 2;
  query: string;
  today: string;
  history: { role: "user" | "assistant"; text: string }[];
  connected: string[];
  firmName?: string;
  userName?: string;
  memoryBlock?: string;
  ethics?: string;
  intent: Intent;
  phase: "gather" | "model" | "tools" | "synth" | "done" | "approval";
  plan: PlanStep[];
  evidence: Evidence[];
  searched: string[];
  activity: ActivityLog;
  modelTurns: number;
  /** Model-requested calls waiting to run. */
  pendingCalls: ToolCallLike[];
  /** Short log of model tool calls, replayed into the next prompt. */
  scratch: string[];
  answer?: string;
  heldCall?: ToolCallLike;
  usedTools: boolean;
  config: HarnessConfig;
}

export interface InitInput {
  query: string;
  history?: { role: "user" | "assistant"; text: string }[];
  connected: string[];
  memory?: FirmMemory | null;
  ethics?: string;
  today?: string;
  /** YYYY-MM-DD in the user's time zone, for "tmrw" / "this week". */
  todayIso?: string;
  config?: Partial<HarnessConfig>;
}

/** Tools the model may call itself (beyond what Hatch already gathered). */
export function modelToolSpecs(connected: Set<string>): HarnessToolSpec[] {
  const mail = ["email", "google", "microsoft"].some((k) => connected.has(k));
  const cloud = ["google", "microsoft"].some((k) => connected.has(k));
  const specs: HarnessToolSpec[] = [
    { name: "search_library", description: "Search the firm library (synced notes, uploaded files).", parameters: ["query"] },
  ];
  if (mail) {
    specs.push({ name: "email_search", description: "Search email. Gmail syntax works: quotes, OR, from:, newer_than:30d.", parameters: ["query"] });
    specs.push({ name: "email_read", description: "Open the full email thread by its ref from the evidence list.", parameters: ["ref"] });
    specs.push({ name: "email_draft", description: "Save a draft reply for a person to review. Does not send.", parameters: ["to", "subject", "body"] });
  }
  if (cloud) {
    specs.push({ name: "cloud_files_search", description: "Search Drive/OneDrive by name and content.", parameters: ["query"] });
    specs.push({ name: "cloud_files_read", description: "Open a file's text by its ref from the evidence list.", parameters: ["ref"] });
    specs.push({ name: "calendar_list", description: "List upcoming calendar events, optionally matching a query.", parameters: ["query"] });
  }
  return specs;
}

const WRITE_CALLS = new Set(["email_send", "calendar_create", "write_draft", "handoff_to_department", "delete_file", "use_vault", "slack_post_message", "notion_create_page", "github_create_issue", "linear_create_issue"]);

export function initHarness(input: InitInput): HarnessState {
  const config: HarnessConfig = { ...DEFAULT_CONFIG, ...(input.config || {}), windows: { ...DEFAULT_CONFIG.windows, ...(input.config?.windows || {}) }, toolProtocol: { ...DEFAULT_CONFIG.toolProtocol, ...(input.config?.toolProtocol || {}) } };
  const connected = new Set(input.connected);
  const history = (input.history || []).slice(-8);
  const intent = analyzeIntent(input.query, { memory: input.memory, connected, history, todayIso: input.todayIso });
  const matches = matchEntities(input.query, input.memory);
  const activity = newActivityLog();
  pushActivity(activity, { kind: "understanding", label: intent.entities.length ? `Understanding your ask (${intent.entities.map((e) => e.name).slice(0, 2).join(", ")})` : "Understanding your ask", source: "memory" });
  const plan: PlanStep[] = intent.needsTools
    ? intent.sources.map((source) => ({ op: "search" as const, source, queries: queriesFor(source, intent), tried: 0 }))
    : [];
  return {
    v: 2,
    query: input.query,
    today: input.today || new Date().toDateString(),
    history,
    connected: input.connected,
    firmName: input.memory?.firmName,
    userName: input.memory?.user?.name,
    memoryBlock: renderMemory(input.memory, matches) || undefined,
    ethics: input.ethics,
    intent,
    phase: intent.kind === "remember" ? "done" : "gather",
    plan,
    evidence: [],
    searched: [],
    activity,
    modelTurns: 0,
    pendingCalls: [],
    scratch: [],
    usedTools: false,
    config,
  };
}

function queriesFor(source: SourceKind, intent: Intent): string[] {
  const base = intent.queries.length ? intent.queries : intent.terms.length ? [intent.terms.join(" ")] : [];
  if (source === "mail") {
    const withTime = intent.timeFilter ? base.slice(0, 2).map((q) => `${q} ${intent.timeFilter}`) : [];
    return [...withTime, ...base];
  }
  if (source === "calendar") return [intent.terms.filter((t) => !/^(tmrw|tomorrow|today)$/.test(t)).join(" ")];
  // Drive / library: no Gmail operators.
  return [...new Set(base.map((q) => q.replace(/\b(from|to):\S+/g, "").replace(/[()"]/g, "").replace(/\s+OR\s+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function activitySource(source: SourceKind, connected: string[]): ActivitySource {
  if (source === "mail") return connected.includes("google") ? "gmail" : connected.includes("microsoft") ? "outlook" : "mail";
  if (source === "files") return connected.includes("google") ? "drive" : "onedrive";
  if (source === "calendar") return "calendar";
  return "library";
}

function addEvidence(state: HarnessState, item: Evidence) {
  const key = `${item.source}:${item.ref || item.title}`.toLowerCase();
  const existing = state.evidence.find((e) => `${e.source}:${e.ref || e.title}`.toLowerCase() === key);
  if (existing) {
    if (item.text.length > existing.text.length) {
      existing.text = item.text;
      existing.shallow = item.shallow;
    }
    existing.score = Math.max(existing.score, item.score);
    return;
  }
  state.evidence.push(item);
}

function relevance(intent: Intent, hit: { title: string; snippet?: string; body?: string }, rank: number): number {
  const hay = `${hit.title} ${hit.snippet || ""} ${(hit.body || "").slice(0, 4000)}`.toLowerCase();
  const terms = intent.terms.length ? intent.terms : intent.queries.join(" ").split(/\W+/);
  const hits = terms.filter((t) => t && hay.includes(t)).length;
  const phraseBonus = intent.phrases.filter((p) => hay.includes(p)).length * 0.15;
  return Math.min(1, (terms.length ? hits / terms.length : 0.3) * 0.7 + phraseBonus + Math.max(0, 0.2 - rank * 0.05));
}

export interface AdvanceDeps {
  tools: HarnessTools;
  /** Runs a model-requested tool by name (adapter maps to connectors). */
  runNamed: (call: ToolCallLike) => Promise<{ ok: boolean; text: string; evidence?: Evidence[] }>;
  /** Stop gathering when this returns true (serverless time guard). */
  outOfTime?: () => boolean;
}

export type AdvanceResult =
  | { kind: "model"; request: ModelRequest }
  | { kind: "done"; text: string }
  | { kind: "approval"; call: ToolCallLike; text: string }
  | { kind: "remember"; fact: string }
  | { kind: "yield" };

/** Do all non-model work available, then say what is needed next. */
export async function advance(state: HarnessState, deps: AdvanceDeps): Promise<AdvanceResult> {
  if (state.intent.kind === "remember" && state.intent.fact && !state.answer) {
    pushActivity(state.activity, { kind: "remembering", label: "Saving that to firm memory", source: "memory" });
    return { kind: "remember", fact: state.intent.fact };
  }
  if (state.phase === "done") return { kind: "done", text: state.answer || "" };
  if (state.phase === "approval" && state.heldCall) return { kind: "approval", call: state.heldCall, text: state.answer || "" };

  while (state.phase === "gather" && state.plan.length) {
    if (deps.outOfTime?.()) return { kind: "yield" };
    const step = state.plan.shift()!;
    const src = activitySource(step.source, state.connected);
    if (step.op === "search") {
      const query = step.queries[step.tried];
      if (query === undefined) continue;
      pushActivity(state.activity, {
        kind: step.tried && !step.widened ? "retrying" : "searching",
        label: step.widened ? `Widening the search in ${SOURCE_LABEL[src]}: “${shortQ(query)}”` : step.tried ? `Nothing yet in ${SOURCE_LABEL[src]}, trying “${shortQ(query)}”` : `Searching ${SOURCE_LABEL[src]} for “${shortQ(query)}”`,
        source: src,
      });
      state.searched.push(`${step.source}: ${query}`);
      let result: { ok: boolean; hits: Hit[] } = { ok: false, hits: [] };
      try {
        result = await deps.tools.search(step.source, query, { timeFilter: undefined });
      } catch {
        result = { ok: false, hits: [] };
      }
      state.usedTools = true;
      if (!result.hits.length) {
        settleActivity(state.activity, "failed", 0);
        const cap = step.source === "library" ? (state.intent.sources.length === 1 ? 2 : 1) : state.config.maxSearchTries;
        if (step.tried + 1 < Math.min(step.queries.length, cap)) {
          state.plan.unshift({ ...step, tried: step.tried + 1 });
        }
        continue;
      }
      if (step.source === "calendar") {
        const range = state.intent.dateRange;
        const inRange = range ? result.hits.filter((hit) => !hit.date || (hit.date.slice(0, 10) >= range.from && hit.date.slice(0, 10) <= range.to)) : result.hits;
        settleActivity(state.activity, "done", inRange.length);
        addEvidence(state, {
          id: "calendar",
          source: "calendar",
          title: range ? `Events ${range.from === range.to ? `on ${range.from}` : `${range.from} to ${range.to}`}` : "Upcoming events",
          text: inRange.length ? inRange.map((hit) => hit.body || `${hit.date || ""} — ${hit.title}`).join("\n") : "No events in that window.",
          score: 0.9,
        });
        continue;
      }
      settleActivity(state.activity, "done", result.hits.length);
      const reads: PlanStep[] = [];
      result.hits.slice(0, 6).forEach((hit, rank) => {
        const score = relevance(state.intent, hit, rank);
        if (hit.body && hit.body.length > 80) {
          addEvidence(state, { id: `${step.source}-${state.evidence.length + 1}`, source: step.source, title: hit.title, ref: hit.ref, date: hit.date, text: hit.body, score });
        } else if (hit.ref && state.evidence.some((e) => e.ref === hit.ref && !e.shallow)) {
          // Already read this one in full.
        } else if (hit.ref && reads.length < state.config.maxReadsPerSource && step.source !== "calendar") {
          reads.push({ op: "read", source: step.source, ref: hit.ref, title: hit.title, score });
          addEvidence(state, { id: `${step.source}-${state.evidence.length + 1}`, source: step.source, title: hit.title, ref: hit.ref, date: hit.date, text: hit.snippet || "", score, shallow: true });
        } else {
          addEvidence(state, { id: `${step.source}-${state.evidence.length + 1}`, source: step.source, title: hit.title, ref: hit.ref, date: hit.date, text: [hit.from ? `From: ${hit.from}` : "", hit.snippet || ""].filter(Boolean).join("\n"), score, shallow: step.source !== "calendar" });
        }
      });
      // Status briefs need coverage, not one thread: widen once when results are thin.
      const fresh = result.hits.filter((hit) => hit.ref).length;
      const widen = state.intent.widenQuery ? queriesFor(step.source, { ...state.intent, queries: [state.intent.widenQuery], timeFilter: undefined })[0] : undefined;
      if ((state.intent.kind === "status_brief" || state.intent.followUp) && step.source !== "library" && fresh < 3 && !(step.widened || 0) && widen && widen !== query) {
        state.plan.unshift({ ...step, queries: [widen], tried: 0, widened: 1 });
      }
      // Read the most relevant first.
      reads.sort((a, b) => (b as { score: number }).score - (a as { score: number }).score);
      state.plan.unshift(...reads);
      continue;
    }
    pushActivity(state.activity, { kind: "reading", label: `Reading “${shortQ(step.title, 48)}”`, source: src });
    try {
      const read = await deps.tools.read(step.source, step.ref, step.title);
      if (read.ok && read.text) {
        addEvidence(state, { id: `${step.source}-${state.evidence.length + 1}`, source: step.source, title: read.title || step.title, ref: step.ref, date: read.date, text: read.text, score: step.score + 0.05, shallow: false });
        settleActivity(state.activity, "done", 1);
      } else settleActivity(state.activity, "failed", 0);
    } catch {
      settleActivity(state.activity, "failed", 0);
    }
  }

  if (state.phase === "gather") state.phase = "model";

  if (state.phase === "tools") {
    const calls = state.pendingCalls.splice(0, 3);
    for (const call of calls) {
      if (deps.outOfTime?.()) {
        state.pendingCalls.unshift(call);
        return { kind: "yield" };
      }
      const label = toolLabel(call);
      pushActivity(state.activity, { kind: /read/.test(call.name) ? "reading" : "searching", label, source: toolSource(call.name, state.connected) });
      const sig = `${call.name}:${JSON.stringify(call.arguments)}`;
      if (state.searched.includes(sig)) {
        settleActivity(state.activity, "done");
        state.scratch.push(`${call.name}(${argText(call)}) → already done; use the evidence above.`);
        continue;
      }
      state.searched.push(sig);
      try {
        const result = await deps.runNamed(call);
        state.usedTools = true;
        for (const item of result.evidence || []) addEvidence(state, item);
        state.scratch.push(`${call.name}(${argText(call)}) → ${result.ok ? (result.evidence?.length ? `${result.evidence.length} result(s), added to the evidence above` : result.text.slice(0, 300) || "nothing found") : `failed: ${result.text.slice(0, 160)}`}`);
        settleActivity(state.activity, result.ok && (result.evidence?.length || result.text) ? "done" : "failed", result.evidence?.length);
      } catch (err) {
        state.scratch.push(`${call.name} → failed`);
        settleActivity(state.activity, "failed");
        void err;
      }
    }
    if (state.pendingCalls.length) return advance(state, deps);
    state.phase = "model";
  }

  if (state.phase === "synth") {
    return { kind: "model", request: buildRequest(state, state.config.synthLane === "same" ? laneFor(state) : (state.config.synthLane as Lane), true) };
  }

  const lastTurn = state.modelTurns >= state.config.maxModelTurns - 1;
  return { kind: "model", request: buildRequest(state, laneFor(state), lastTurn) };
}

export function laneFor(state: HarnessState): Lane {
  return state.intent.needsTools || state.usedTools ? state.config.toolLane : "ask";
}

function protocolFor(state: HarnessState, lane: Lane, finalPass: boolean): "text" | "native" | "none" {
  if (finalPass) return "none";
  if (!state.intent.needsTools && !state.config.chatTools) return "none";
  return state.config.toolProtocol[lane];
}

export function buildRequest(state: HarnessState, lane: Lane, finalPass: boolean): ModelRequest {
  const protocol = protocolFor(state, lane, finalPass);
  const tools = protocol === "none" ? [] : modelToolSpecs(new Set(state.connected));
  const draft = buildSystemPrompt({
    firmName: state.firmName,
    userName: state.userName,
    today: state.today,
    intent: state.intent,
    memoryBlock: state.memoryBlock,
    ethics: state.ethics,
    connected: state.connected,
    toolProtocol: protocol,
    tools,
    searched: state.searched.filter((s) => !s.includes("{")).slice(-8),
    finalPass,
    evidenceBlock: state.evidence.length ? "§EVIDENCE§" : undefined,
  });
  const historyChars = state.history.reduce((n, turn) => n + turn.text.length, 0);
  const budget = evidenceBudgetChars(state.config.windows[lane], draft.length + historyChars + state.query.length + state.scratch.join("\n").length);
  const { text: evidenceText } = budgetEvidence(state.evidence, budget);
  const system = draft.replace("§EVIDENCE§", evidenceText);
  const messages: ChatTurn[] = [{ role: "system", content: system }];
  for (const turn of state.history) messages.push({ role: turn.role, content: turn.text.slice(0, 3000) });
  messages.push({ role: "user", content: state.query });
  if (state.scratch.length) {
    messages.push({ role: "assistant", content: "(looking things up)" });
    messages.push({
      role: "user",
      content: `Tool results so far:\n${state.scratch.join("\n")}\n\n${finalPass ? "Now answer my original message. No more tools." : "Answer now if you have enough. Otherwise call one more tool."}`,
    });
  }
  pushActivity(state.activity, {
    kind: finalPass || protocol === "none" ? "writing" : "thinking",
    label: finalPass || protocol === "none" ? (state.evidence.length ? `Writing your answer from ${state.evidence.filter((e) => !e.shallow).length || state.evidence.length} source(s)` : "Writing your answer") : "Working out the answer",
    source: "model",
  });
  return {
    lane,
    messages,
    nativeTools: protocol === "native" ? tools : undefined,
    maxTokens: finalPass ? state.config.windows[lane].outputTokens : Math.min(1200, state.config.windows[lane].outputTokens),
    purpose: finalPass ? (state.phase === "synth" ? "synthesis" : "answer") : "tools",
  };
}

/** Feed a finished model job back in. */
export function applyModelOutput(state: HarnessState, output: { text: string; toolCalls: ToolCallLike[] }, purpose: ModelRequest["purpose"] = "tools") {
  state.modelTurns += 1;
  const calls = (output.toolCalls || []).filter((call) => call && call.name);
  const held = calls.find((call) => WRITE_CALLS.has(call.name));
  const safe = calls.filter((call) => !WRITE_CALLS.has(call.name));
  if (held) {
    state.heldCall = held;
    state.answer = cleanAnswer(output.text);
    state.phase = "approval";
    pushActivity(state.activity, { kind: "waiting_approval", label: "Waiting for your approval", status: "active" });
    return;
  }
  if (safe.length && purpose !== "synthesis" && state.modelTurns < state.config.maxModelTurns) {
    state.pendingCalls = safe.slice(0, 3);
    state.phase = "tools";
    return;
  }
  const text = cleanAnswer(output.text);
  if (!text && purpose !== "synthesis") {
    // Empty or tool-only reply on the last allowed tool turn: force one written answer.
    state.phase = "synth";
    return;
  }
  if (state.config.synthLane !== "same" && purpose !== "synthesis" && state.usedTools && state.config.synthLane !== laneFor(state) && state.modelTurns < state.config.maxModelTurns + 1) {
    state.phase = "synth";
    return;
  }
  state.answer = text || "I could not write an answer this time. Try asking again.";
  state.phase = "done";
  pushActivity(state.activity, { kind: "done", label: "Done", status: "done" });
}

export function finishRemember(state: HarnessState, fact: string) {
  state.answer = `Got it. I'll remember: ${fact}.`;
  state.phase = "done";
  settleActivity(state.activity, "done");
  pushActivity(state.activity, { kind: "done", label: "Saved to firm memory", status: "done", source: "memory" });
}

export function cleanAnswer(text: string): string {
  return String(text || "")
    .replace(/<(think|thinking)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/^\s*TOOL\s*\{[\s\S]*$/m, "")
    .replace(/^(?:Sure|Certainly|Of course|Absolutely)[!,.]\s*/i, "")
    .trim();
}

export function currentStatus(state: HarnessState): string {
  return statusLine(state.activity);
}

function shortQ(q: string, n = 40) {
  const s = q.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function argText(call: ToolCallLike) {
  const a = call.arguments || {};
  return String(a.query || a.ref || a.q || a.threadId || a.fileId || JSON.stringify(a)).slice(0, 80);
}

function toolLabel(call: ToolCallLike) {
  const a = argText(call);
  if (call.name === "email_search") return `Searching email for “${shortQ(a)}”`;
  if (call.name === "email_read") return "Reading the full email thread";
  if (call.name === "cloud_files_search") return `Searching files for “${shortQ(a)}”`;
  if (call.name === "cloud_files_read") return "Reading the file";
  if (call.name === "calendar_list") return "Checking your calendar";
  if (call.name === "search_library") return `Searching the firm library for “${shortQ(a)}”`;
  if (call.name === "email_draft") return "Saving a draft for you to review";
  return `Running ${call.name}`;
}

function toolSource(name: string, connected: string[]): ActivitySource {
  if (name.startsWith("email_")) return activitySource("mail", connected);
  if (name.startsWith("cloud_files_")) return activitySource("files", connected);
  if (name.startsWith("calendar_")) return "calendar";
  return "library";
}

/** Offline/synchronous driver: used by the eval and by tests. */
export async function runToCompletion(
  state: HarnessState,
  deps: AdvanceDeps & {
    model: (request: ModelRequest) => Promise<{ text: string; toolCalls: ToolCallLike[] }>;
    remember?: (fact: string) => Promise<void>;
  },
): Promise<{ text: string; state: HarnessState; requests: ModelRequest[]; held?: ToolCallLike }> {
  const requests: ModelRequest[] = [];
  for (let guard = 0; guard < 12; guard++) {
    const next = await advance(state, deps);
    if (next.kind === "done") return { text: next.text, state, requests };
    if (next.kind === "approval") return { text: next.text, state, requests, held: next.call };
    if (next.kind === "remember") {
      await deps.remember?.(next.fact);
      finishRemember(state, next.fact);
      continue;
    }
    if (next.kind === "yield") continue;
    requests.push(next.request);
    const output = await deps.model(next.request);
    applyModelOutput(state, output, next.request.purpose);
  }
  return { text: state.answer || "", state, requests };
}
