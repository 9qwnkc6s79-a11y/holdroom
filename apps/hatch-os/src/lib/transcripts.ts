import type { ChatThread } from "./types.ts";

export const TRANSCRIPT_KEY = "hatch-transcripts";

function count(thread?: ChatThread | null) {
  return thread?.messages?.length || 0;
}

/** The copy with more messages wins. An empty server thread must not erase a local one. */
export function richerThread(a?: ChatThread | null, b?: ChatThread | null): ChatThread | null {
  if (!a?.agentId || a.archived) return b?.agentId && !b.archived ? b : null;
  if (!b?.agentId || b.archived) return a;
  if (a.agentId !== b.agentId) return count(a) >= count(b) ? a : b;
  if (count(a) !== count(b)) return count(a) > count(b) ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function mergeThreads(local: ChatThread[], server: ChatThread[]): ChatThread[] {
  const byAgent = new Map<string, ChatThread>();
  for (const thread of [...local, ...server]) {
    if (!thread?.agentId || thread.archived) continue;
    const prev = byAgent.get(thread.agentId) || null;
    const next = richerThread(prev, thread);
    if (next) byAgent.set(thread.agentId, { ...next, messages: next.messages || [] });
  }
  return [...byAgent.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function readTranscripts(): ChatThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(TRANSCRIPT_KEY) || "[]") as ChatThread[];
    return Array.isArray(raw) ? raw.filter((thread) => thread && thread.agentId && !thread.archived) : [];
  } catch {
    return [];
  }
}

export function writeTranscripts(threads: ChatThread[]) {
  if (typeof window === "undefined") return;
  const trimmed = mergeThreads(threads, []).slice(0, 30).map((thread) => ({
    ...thread,
    messages: (thread.messages || []).slice(-80).map((message) => ({
      ...message,
      text: message.text.slice(0, 8000),
    })),
  }));
  try {
    localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(trimmed));
  } catch {
    /* the in-memory copy still holds the conversation */
  }
}
