import type { ChatMessage, TurnAnchor } from "./types.ts";

export const HISTORY_MAX_MESSAGES = 12;
export const HISTORY_MAX_CHARS = 8000;

export interface ThreadHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface LlmTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export function inspectThreadHistory(
  messages: Array<Pick<ChatMessage, "role" | "text"> & { done?: boolean }>,
  opts?: { maxMessages?: number; maxChars?: number; excludeLastUser?: string },
): { turns: ThreadHistoryTurn[]; dropped: boolean } {
  const maxMessages = opts?.maxMessages ?? HISTORY_MAX_MESSAGES;
  const maxChars = opts?.maxChars ?? HISTORY_MAX_CHARS;
  const cleaned: ThreadHistoryTurn[] = [];
  for (const m of messages || []) {
    const text = (m.text || "").trim();
    if (!text) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (m.role === "assistant" && m.done === false) continue;
    cleaned.push({ role: m.role, text });
  }
  if (opts?.excludeLastUser) {
    const last = cleaned[cleaned.length - 1];
    if (last?.role === "user" && last.text === opts.excludeLastUser.trim()) {
      cleaned.pop();
    }
  }
  const picked: ThreadHistoryTurn[] = [];
  let chars = 0;
  let clipped = false;
  for (let i = cleaned.length - 1; i >= 0 && picked.length < maxMessages; i--) {
    const text = cleaned[i].text;
    if (picked.length && chars + text.length > maxChars) break;
    const next = text.length > maxChars && !picked.length ? text.slice(-maxChars) : text;
    if (next !== text) clipped = true;
    picked.unshift({ role: cleaned[i].role, text: next });
    chars += next.length;
  }
  while (picked.length && picked[0].role !== "user") picked.shift();
  return { turns: picked, dropped: clipped || cleaned.length > picked.length };
}

/** Prior thread turns for the LLM, newest-windowed. Drops the current user query if already appended. */
export function windowThreadHistory(
  messages: Array<Pick<ChatMessage, "role" | "text"> & { done?: boolean }>,
  opts?: { maxMessages?: number; maxChars?: number; excludeLastUser?: string },
): ThreadHistoryTurn[] {
  return inspectThreadHistory(messages, opts).turns;
}

export function interleaveHistory(system: string, history: ThreadHistoryTurn[] | undefined, query: string): LlmTurn[] {
  return [
    { role: "system", content: system },
    ...(history || []).map((turn) => ({ role: turn.role, content: turn.text })),
    { role: "user", content: query },
  ];
}

function compactTurnLine(turn: ThreadHistoryTurn): string {
  const flat = turn.text.replace(/\s+/g, " ").trim();
  const limit = turn.role === "user" ? 120 : 180;
  const body = flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
  return `${turn.role === "user" ? "User asked" : "Hatch answered"}: ${body}`;
}

export function summarizeEarlierTurns(turns: ThreadHistoryTurn[], maxChars = 1200): string | undefined {
  if (!turns.length) return undefined;
  const lines: string[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const line = compactTurnLine(turns[i]);
    if (lines.length && used + line.length + 1 > maxChars) break;
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.length ? lines.join("\n") : undefined;
}

export function buildLongThreadContext(
  messages: Array<Pick<ChatMessage, "role" | "text"> & { done?: boolean; anchor?: TurnAnchor }>,
  opts?: { maxMessages?: number; maxChars?: number; excludeLastUser?: string },
): {
  turns: ThreadHistoryTurn[];
  earlierSummary?: string;
  dropped: boolean;
  anchor?: TurnAnchor;
  priorAnchors: TurnAnchor[];
} {
  const maxMessages = opts?.maxMessages ?? HISTORY_MAX_MESSAGES;
  const maxChars = opts?.maxChars ?? HISTORY_MAX_CHARS;
  const cleaned: ThreadHistoryTurn[] = [];
  for (const m of messages || []) {
    const text = (m.text || "").trim();
    if (!text) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (m.role === "assistant" && m.done === false) continue;
    cleaned.push({ role: m.role, text });
  }
  if (opts?.excludeLastUser) {
    const last = cleaned[cleaned.length - 1];
    if (last?.role === "user" && last.text === opts.excludeLastUser.trim()) cleaned.pop();
  }
  const { turns, dropped } = inspectThreadHistory(messages, { maxMessages, maxChars, excludeLastUser: opts?.excludeLastUser });
  const earlierCount = Math.max(0, cleaned.length - turns.length);
  const earlierSummary = earlierCount > 0 ? summarizeEarlierTurns(cleaned.slice(0, earlierCount)) : undefined;

  const anchors: TurnAnchor[] = [];
  const seenKey = new Set<string>();
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.anchor) continue;
    const key = `${m.anchor.topic || ""}|${(m.anchor.subjects[0] || "").toLowerCase()}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    anchors.push(m.anchor);
    if (anchors.length >= 4) break;
  }
  return {
    turns,
    earlierSummary,
    dropped: dropped || Boolean(earlierSummary),
    anchor: anchors[0],
    priorAnchors: anchors.slice(1),
  };
}
