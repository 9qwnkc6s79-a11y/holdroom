/**
 * Context budgeting. Hermes runs with a 16k-token window and Qwen with 32k on
 * the current RunPod endpoints, so long email threads have to be compacted
 * before they reach the model. Everything here is deterministic and offline.
 */

export interface EvidenceMeta {
  threadRef?: string;
  gmailThreadId?: string;
  accountEmail?: string;
  replyToEmail?: string;
  subject?: string;
  inReplyTo?: string;
  references?: string;
}

export interface Evidence {
  id: string;
  source: "mail" | "files" | "calendar" | "library" | "memory";
  /** Subject, file name, or event title. */
  title: string;
  /** Opaque reference for re-reading (thread id, file id). */
  ref?: string;
  /** ISO date or human date of the latest activity, if known. */
  date?: string;
  /** Full text as read. */
  text: string;
  /** 0..1, higher is more relevant. */
  score: number;
  /** True when only a title/snippet was seen, not the full body. */
  shallow?: boolean;
  /** Extra connector metadata (sender email, gmail thread id, Reply-To headers). */
  meta?: EvidenceMeta;
  /** Tappable source URL (Gmail thread, Drive file, Calendar event). */
  url?: string;
  /** True when relevance gate flagged this item as weak/tangential. */
  weak?: boolean;
}

/** Rough tokens for budget math. vLLM tokenizers average 3.5-4 chars/token on English mail. */
export function approxTokens(text: string): number {
  return Math.ceil(String(text || "").length / 3.6);
}

const QUOTED_HEADER = /^(?:On .{6,120}(?:wrote|writes):?\s*$|-{2,}\s*Original Message\s*-{2,}|From: .+\nSent: .+)/im;
const SIGNATURE = /\n(?:--\s*\n|Sent from my (?:iPhone|iPad|Android)|Get Outlook for)[\s\S]*$/i;

/** Remove quoted reply chains and signatures from one email body. */
export function stripQuoted(body: string): string {
  let text = String(body || "").replace(/\r\n/g, "\n");
  const quoted = text.search(QUOTED_HEADER);
  if (quoted > 0) text = text.slice(0, quoted);
  text = text
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
  text = text.replace(SIGNATURE, "");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Split a formatted thread into messages. Accepts the formats Hatch connectors
 * produce: blocks that start with "From:" or "--- Message N" lines.
 */
export function splitThread(text: string): string[] {
  const parts = String(text || "")
    .split(/\n(?=(?:-{3,}\s*Message\b|From:\s))/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [String(text || "")];
}

function firstSentences(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const cut = flat.slice(0, max);
  const stop = cut.lastIndexOf(". ");
  return stop > 80 ? cut.slice(0, stop + 1) : cut + (flat.length > max ? "…" : "");
}

/**
 * Compact one thread to at most `maxChars`: newest messages stay whole (minus
 * quoted text), older ones shrink to their header lines and first sentences.
 */
export function compactThread(text: string, maxChars: number): string {
  const messages = splitThread(text).map(stripQuoted);
  const whole = messages.join("\n\n");
  if (whole.length <= maxChars) return whole;
  const out: string[] = new Array(messages.length);
  let used = 0;
  // Newest first get full text.
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const remainingOlder = i; // how many still need at least a summary line
    const reserve = remainingOlder * 260;
    if (used + message.length + reserve <= maxChars) {
      out[i] = message;
      used += message.length;
      continue;
    }
    const lines = message.split("\n");
    const header = lines.filter((line) => /^(From|To|Date|Subject|Sent|Attachments?):/i.test(line)).join("\n");
    const body = lines.filter((line) => !/^(From|To|Date|Subject|Sent|Cc|Attachments?):/i.test(line)).join(" ");
    const room = Math.max(160, Math.min(900, maxChars - used - reserve));
    const short = `${header}\n[earlier message, shortened] ${firstSentences(body, room)}`.trim();
    out[i] = short;
    used += short.length;
  }
  const joined = out.join("\n\n");
  return joined.length > maxChars ? joined.slice(joined.length - maxChars) : joined;
}

/**
 * Fit evidence into a character budget. Higher score gets more room; every
 * item keeps at least a header so the model knows it exists.
 */
/** Marketing mail pads previews with invisible characters that cost a token each. */
export function cleanForModel(text: string): string {
  return String(text || "")
    .replace(/[\u034F\u00AD\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .replace(/[ \t\u00A0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export function budgetEvidence(items: Evidence[], maxChars: number): { text: string; used: Evidence[]; dropped: number } {
  const ranked = [...items].map((item) => ({ ...item, text: cleanForModel(item.text) })).sort((a, b) => b.score - a.score);
  const minEach = 500;
  const blocks: string[] = [];
  const used: Evidence[] = [];
  let remaining = maxChars;
  ranked.forEach((item, index) => {
    if (remaining < 200) return;
    const left = ranked.length - index;
    const weight = index === 0 ? 0.45 : index < 3 ? 0.3 : 0.2;
    const share = Math.max(minEach, Math.min(remaining - (left - 1) * 200, Math.floor(remaining * weight) + (left === 1 ? remaining : 0)));
    const head = `[${used.length + 1}] ${labelFor(item.source)}: ${item.title}${item.date ? ` (${item.date})` : ""}${item.url ? ` — citation_url: ${item.url}` : ""}${item.shallow ? " — title only, body not read" : ""}`;
    const bodyRoom = Math.max(120, Math.min(share, remaining) - head.length - 2);
    const latest = item.source === "mail" && !item.shallow ? latestLine(item.text) : "";
    const fileText = item.source === "files" ? formatCsvForModel(item.text) : item.text;
    const body = item.source === "mail" ? `${latest}${compactThread(item.text, bodyRoom - latest.length)}` : clip(fileText, bodyRoom);
    const block = `${head}\n${body}`;
    blocks.push(block);
    used.push(item);
    remaining -= block.length + 2;
  });
  return { text: blocks.join("\n\n"), used, dropped: ranked.length - used.length };
}

/** "Latest message (2026-11-19, Rick Delgado): ..." so small models weigh recency. */
export function latestLine(thread: string): string {
  const parts = splitThread(thread);
  if (parts.length < 2) return "";
  const last = stripQuoted(parts[parts.length - 1]);
  const from = (last.match(/^From:\s*([^<\n]+)/m) || [])[1]?.trim();
  const date = (last.match(/^(?:Date|Sent):\s*([^\n]+)/m) || [])[1]?.trim();
  const body = last.split("\n").filter((line) => !/^(From|To|Date|Sent|Cc|Subject|Attachments?):/i.test(line)).join(" ");
  return `Latest message (${[date, from].filter(Boolean).join(", ")}): ${firstSentences(body, 320)}\n`;
}

function clip(text: string, max: number): string {
  const flat = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function labelFor(source: Evidence["source"]): string {
  return source === "mail" ? "Email thread" : source === "files" ? "File" : source === "calendar" ? "Calendar" : source === "library" ? "Library" : "Memory";
}

export interface LaneWindow {
  /** Model context window, tokens. */
  contextTokens: number;
  /** Tokens reserved for the answer. */
  outputTokens: number;
}

/** How many characters of evidence fit, after the fixed prompt and history. */
export function evidenceBudgetChars(window: LaneWindow, fixedPromptChars: number): number {
  // Real mail (URLs, numbers, names) runs ~3 chars/token on these tokenizers; keep a 900-token cushion for tool schemas and template overhead.
  const tokensLeft = window.contextTokens - window.outputTokens - Math.ceil(fixedPromptChars / 3.2) - 900;
  return Math.max(2000, Math.floor(tokensLeft * 2.9));
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function formatCsvForModel(text: string): string {
  const lines = String(text || "").split(/\r?\n/);
  if (lines.length < 3) return text;
  // Find first true CSV header row: no pipes/colons/numeric thousands-commas, short column labels, matching row width below.
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length - 2, 6); i++) {
    const line = lines[i].trim();
    if (!line.includes(",") || line.includes("|")) continue;
    const cells = splitCsvLine(line);
    const validHeader =
      cells.length >= 3 &&
      cells.length <= 14 &&
      cells.every((c) => c.length > 0 && c.length <= 36 && !c.includes(":")) &&
      !/\d/.test(cells.slice(1).join("")) &&
      !/^\d{4}-\d{2}-\d{2}$/.test(cells[0]) &&
      !cells.some((c) => /^(TRUE|FALSE)$/i.test(c));
    if (!validHeader) continue;
    const next1 = splitCsvLine(lines[i + 1].trim());
    const next2 = splitCsvLine(lines[i + 2].trim());
    if (next1.length === cells.length && next2.length === cells.length) {
      headerIdx = i;
      headers = cells;
      break;
    }
  }
  if (headerIdx < 0) return text;
  const out: string[] = lines.slice(0, headerIdx);
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const cells = splitCsvLine(raw);
    if (cells.length < 2) {
      out.push(raw);
      continue;
    }
    const rowLabel = cells[0];
    const pairs = cells.slice(1).map((val, idx) => {
      const h = headers[idx + 1] || `Col ${idx + 2}`;
      return val ? `${h}: ${val}` : "";
    }).filter(Boolean);
    out.push(rowLabel ? `${rowLabel} — ${pairs.join(", ")}` : pairs.join(", "));
  }
  return out.join("\n");
}
