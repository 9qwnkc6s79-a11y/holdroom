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
import type { EmailDraftCard, TurnAnchor } from "../types.ts";
import { budgetEvidence, evidenceBudgetChars, type Evidence, type EvidenceMeta, type LaneWindow } from "./context.ts";
import { newActivityLog, pushActivity, settleActivity, statusLine, SOURCE_LABEL, type ActivityLog, type ActivitySource } from "./events.ts";
import { analyzeIntent, type Intent, type SourceKind } from "./intent.ts";
import { matchEntities, renderMemory, type FirmMemory } from "./memory.ts";
import { buildSystemPrompt, type HarnessToolSpec } from "./system-prompt.ts";
import { buildCorpus, verifyAnswer } from "./verify.ts";

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
  /** Check every quoted phrase / date / amount / ID in the answer against what was read; strip or flag the rest. */
  verifyClaims: boolean;
  /** Let the model reason (Qwen thinking) on tool-choice turns. Final answers never think. */
  thinkOnTools: boolean;
}

export const DEFAULT_CONFIG: HarnessConfig = {
  toolLane: "ask",
  toolProtocol: { ask: "text", agent: "native" },
  synthLane: "same",
  // Matches MAX_MODEL_LEN on the RunPod endpoints (Qwen 32768, Hermes 16384).
  windows: { ask: { contextTokens: 32768, outputTokens: 1600 }, agent: { contextTokens: 16384, outputTokens: 1400 } },
  maxModelTurns: 3,
  maxReadsPerSource: 4,
  maxSearchTries: 4,
  chatTools: false,
  verifyClaims: true,
  thinkOnTools: false,
};

export interface Hit {
  title: string;
  ref?: string;
  date?: string;
  snippet?: string;
  /** Full body when the source already returned it (deep search). */
  body?: string;
  from?: string;
  /** Tappable source URL (Gmail thread, Drive file, Calendar event). */
  url?: string;
}

export interface SearchResult {
  ok: boolean;
  hits: Hit[];
  note?: string;
  error?: string;
  timedOut?: boolean;
  needsReconnect?: boolean;
}

export interface ReadResult {
  ok: boolean;
  title?: string;
  text: string;
  date?: string;
  url?: string;
  meta?: EvidenceMeta;
  error?: string;
  timedOut?: boolean;
  needsReconnect?: boolean;
}

export interface SourceError {
  source: SourceKind;
  message: string;
  timedOut?: boolean;
  needsReconnect?: boolean;
}

export interface HarnessTools {
  search(source: SourceKind, query: string, opts: { timeFilter?: string }): Promise<SearchResult>;
  read(source: SourceKind, ref: string, title?: string): Promise<ReadResult>;
}

export interface ToolCallLike {
  name: string;
  arguments: Record<string, unknown>;
}

export interface NativeToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatTurn {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Native protocol: the assistant's structured calls, replayed on the next turn. */
  tool_calls?: NativeToolCall[];
  /** Native protocol: which call a tool message answers. */
  tool_call_id?: string;
}

export interface ModelRequest {
  lane: Lane;
  messages: ChatTurn[];
  /** Only for native protocol. */
  nativeTools?: HarnessToolSpec[];
  maxTokens: number;
  purpose: "answer" | "tools" | "synthesis";
  /** "native" when tools ride in the OpenAI tools field (structured calls). */
  protocol?: "text" | "native" | "none";
  /** Ask the model to reason first (tool turns only, when configured). */
  think?: boolean;
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
  emailDraft?: EmailDraftCard;
  earlierSummary?: string;
  anchor?: TurnAnchor;
  priorAnchors?: TurnAnchor[];
  sourceErrors?: SourceError[];
  usedTools: boolean;
  config: HarnessConfig;
  todayIso?: string;
  /** Native protocol: structured calls the model made and what they returned, in order. */
  toolTurns?: { calls: NativeToolCall[]; results: string[] }[];
  /** Claim check on the final answer (counts only, no text). */
  verification?: { checked: number; unsupported: number; stripped: number; flagged: number; kinds: string[] };
  /** Set when the endpoint refused native tools and the harness fell back to the text protocol. */
  nativeFallback?: boolean;
}

export interface InitInput {
  query: string;
  history?: { role: "user" | "assistant"; text: string }[];
  earlierSummary?: string;
  anchor?: TurnAnchor;
  priorAnchors?: TurnAnchor[];
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
  const q = (description: string) => ({ query: { type: "string" as const, description } });
  const specs: HarnessToolSpec[] = [
    { name: "search_library", description: "Search the firm library (synced notes, uploaded files).", parameters: ["query"], params: q("Keywords, e.g. 'monument sign permit'.") },
  ];
  if (mail) {
    specs.push({ name: "email_search", description: "Search email. Gmail syntax works: quotes, OR, from:, newer_than:30d.", parameters: ["query"], params: q("Gmail query, e.g. 'from:robert newer_than:30d sign'.") });
    specs.push({ name: "email_read", description: "Open the full email thread by its ref from the evidence list.", parameters: ["ref"], params: { ref: { type: "string", description: "The ref shown next to the thread in the evidence list." } } });
    specs.push({
      name: "email_draft",
      description: "Prepare an editable email draft card for the user to send, save, or discard. Does not send. Only state facts from the thread; never claim an attachment or a meeting that is not in it.",
      parameters: ["to", "subject", "body", "thread_ref"],
      required: ["to", "subject", "body"],
      params: {
        to: { type: "string", description: "Recipient email address (from the thread)." },
        subject: { type: "string", description: "Subject line. Use 'Re: <original subject>' for replies." },
        body: { type: "string", description: "Plain-text body, signed with the user's first name." },
        thread_ref: { type: "string", description: "Ref of the thread being replied to, if any." },
      },
    });
  }
  if (cloud) {
    specs.push({ name: "cloud_files_search", description: "Search Drive/OneDrive by name and content.", parameters: ["query"], params: q("File name or content keywords.") });
    specs.push({ name: "cloud_files_read", description: "Open a file's text by its ref from the evidence list.", parameters: ["ref"], params: { ref: { type: "string", description: "The ref shown next to the file in the evidence list." } } });
    specs.push({ name: "calendar_list", description: "List upcoming calendar events, optionally matching a query.", parameters: ["query"], required: [], params: q("Optional words to match in event titles; empty for everything.") });
  }
  return specs;
}

const WRITE_CALLS = new Set(["email_send", "calendar_create", "write_draft", "handoff_to_department", "delete_file", "use_vault", "slack_post_message", "notion_create_page", "github_create_issue", "linear_create_issue"]);

export function initHarness(input: InitInput): HarnessState {
  const config: HarnessConfig = { ...DEFAULT_CONFIG, ...(input.config || {}), windows: { ...DEFAULT_CONFIG.windows, ...(input.config?.windows || {}) }, toolProtocol: { ...DEFAULT_CONFIG.toolProtocol, ...(input.config?.toolProtocol || {}) } };
  const connected = new Set(input.connected);
  const history = (input.history || []).slice(-8);
  const rawWords = String(input.query || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(what|whats|when|where|who|whom|which|how|why|the|and|for|with|this|that|back|again|still|about|waiting)$/.test(w));
  const allAnchors = [input.anchor, ...(input.priorAnchors || [])].filter((a): a is TurnAnchor => Boolean(a));
  const anchorMatchesQuery = (a: TurnAnchor) => {
    const hay = `${a.topic || ""} ${a.people.join(" ")} ${a.subjects.join(" ")}`.toLowerCase();
    return rawWords.some((t) => hay.includes(t));
  };
  const matchedAnchor = allAnchors.find(anchorMatchesQuery);
  const switchedToPrior = Boolean(matchedAnchor && input.anchor && matchedAnchor !== input.anchor && !anchorMatchesQuery(input.anchor));
  const intent = analyzeIntent(input.query, {
    memory: input.memory,
    connected,
    history: switchedToPrior ? [] : history,
    todayIso: input.todayIso,
  });
  const matches = matchEntities(input.query, input.memory);
  const activity = newActivityLog();
  pushActivity(activity, { kind: "understanding", label: intent.entities.length ? `Understanding your ask (${intent.entities.map((e) => e.name).slice(0, 2).join(", ")})` : "Understanding your ask", source: "memory" });
  const anchor = matchedAnchor || input.anchor;
  const useAnchor =
    Boolean(anchor) &&
    (intent.followUp ||
      switchedToPrior ||
      (intent.kind === "draft_reply" &&
        (!intent.terms.length ||
          intent.terms.every((t) =>
            Boolean(anchor?.people.some((p) => p.toLowerCase().includes(t)) || anchor?.subjects.some((s) => s.toLowerCase().includes(t))),
          ))));
  const plan: PlanStep[] = intent.needsTools
    ? intent.sources.map((source) => {
        const qs = queriesFor(source, intent);
        if (source === "mail" && useAnchor && anchor?.emails?.length) {
          const anchorQs = anchor.emails.slice(0, 2).map((em) => `from:${em} OR to:${em}`);
          return { op: "search" as const, source, queries: [...new Set([...anchorQs, ...qs])], tried: 0 };
        }
        return { op: "search" as const, source, queries: qs, tried: 0 };
      })
    : [];
  if (intent.needsTools && useAnchor && anchor?.refs?.length && intent.sources.includes("mail")) {
    const anchoredReads: PlanStep[] = anchor.refs.slice(0, 2).map((ref, idx) => ({
      op: "read" as const,
      source: "mail" as const,
      ref,
      title: anchor.subjects[idx] || "Previous thread",
      score: 0.98 - idx * 0.02,
    }));
    plan.unshift(...anchoredReads);
  }
  return {
    v: 2,
    query: input.query,
    today: input.today || new Date().toDateString(),
    history,
    earlierSummary: input.earlierSummary,
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
    anchor,
    priorAnchors: input.priorAnchors,
    sourceErrors: [],
    usedTools: false,
    config,
    todayIso: input.todayIso,
  };
}

function queriesFor(source: SourceKind, intent: Intent): string[] {
  const base = intent.queries.length ? intent.queries : intent.terms.length ? [intent.terms.join(" ")] : [];
  if (source === "mail") {
    const withTime = intent.timeFilter ? base.slice(0, 2).map((q) => `${q} ${intent.timeFilter}`) : [];
    return [...withTime, ...base];
  }
  if (source === "calendar") return [intent.terms.filter((t) => !/^(cal|cals|gcal|ical|calendar|schedule|tmrw|tmr|tomorrow|today)$/.test(t)).join(" ")];
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
    if (item.meta) existing.meta = { ...(existing.meta || {}), ...item.meta };
    if (item.url && !existing.url) existing.url = item.url;
    existing.score = Math.max(existing.score, item.score);
    return;
  }
  state.evidence.push(item);
}

function termVariants(term: string): string[] {
  const t = term.toLowerCase();
  const variants = new Set([t]);
  if (t.endsWith("s") && t.length > 4) variants.add(t.slice(0, -1));
  else if (t.length > 3) variants.add(`${t}s`);
  if (t === "sign" || t === "signage") {
    variants.add("sign");
    variants.add("signage");
    variants.add("signs");
  }
  if (t === "submit" || t === "submission" || t === "submitted") {
    variants.add("submit");
    variants.add("submitted");
    variants.add("submission");
    variants.add("submitting");
  }
  if (t === "permit" || t === "permitting") {
    variants.add("permit");
    variants.add("permitting");
    variants.add("permits");
  }
  if (t === "quote" || t === "estimate") {
    variants.add("quote");
    variants.add("quoted");
    variants.add("estimate");
    variants.add("proposal");
  }
  return [...variants];
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesTerm(hay: string, term: string): number {
  let count = 0;
  for (const v of termVariants(term)) {
    const re = new RegExp(`\\b${escapeRe(v)}\\b`, "gi");
    const m = hay.match(re);
    if (m) count += m.length;
  }
  return count;
}

function isAnchoredItem(item: { ref?: string; title?: string; from?: string; text?: string }, anchor?: TurnAnchor): boolean {
  if (!anchor) return false;
  if (item.ref && anchor.refs.includes(item.ref)) return true;
  if (item.ref && anchor.fileRefs.includes(item.ref)) return true;
  const hay = `${item.title || ""} ${item.from || ""} ${(item.text || "").slice(0, 600)}`.toLowerCase();
  if (anchor.emails.some((e) => e && hay.includes(e.toLowerCase()))) return true;
  if (anchor.people.some((p) => p && hay.includes(p.toLowerCase()))) return true;
  return false;
}

function relevance(intent: Intent, hit: { ref?: string; title: string; snippet?: string; body?: string; from?: string }, rank: number, anchor?: TurnAnchor): number {
  const titleHay = hit.title.toLowerCase();
  const hay = `${titleHay} ${hit.from || ""} ${hit.snippet || ""} ${(hit.body || "").slice(0, 4000)}`.toLowerCase();
  const terms = intent.terms.length ? intent.terms : intent.queries.join(" ").split(/\W+/).filter(Boolean);
  const hits = terms.filter((t) => t && matchesTerm(hay, t) > 0).length;
  const titleHits = terms.filter((t) => t && matchesTerm(titleHay, t) > 0).length;
  const phraseBonus = intent.phrases.filter((p) => hay.includes(p)).length * 0.15;
  const titleBonus = terms.length ? (titleHits / terms.length) * 0.25 : 0;
  const anchorBonus = (intent.followUp || intent.kind === "draft_reply") && isAnchoredItem(hit, anchor) ? 0.28 : 0;
  return Math.min(1, (terms.length ? hits / terms.length : 0.3) * 0.6 + phraseBonus + titleBonus + anchorBonus + Math.max(0, 0.15 - rank * 0.03));
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
  | { kind: "done"; text: string; emailDraft?: EmailDraftCard }
  | { kind: "approval"; call: ToolCallLike; text: string }
  | { kind: "remember"; fact: string }
  | { kind: "yield" };

/** Do all non-model work available, then say what is needed next. */
export async function advance(state: HarnessState, deps: AdvanceDeps): Promise<AdvanceResult> {
  if (state.intent.kind === "remember" && state.intent.fact && !state.answer) {
    pushActivity(state.activity, { kind: "remembering", label: "Saving that to firm memory", source: "memory" });
    return { kind: "remember", fact: state.intent.fact };
  }
  if (state.phase === "done") return { kind: "done", text: state.answer || "", emailDraft: state.emailDraft };
  if (state.phase === "approval" && state.heldCall) return { kind: "approval", call: state.heldCall, text: state.answer || "" };

  const recordSourceError = (source: SourceKind, err: Omit<SourceError, "source">) => {
    state.sourceErrors = state.sourceErrors || [];
    if (!state.sourceErrors.some((e) => e.source === source && e.message === err.message)) {
      state.sourceErrors.push({ source, ...err });
    }
  };
  const maxReads = state.intent.kind === "status_brief" ? state.config.maxReadsPerSource : Math.min(state.config.maxReadsPerSource, 3);

  while (state.phase === "gather" && state.plan.length) {
    if (deps.outOfTime?.()) return { kind: "yield" };
    if (state.plan[0].op === "search") {
      const batch: Extract<PlanStep, { op: "search" }>[] = [];
      const seenSources = new Set<SourceKind>();
      while (state.plan.length && state.plan[0].op === "search" && batch.length < 4 && !seenSources.has(state.plan[0].source)) {
        const nextStep = state.plan.shift() as Extract<PlanStep, { op: "search" }>;
        seenSources.add(nextStep.source);
        batch.push(nextStep);
      }
      const runnable = batch.filter((step) => step.queries[step.tried] !== undefined);
      if (!runnable.length) continue;
      runnable.forEach((step) => {
        const src = activitySource(step.source, state.connected);
        const query = step.queries[step.tried]!;
        pushActivity(state.activity, {
          kind: step.tried && !step.widened ? "retrying" : "searching",
          label: step.widened ? `Widening the search in ${SOURCE_LABEL[src]}: “${shortQ(query)}”` : step.tried ? `Nothing yet in ${SOURCE_LABEL[src]}, trying “${shortQ(query)}”` : `Searching ${SOURCE_LABEL[src]} for “${shortQ(query)}”`,
          source: src,
        });
        state.searched.push(`${step.source}: ${query}`);
      });
      const results = await Promise.all(
        runnable.map(async (step) => {
          const query = step.queries[step.tried]!;
          try {
            const res = await deps.tools.search(step.source, query, { timeFilter: undefined });
            return { step, query, res };
          } catch (err) {
            const timedOut = err instanceof Error && /timeout|abort/i.test(`${err.name} ${err.message}`);
            return {
              step,
              query,
              res: { ok: false, hits: [], timedOut, error: timedOut ? "Request timed out" : err instanceof Error ? err.message : "Connector error" } as SearchResult,
            };
          }
        }),
      );
      state.usedTools = true;
      const allReads: Extract<PlanStep, { op: "read" }>[] = [];
      const followSearches: PlanStep[] = [];
      for (const { step, query, res } of results) {
        if (!res.ok) {
          recordSourceError(step.source, {
            message: res.error || "Connector unavailable",
            timedOut: res.timedOut,
            needsReconnect: res.needsReconnect,
          });
        } else if (res.note) {
          recordSourceError(step.source, { message: res.note, needsReconnect: /reconnect/i.test(res.note) });
        }
        if (!res.hits.length) {
          settleActivity(state.activity, "failed", 0);
          if (res.ok) {
            const cap = step.source === "library" ? (state.intent.sources.length === 1 ? 2 : 1) : state.config.maxSearchTries;
            if (step.tried + 1 < Math.min(step.queries.length, cap)) {
              followSearches.push({ ...step, tried: step.tried + 1 });
            }
          }
          continue;
        }
        if (step.source === "calendar") {
          const range = state.intent.dateRange;
          const inRange = range ? res.hits.filter((hit) => !hit.date || (hit.date.slice(0, 10) >= range.from && hit.date.slice(0, 10) <= range.to)) : res.hits;
          settleActivity(state.activity, "done", inRange.length);
          addEvidence(state, {
            id: "calendar",
            source: "calendar",
            title: range ? `Events ${range.from === range.to ? `on ${range.from}` : `${range.from} to ${range.to}`}` : "Upcoming events",
            url: inRange.find((h) => h.url)?.url,
            text: inRange.length ? inRange.map((hit) => hit.body || `${hit.date || ""} — ${hit.title}`).join("\n") : "No events in that window.",
            score: 0.9,
          });
          continue;
        }
        settleActivity(state.activity, "done", res.hits.length);
        const stepReads: Extract<PlanStep, { op: "read" }>[] = [];
        const rankedHits = res.hits
          .map((hit, rank) => ({ hit, score: relevance(state.intent, hit, rank, state.anchor) }))
          .sort((a, b) => b.score - a.score);
        rankedHits.slice(0, 6).forEach(({ hit, score }) => {
          if (hit.body && hit.body.length > 80) {
            addEvidence(state, { id: `${step.source}-${state.evidence.length + 1}`, source: step.source, title: hit.title, ref: hit.ref, date: hit.date, url: hit.url, text: hit.body, score });
          } else if (hit.ref && state.evidence.some((e) => e.ref === hit.ref && !e.shallow)) {
            // Already read this one in full.
          } else if (hit.ref && stepReads.length < maxReads && step.source !== "calendar") {
            stepReads.push({ op: "read", source: step.source, ref: hit.ref, title: hit.title, score });
            addEvidence(state, { id: `${step.source}-${state.evidence.length + 1}`, source: step.source, title: hit.title, ref: hit.ref, date: hit.date, url: hit.url, text: hit.snippet || "", score, shallow: true });
          } else {
            addEvidence(state, { id: `${step.source}-${state.evidence.length + 1}`, source: step.source, title: hit.title, ref: hit.ref, date: hit.date, url: hit.url, text: [hit.from ? `From: ${hit.from}` : "", hit.snippet || ""].filter(Boolean).join("\n"), score, shallow: step.source !== "calendar" });
          }
        });
        allReads.push(...stepReads);

        // If a tight first query only got weak body hits (0 title matches) or thin coverage on status/follow-up, queue the broader query too.
        const anyTitleHit = res.hits.some((h) => state.intent.terms.some((t) => matchesTerm(h.title.toLowerCase(), t) > 0));
        const cap = step.source === "library" ? 1 : state.config.maxSearchTries;
        if (!anyTitleHit && res.hits.length < 3 && step.source !== "library" && step.tried + 1 < Math.min(step.queries.length, cap)) {
          followSearches.push({ ...step, tried: step.tried + 1 });
        } else {
          const fresh = res.hits.filter((hit) => hit.ref).length;
          const widen = state.intent.widenQuery ? queriesFor(step.source, { ...state.intent, queries: [state.intent.widenQuery], timeFilter: undefined })[0] : undefined;
          if ((state.intent.kind === "status_brief" || state.intent.followUp) && step.source !== "library" && fresh < 3 && !(step.widened || 0) && widen && widen !== query) {
            followSearches.push({ ...step, queries: [widen], tried: 0, widened: 1 });
          }
        }
      }
      allReads.sort((a, b) => b.score - a.score);
      state.plan.unshift(...allReads, ...followSearches);
      continue;
    }

    // Batch up to 4 read steps in parallel.
    const readBatch: Extract<PlanStep, { op: "read" }>[] = [];
    while (state.plan.length && state.plan[0].op === "read" && readBatch.length < 4) {
      readBatch.push(state.plan.shift() as Extract<PlanStep, { op: "read" }>);
    }
    if (!readBatch.length) continue;
    readBatch.forEach((step) => {
      const src = activitySource(step.source, state.connected);
      pushActivity(state.activity, { kind: "reading", label: `Reading “${shortQ(step.title, 48)}”`, source: src });
    });
    const readResults = await Promise.all(
      readBatch.map(async (step) => {
        try {
          const read = await deps.tools.read(step.source, step.ref, step.title);
          return { step, read };
        } catch (err) {
          const timedOut = err instanceof Error && /timeout|abort/i.test(`${err.name} ${err.message}`);
          return {
            step,
            read: { ok: false, text: "", timedOut, error: timedOut ? "Request timed out" : err instanceof Error ? err.message : "Read failed" } as ReadResult,
          };
        }
      }),
    );
    for (const { step, read } of readResults) {
      if (read.ok && read.text) {
        const rescored = Math.max(
          step.score + 0.05,
          relevance(state.intent, { ref: step.ref, title: read.title || step.title, body: read.text }, 0, state.anchor),
        );
        addEvidence(state, {
          id: `${step.source}-${state.evidence.length + 1}`,
          source: step.source,
          title: read.title || step.title,
          ref: step.ref,
          date: read.date,
          url: read.url,
          text: read.text,
          score: Math.min(1, rescored),
          shallow: false,
          meta: read.meta,
        });
        settleActivity(state.activity, "done", 1);
      } else {
        if (read.error) {
          recordSourceError(step.source, { message: read.error, timedOut: read.timedOut, needsReconnect: read.needsReconnect });
        }
        settleActivity(state.activity, "failed", 0);
      }
    }
  }

  if (state.phase === "gather") {
    if (state.sourceErrors?.length && !state.evidence.length) {
      const msg = formatSourceErrors(state.sourceErrors, state.connected);
      state.answer = msg;
      state.phase = "done";
      pushActivity(state.activity, { kind: "done", label: "Connector error", status: "done" });
      return { kind: "done", text: msg };
    }
    state.phase = "model";
  }

  if (state.phase === "tools") {
    if (deps.outOfTime?.()) return { kind: "yield" };
    const calls = state.pendingCalls.splice(0, 3);
    const toRun: { call: ToolCallLike; sig: string }[] = [];
    for (const call of calls) {
      const label = toolLabel(call);
      pushActivity(state.activity, { kind: /read/.test(call.name) ? "reading" : "searching", label, source: toolSource(call.name, state.connected) });
      const sig = `${call.name}:${JSON.stringify(call.arguments)}`;
      if (state.searched.includes(sig)) {
        settleActivity(state.activity, "done");
        noteToolResult(state, call, `${call.name}(${argText(call)}) → already done; use the evidence above.`);
        continue;
      }
      state.searched.push(sig);
      toRun.push({ call, sig });
    }
    const outcomes = await Promise.all(
      toRun.map(async ({ call }) => {
        try {
          const result = await deps.runNamed(call);
          return { call, ok: true as const, result };
        } catch (err) {
          return { call, ok: false as const, err };
        }
      }),
    );
    for (const outcome of outcomes) {
      if (!outcome.ok) {
        noteToolResult(state, outcome.call, `${outcome.call.name} → failed`);
        settleActivity(state.activity, "failed");
        continue;
      }
      const { call, result } = outcome;
      state.usedTools = true;
      for (const item of result.evidence || []) addEvidence(state, item);
      noteToolResult(state, call, `${call.name}(${argText(call)}) → ${result.ok ? (result.evidence?.length ? `${result.evidence.length} result(s), added to the evidence above` : result.text.slice(0, 300) || "nothing found") : `failed: ${result.text.slice(0, 160)}`}`);
      settleActivity(state.activity, result.ok && (result.evidence?.length || result.text) ? "done" : "failed", result.evidence?.length);
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

/** Log a tool result for the next prompt (text protocol) and pair it with its structured call (native protocol). */
function noteToolResult(state: HarnessState, call: ToolCallLike, line: string) {
  state.scratch.push(line);
  const turn = state.toolTurns?.[state.toolTurns.length - 1];
  if (!turn) return;
  const idx = turn.calls.findIndex((c, i) => turn.results[i] === "" && c.function.name === call.name);
  if (idx >= 0) turn.results[idx] = line;
}

export function laneFor(state: HarnessState): Lane {
  return state.intent.needsTools || state.usedTools ? state.config.toolLane : "ask";
}

function protocolFor(state: HarnessState, lane: Lane, finalPass: boolean): "text" | "native" | "none" {
  if (finalPass) return "none";
  if (!state.intent.needsTools && !state.config.chatTools) return "none";
  return state.config.toolProtocol[lane];
}

function sourceDisplayName(source: SourceKind, connected: string[]): string {
  if (source === "mail") return connected.includes("google") ? "Gmail" : connected.includes("microsoft") ? "Outlook" : "Email";
  if (source === "files") return connected.includes("google") ? "Google Drive" : "OneDrive";
  if (source === "calendar") return "Google Calendar";
  return "Firm Library";
}

function formatSourceErrors(errors: SourceError[], connected: string[]): string {
  const parts = errors.map((e) => {
    const label = sourceDisplayName(e.source, connected);
    if (e.needsReconnect) return `${label} (needs to be reconnected in Settings > Connect apps)`;
    if (e.timedOut) return `${label} (timed out)`;
    return `${label} (${e.message})`;
  });
  return `Unable to reach ${parts.join("; ")}. Please try again in a moment${errors.some((e) => e.needsReconnect) ? " or reconnect the app in Settings > Connect apps" : ""}.`;
}

function assessEvidence(state: HarnessState): { kept: Evidence[]; guidance: string } {
  const notes: string[] = [];
  if (state.sourceErrors?.length) {
    const errSummary = state.sourceErrors.map((e) => `${sourceDisplayName(e.source, state.connected)}: ${e.message}${e.needsReconnect ? " (needs reconnect in Settings > Connect apps)" : ""}`).join("; ");
    notes.push(`CONNECTOR ERROR: ${errSummary}. Report this outage/timeout honestly to the user and NEVER claim nothing exists in a source that failed to respond.`);
  }
  const anchoredActive = Boolean(state.anchor && (state.intent.followUp || state.intent.kind === "draft_reply"));
  if (anchoredActive && state.anchor) {
    notes.push(
      `FOLLOW-UP ANCHOR: Keep your answer grounded in the previous thread/topic (${state.anchor.subjects[0] || state.anchor.topic || "prior topic"}${state.anchor.people.length ? ` with ${state.anchor.people.join(", ")}` : ""}). If another vendor or unrelated thread appears in search results, mention it in at most one brief line without switching away from the main thread.`,
    );
  }
  if (!state.intent.needsTools || state.intent.kind === "schedule" || state.intent.kind === "remember") {
    return { kept: state.evidence, guidance: notes.join("\n") };
  }
  const terms = state.intent.terms;
  const kept: Evidence[] = [];
  const weakCandidates: Evidence[] = [];
  for (const item of state.evidence) {
    if (item.source === "memory") {
      kept.push(item);
      continue;
    }
    if (anchoredActive && isAnchoredItem(item, state.anchor)) {
      kept.push({ ...item, score: Math.max(item.score, 0.92) });
      continue;
    }
    if (!terms.length) {
      kept.push(item);
      continue;
    }
    const titleLower = item.title.toLowerCase();
    const hay = `${titleLower} ${item.text.slice(0, 6000)}`.toLowerCase();
    const titleHits = terms.filter((t) => matchesTerm(titleLower, t) > 0).length;
    const bodyCounts = terms.map((t) => matchesTerm(hay, t));
    const matchedCount = bodyCounts.filter((c) => c > 0).length;
    const totalHits = bodyCounts.reduce((a, b) => a + b, 0);
    const phraseMatch = state.intent.phrases.some((p) => hay.includes(p.toLowerCase()));
    const entityMatch = state.intent.entities.some(
      (e) => hay.includes(e.label.toLowerCase()) || (e.email && hay.includes(e.email.toLowerCase())),
    );
    // Gate out items with zero term/entity/phrase overlap, plus weak single-term / tangential OR matches.
    if (!entityMatch && !phraseMatch && matchedCount === 0) continue;
    const weakMultiTerm = terms.length >= 2 && !entityMatch && !phraseMatch && titleHits === 0 && matchedCount <= 1 && (totalHits <= 2 || item.source === "library" || item.text.length > 700);
    const weakSingleTerm = terms.length === 1 && !entityMatch && titleHits === 0 && item.source === "library" && totalHits <= 2 && item.text.length > 900;
    const phraseBroken = state.intent.phrases.length > 0 && terms.length === 2 && !entityMatch && !phraseMatch && titleHits === 0 && matchedCount < 2;
    if (weakMultiTerm || weakSingleTerm || phraseBroken) {
      if (item.source !== "library" && matchedCount > 0 && !phraseBroken && titleHits > 0) weakCandidates.push(item);
      continue;
    }
    kept.push(item);
  }
  const searchedList = [...new Set(state.searched.map((s) => s.split(":")[0]))].join(", ") || state.intent.sources.join(", ");
  if (!kept.length) {
    const candidateHints = weakCandidates
      .slice(0, 3)
      .map((c) => `- ${c.title}${c.date ? ` (${c.date})` : ""} [${c.source}]`)
      .join("\n");
    const vagueAsk = state.intent.entities.length === 0 && terms.length <= 2 && state.intent.phrases.length === 0;
    if (vagueAsk) {
      notes.push(
        `AMBIGUITY & RELEVANCE GATE: Searches across ${searchedList} returned no strong match for "${state.query}". Do NOT guess or declare anything "complete" or "nothing left". Tell the user briefly what sources you searched, ask ONE short clarifying question so they can specify which item/program they mean${candidateHints ? `, or list at most these weak candidates for them to confirm:\n${candidateHints}` : "."}`,
      );
    } else {
      notes.push(
        `RELEVANCE GATE: Searches across ${searchedList} found no document or email that actually matches "${state.query}". Tell the user in one clear line what you searched and that you did not find it there. Do NOT bend an unrelated email or document to fit.`,
      );
    }
  } else if (
    state.intent.entities.length === 0 &&
    terms.length >= 2 &&
    kept.every((e) => {
      const hay = `${e.title} ${e.text.slice(0, 4000)}`.toLowerCase();
      return terms.filter((t) => matchesTerm(hay, t) > 0).length < terms.length && !terms.some((t) => matchesTerm(e.title.toLowerCase(), t) > 0);
    })
  ) {
    notes.push(
      `PARTIAL MATCH NOTE: None of the kept items explicitly match every part of your ask (${terms.join(" + ")}). State only what is explicitly in the source text, never claim something is complete or "nothing left" without explicit evidence, and ask one short clarifying question if it's ambiguous.`,
    );
  }
  return { kept, guidance: notes.join("\n\n") };
}

export function buildRequest(state: HarnessState, lane: Lane, finalPass: boolean): ModelRequest {
  const protocol = protocolFor(state, lane, finalPass);
  const tools = protocol === "none" ? [] : modelToolSpecs(new Set(state.connected));
  const { kept, guidance } = assessEvidence(state);
  const draft = buildSystemPrompt({
    firmName: state.firmName,
    userName: state.userName,
    today: state.today,
    intent: state.intent,
    memoryBlock: state.memoryBlock,
    earlierSummary: state.earlierSummary,
    ethics: state.ethics,
    connected: state.connected,
    toolProtocol: protocol,
    tools,
    searched: state.searched.filter((s) => !s.includes("{")).slice(-8),
    finalPass,
    guidance: guidance || undefined,
    evidenceBlock: kept.length ? "§EVIDENCE§" : undefined,
  });
  const historyChars = state.history.reduce((n, turn) => n + turn.text.length, 0);
  const budget = evidenceBudgetChars(state.config.windows[lane], draft.length + historyChars + state.query.length + state.scratch.join("\n").length);
  const { text: evidenceText } = budgetEvidence(kept, budget);
  const system = draft.replace("§EVIDENCE§", evidenceText);
  const messages: ChatTurn[] = [{ role: "system", content: system }];
  for (const turn of state.history) messages.push({ role: turn.role, content: turn.text.slice(0, 3000) });
  messages.push({ role: "user", content: state.query });
  const nativeTurns = protocol === "native" ? (state.toolTurns || []).filter((t) => t.calls.length) : [];
  if (nativeTurns.length) {
    // Structured replay: the model sees its own calls and each result as a tool message.
    for (const turn of nativeTurns) {
      messages.push({ role: "assistant", content: "", tool_calls: turn.calls });
      turn.calls.forEach((call, i) => messages.push({ role: "tool", tool_call_id: call.id, content: turn.results[i] || "(no result)" }));
    }
    const extra = state.scratch.filter((line) => !nativeTurns.some((t) => t.results.includes(line)));
    messages.push({ role: "user", content: `${extra.length ? `Also: ${extra.join("\n")}\n\n` : ""}Answer my original message now if you have enough. Otherwise call one more tool.` });
  } else if (state.scratch.length) {
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
    maxTokens: finalPass ? state.config.windows[lane].outputTokens : Math.min(state.config.thinkOnTools && protocol !== "none" ? 3000 : 1200, state.config.windows[lane].outputTokens),
    purpose: finalPass ? (state.phase === "synth" ? "synthesis" : "answer") : "tools",
    protocol,
    think: Boolean(state.config.thinkOnTools && !finalPass && protocol !== "none"),
  };
}

function buildEmailDraftCard(state: HarnessState, args: Record<string, unknown>): EmailDraftCard {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
  const rawTo = str(args.to);
  const rawSubject = str(args.subject);
  const rawBody = str(args.body || args.text);
  const rawRef = str(args.thread_ref || args.threadRef || args.ref);
  const mailEvidence = state.evidence
    .filter((e) => e.source === "mail" && !e.shallow)
    .sort((a, b) => b.score - a.score);
  const matched =
    mailEvidence.find((e) => rawRef && (e.ref === rawRef || e.meta?.threadRef === rawRef || e.meta?.gmailThreadId === rawRef)) ||
    mailEvidence.find((e) => rawTo && e.meta?.replyToEmail && rawTo.toLowerCase().includes(e.meta.replyToEmail.toLowerCase())) ||
    mailEvidence.find((e) => state.anchor?.refs?.includes(e.ref || "")) ||
    mailEvidence[0];
  const resolvedTo = rawTo.includes("@") ? rawTo : matched?.meta?.replyToEmail || state.anchor?.emails?.[0] || rawTo;
  const fallbackSub = matched?.meta?.subject || matched?.title || state.anchor?.subjects?.[0] || "";
  const resolvedSubject = rawSubject || (fallbackSub ? (/^re:/i.test(fallbackSub) ? fallbackSub : `Re: ${fallbackSub}`) : "");
  return {
    id: `draft-${Date.now().toString(36)}`,
    to: resolvedTo,
    subject: resolvedSubject,
    body: rawBody ? verifyFinal(state, rawBody, true) : rawBody,
    threadRef: matched?.meta?.threadRef || matched?.ref || (rawRef || undefined),
    gmailThreadId: matched?.meta?.gmailThreadId,
    accountEmail: matched?.meta?.accountEmail,
    inReplyTo: matched?.meta?.inReplyTo,
    references: matched?.meta?.references,
    status: "draft",
  };
}

function parseEmailDraftFromText(state: HarnessState, text: string): EmailDraftCard | null {
  if (state.intent.kind !== "draft_reply") return null;
  const subMatch = /^Subject:\s*(.+)$/im.exec(text);
  if (!subMatch) return null;
  const toMatch = /^To:\s*(.+)$/im.exec(text);
  const afterSub = text.slice(subMatch.index + subMatch[0].length);
  const cleanedBody = afterSub
    .replace(/^\s*\n+/, "")
    .replace(/\n+(?:Let me know if|Would you like me to|Want me to|Should I)[^\n]*$/i, "")
    .trim();
  if (!cleanedBody) return null;
  return buildEmailDraftCard(state, {
    to: toMatch ? toMatch[1].trim() : "",
    subject: subMatch[1].trim(),
    body: cleanedBody,
  });
}

/** Feed a finished model job back in. */
export function applyModelOutput(state: HarnessState, output: { text: string; toolCalls: ToolCallLike[] }, purpose: ModelRequest["purpose"] = "tools") {
  state.modelTurns += 1;
  const calls = (output.toolCalls || []).filter((call) => call && call.name);
  const draftCall = calls.find((call) => call.name === "email_draft" || (call.name === "email_send" && state.intent.kind === "draft_reply"));
  if (draftCall) {
    state.emailDraft = buildEmailDraftCard(state, draftCall.arguments || {});
    state.answer = "";
    state.phase = "done";
    pushActivity(state.activity, { kind: "done", label: "Draft ready", status: "done" });
    return;
  }
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
    state.toolTurns = [...(state.toolTurns || []), {
      calls: state.pendingCalls.map((call, i) => ({ id: `call_${state.modelTurns}_${i}`, type: "function" as const, function: { name: call.name, arguments: JSON.stringify(call.arguments || {}) } })),
      results: state.pendingCalls.map(() => ""),
    }];
    state.phase = "tools";
    return;
  }
  const text = cleanAnswer(output.text);
  const parsedDraft = text ? parseEmailDraftFromText(state, text) : null;
  if (parsedDraft) {
    state.emailDraft = parsedDraft;
    state.answer = "";
    state.phase = "done";
    pushActivity(state.activity, { kind: "done", label: "Draft ready", status: "done" });
    return;
  }
  if (!text && purpose !== "synthesis") {
    // Empty or tool-only reply on the last allowed tool turn: force one written answer.
    state.phase = "synth";
    return;
  }
  if (state.config.synthLane !== "same" && purpose !== "synthesis" && state.usedTools && state.config.synthLane !== laneFor(state) && state.modelTurns < state.config.maxModelTurns + 1) {
    state.phase = "synth";
    return;
  }
  state.answer = text ? verifyFinal(state, text) : "I could not write an answer this time. Try asking again.";
  state.phase = "done";
  pushActivity(state.activity, { kind: "done", label: "Done", status: "done" });
}

/** Corpus = everything Hatch actually read for this turn plus the user's own words. */
export function claimCorpus(state: HarnessState) {
  const { kept } = assessEvidence(state);
  const items = kept.length ? kept : state.evidence;
  const { text } = budgetEvidence(items, 2_000_000);
  return buildCorpus({
    evidence: [text, ...items.map((e) => `${e.title}\n${e.date || ""}\n${e.text}`)],
    query: state.query,
    // Earlier assistant turns were verified when they were written, so restating them is fine.
    extra: [...state.history.map((t) => t.text), state.memoryBlock || "", state.earlierSummary || ""],
    today: state.today,
    todayIso: state.todayIso,
  });
}

function verifyFinal(state: HarnessState, text: string, draft = false): string {
  if (!state.config.verifyClaims) return text;
  // Plain chat (haiku, math, thanks) has nothing to ground against.
  if (!draft && !state.intent.needsTools && !state.usedTools && !state.evidence.length) return text;
  const result = verifyAnswer(text, claimCorpus(state), { draft });
  const prev = state.verification;
  state.verification = {
    checked: (prev?.checked || 0) + result.checked,
    unsupported: (prev?.unsupported || 0) + result.unsupported.length,
    stripped: (prev?.stripped || 0) + result.stripped,
    flagged: (prev?.flagged || 0) + result.flagged,
    kinds: [...new Set([...(prev?.kinds || []), ...result.unsupported.map((c) => c.kind)])],
  };
  return result.text;
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
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, "")
    .replace(/<\/tool_call>/gi, "")
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
): Promise<{ text: string; state: HarnessState; requests: ModelRequest[]; held?: ToolCallLike; emailDraft?: EmailDraftCard }> {
  const requests: ModelRequest[] = [];
  for (let guard = 0; guard < 12; guard++) {
    const next = await advance(state, deps);
    if (next.kind === "done") return { text: next.text, state, requests, emailDraft: next.emailDraft };
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
