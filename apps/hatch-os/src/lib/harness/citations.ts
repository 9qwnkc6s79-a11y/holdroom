/**
 * Attach source chips only for evidence the answer actually used.
 * Retrieved-but-unused hits (or a no-source reply) get no chips.
 */
import type { Source } from "../types.ts";
import type { Evidence } from "./context.ts";

const TITLE_STOP = new Set([
  "the", "and", "for", "from", "with", "this", "that", "your", "you", "our", "my",
  "email", "mail", "file", "files", "thread", "message", "updated", "update",
  "invitation", "fwd", "fw", "re",
]);

function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function coreTitle(title: string): string {
  return normalize(title).replace(/^(re|fw|fwd)\s+/, "");
}

/** True when the answer cites this item by URL, title, or a quoted phrase from it. */
export function answerUsesSource(answer: string, item: Pick<Evidence, "title" | "url" | "text">): boolean {
  const raw = String(answer || "");
  const hay = normalize(raw);
  if (!hay) return false;
  if (item.url && raw.includes(item.url)) return true;

  const title = coreTitle(item.title || "");
  if (title.length >= 8 && hay.includes(title)) return true;
  if (title.length >= 16) {
    for (let i = 0; i <= title.length - 16; i++) {
      const slice = title.slice(i, i + 16);
      if (/[a-z]/.test(slice) && hay.includes(slice)) return true;
    }
  }
  const titleTokens = title.split(" ").filter((t) => t.length >= 4 && !TITLE_STOP.has(t) && !/^\d{1,3}$/.test(t));
  if (titleTokens.length >= 2 && titleTokens.filter((t) => hay.includes(t)).length >= 2) return true;

  const body = normalize((item.text || "").slice(0, 8000));
  const quotes = [...raw.matchAll(/[“"']([^”"'“]{8,80})[”"']/g)].map((m) => normalize(m[1]));
  if (quotes.some((q) => q.length >= 8 && body.includes(q))) return true;
  return false;
}

export function sourcesUsedInAnswer(answer: string, evidence: Evidence[] | null | undefined): Source[] {
  const used = (evidence || []).filter((item) => !item.shallow && item.source !== "memory" && answerUsesSource(answer, item));
  return used
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => ({
      file: item.title,
      room: item.source === "mail" ? "Email" : item.source === "files" ? "Files" : item.source === "calendar" ? "Calendar" : "Library",
      snippet: item.text.replace(/\s+/g, " ").slice(0, 240),
      ...(item.url ? { url: item.url } : {}),
    }));
}
