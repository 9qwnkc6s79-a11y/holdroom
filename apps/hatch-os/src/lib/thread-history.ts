import type { ChatMessage } from "./types.ts";

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
