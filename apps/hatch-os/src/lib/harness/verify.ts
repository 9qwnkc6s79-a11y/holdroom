/**
 * Claim verification. Every quoted phrase, date, time, amount, percentage, ID
 * and multi-digit number in an answer must appear in what Hatch actually read
 * (evidence text, titles, the user's own words, firm memory, today's date).
 * Unsupported claims are stripped (bullet lines) or flagged inline, so a small
 * model cannot slip an invented "$9,625" or "attached the site plan" past the user.
 *
 * Deterministic, no model call, no network. Used by the harness (live) and the
 * eval / persona QA graders.
 */

export type ClaimKind = "quote" | "money" | "percent" | "date" | "time" | "id" | "number" | "attachment" | "relative_time";

export interface Claim {
  kind: ClaimKind;
  raw: string;
  /** Normalized comparison key. */
  key: string;
  line: number;
}

export interface VerifyResult {
  text: string;
  checked: number;
  unsupported: Claim[];
  stripped: number;
  flagged: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";

/** lowercase, unify quotes/dashes, collapse to alnum + single spaces. */
export function normText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/&#39;|&apos;|[‘’`´]/g, "'")
    .replace(/&quot;|[“”]/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[^a-z0-9$%.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripUrls(s: string): string {
  return s.replace(/\]\((https?:[^)\s]+)\)/g, "]").replace(/https?:\/\/\S+/g, " ");
}

function numVal(s: string): number | null {
  const m = String(s).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  let v = Number(m[0]);
  if (/k\b/i.test(s)) v *= 1000;
  if (/\bm(?:illion)?\b/i.test(s.replace(/^[^a-z]*/i, "")) && /\d\s*(m|million)\b/i.test(s)) v *= 1_000_000;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

function dateKeys(text: string): Set<string> {
  const out = new Set<string>();
  const t = text.toLowerCase();
  for (const m of t.matchAll(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "g"))) out.add(`${MONTHS[m[1].replace(".", "")]}-${Number(m[2])}`);
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`, "g"))) out.add(`${MONTHS[m[2].replace(".", "")]}-${Number(m[1])}`);
  for (const m of t.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})/g)) out.add(`${Number(m[2])}-${Number(m[3])}`);
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) out.add(`${a}-${b}`);
  }
  return out;
}

function timeKeys(text: string): Set<string> {
  const out = new Set<string>();
  const t = text.toLowerCase();
  for (const m of t.matchAll(/\b(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?/g)) {
    let h = Number(m[1]);
    if (m[3] === "p" && h < 12) h += 12;
    if (m[3] === "a" && h === 12) h = 0;
    out.add(`${h % 12}:${m[2]}`);
  }
  for (const m of t.matchAll(/\b(\d{1,2})\s*([ap])\.?m\.?\b/g)) out.add(`${Number(m[1]) % 12}:00`);
  return out;
}

export interface Corpus {
  norm: string;
  numbers: Set<number>;
  dates: Set<string>;
  times: Set<string>;
  query: string;
}

export function buildCorpus(parts: { evidence: string[]; query: string; extra?: string[]; today?: string; todayIso?: string }): Corpus {
  const all = [...parts.evidence, parts.query, ...(parts.extra || []), parts.today || "", parts.todayIso || ""].join("\n");
  const numbers = new Set<number>();
  for (const m of all.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/\d+(?:\.\d+)?/g)) {
    const v = Number(m[0]);
    if (Number.isFinite(v)) numbers.add(Math.round(v * 100) / 100);
  }
  const dates = dateKeys(all);
  // Today / tomorrow / yesterday are always fair to name.
  const iso = parts.todayIso || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const base = new Date(`${iso}T12:00:00Z`);
    for (const delta of [-1, 0, 1]) {
      const d = new Date(base.getTime() + delta * 86400000);
      dates.add(`${d.getUTCMonth() + 1}-${d.getUTCDate()}`);
    }
  }
  return { norm: ` ${normText(all)} `, numbers, dates, times: timeKeys(all), query: parts.query.toLowerCase() };
}

/** Pull checkable claims out of an answer. */
export function extractClaims(answer: string, opts: { draft?: boolean } = {}): Claim[] {
  const claims: Claim[] = [];
  const lines = String(answer || "").split("\n");
  lines.forEach((rawLine, line) => {
    const l = stripUrls(rawLine);
    // Quoted phrases (straight or curly), 2+ words or 6+ chars.
    for (const m of l.matchAll(/["“]([^"”\n]{4,160})["”]/g)) {
      const inner = m[1].trim();
      if (inner.split(/\s+/).length >= 2 || inner.length >= 6) claims.push({ kind: "quote", raw: inner, key: normText(inner), line });
    }
    let rest = l.replace(/["“][^"”\n]{4,160}["”]/g, " ");
    for (const m of rest.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|K|million|M)?\b/g)) {
      const v = numVal(m[0]);
      if (v !== null) claims.push({ kind: "money", raw: m[0].trim(), key: String(v), line });
    }
    rest = rest.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|K|million|M)?\b/g, " ");
    for (const m of rest.matchAll(/\b\d+(?:\.\d+)?\s?%/g)) claims.push({ kind: "percent", raw: m[0], key: String(numVal(m[0])), line });
    rest = rest.replace(/\b\d+(?:\.\d+)?\s?%/g, " ");
    for (const key of dateKeys(rest)) claims.push({ kind: "date", raw: key, key, line });
    rest = rest
      .replace(new RegExp(`\\b${MONTH_RE}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*20\\d{2})?\\b`, "gi"), " ")
      .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:,?\\s*20\\d{2})?\\b`, "gi"), " ")
      .replace(/\b20\d{2}-\d{2}-\d{2}(?:T[\d:.]+Z?)?/g, " ")
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ");
    for (const key of timeKeys(rest)) claims.push({ kind: "time", raw: key, key, line });
    rest = rest.replace(/\b\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?|\b\d{1,2}\s*[ap]\.?m\.?\b/gi, " ");
    for (const m of rest.matchAll(/\b[A-Z]{1,6}-\d[\w-]*\b|#\d{3,}\b/g)) claims.push({ kind: "id", raw: m[0], key: normText(m[0]), line });
    rest = rest.replace(/\b[A-Z]{1,6}-\d[\w-]*\b|#\d{3,}\b/g, " ");
    for (const m of rest.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w.]*\d)/g)) {
      const v = numVal(m[0]);
      if (v === null) continue;
      // Years and small counts ("3 emails", "2 options") are not worth flagging.
      if ((v >= 1990 && v <= 2100 && Number.isInteger(v)) || (v < 100 && !/\./.test(m[0]))) continue;
      claims.push({ kind: "number", raw: m[0], key: String(v), line });
    }
    if (opts.draft) {
      if (/\b(attached|attaching|enclosed|i'?ve attached|see attached|attachment)\b/i.test(l)) claims.push({ kind: "attachment", raw: "attachment", key: "attach", line });
      const rel = l.match(/\b(tomorrow|tonight|this (?:morning|afternoon|evening|week)|later today)\b/i);
      if (rel) claims.push({ kind: "relative_time", raw: rel[1], key: rel[1].toLowerCase(), line });
    }
  });
  return claims;
}

export function claimSupported(c: Claim, corpus: Corpus): boolean {
  switch (c.kind) {
    case "quote": {
      if (!c.key) return true;
      if (corpus.norm.includes(` ${c.key} `) || corpus.norm.includes(c.key)) return true;
      // Allow a quote that drops a trailing/leading word or punctuation: 85% of words in order.
      const words = c.key.split(" ").filter(Boolean);
      if (words.length >= 4) {
        const head = words.slice(0, Math.ceil(words.length * 0.6)).join(" ");
        const tail = words.slice(Math.floor(words.length * 0.4)).join(" ");
        return corpus.norm.includes(head) && corpus.norm.includes(tail);
      }
      return false;
    }
    case "money":
    case "percent":
    case "number": {
      const v = Number(c.key);
      return corpus.numbers.has(v) || corpus.numbers.has(Math.round(v)) || [...corpus.numbers].some((n) => Math.abs(n - v) < 0.005);
    }
    case "date":
      return corpus.dates.has(c.key);
    case "time":
      return corpus.times.has(c.key);
    case "id":
      return corpus.norm.includes(c.key);
    case "attachment":
      return /\battach|enclos|send (it|the|over)\b/i.test(corpus.query);
    case "relative_time":
      return corpus.query.includes(c.key.split(" ").pop() || c.key);
  }
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** Verify and repair an answer. Bullets with unsupported claims are dropped; other lines get an inline flag. */
export function verifyAnswer(answer: string, corpus: Corpus, opts: { draft?: boolean; flag?: string; note?: boolean } = {}): VerifyResult {
  const claims = extractClaims(answer, opts);
  const unsupported = claims.filter((c) => !claimSupported(c, corpus));
  if (!unsupported.length) return { text: answer, checked: claims.length, unsupported, stripped: 0, flagged: 0 };
  const lines = String(answer).split("\n");
  const badLines = new Map<number, Claim[]>();
  for (const c of unsupported) badLines.set(c.line, [...(badLines.get(c.line) || []), c]);
  let stripped = 0;
  let flagged = 0;
  const flag = opts.flag ?? " (not in your sources)";
  const out: string[] = [];
  const nonEmpty = lines.filter((l) => l.trim()).length;
  lines.forEach((line, i) => {
    const bad = badLines.get(i);
    if (!bad) return out.push(line);
    if (opts.draft) {
      // Drafts: drop the sentence(s) carrying the invented detail, keep the rest of the line.
      const sentences = line.split(/(?<=[.!?])\s+/);
      const kept = sentences.filter((s) => {
        const sc = extractClaims(s, opts);
        return !sc.some((c) => !claimSupported(c, corpus));
      });
      stripped += sentences.length - kept.length;
      if (kept.join(" ").trim()) out.push(kept.join(" "));
      return;
    }
    if (BULLET.test(line) && nonEmpty > 2) {
      stripped += 1;
      return;
    }
    let repaired = line;
    for (const c of bad) {
      if (c.kind === "quote") {
        const re = new RegExp(`["“]${escapeRe(c.raw)}["”]`);
        repaired = repaired.replace(re, (m) => `${m}${flag}`);
      } else if (c.kind === "money" || c.kind === "id" || c.kind === "number" || c.kind === "percent") {
        const idx = repaired.indexOf(c.raw);
        if (idx >= 0) repaired = `${repaired.slice(0, idx + c.raw.length)}${flag}${repaired.slice(idx + c.raw.length)}`;
        else repaired = `${repaired}${flag}`;
      } else if (!repaired.endsWith(flag)) {
        repaired = `${repaired}${flag}`;
      }
      flagged += 1;
    }
    out.push(repaired);
  });
  let text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (stripped && opts.note !== false && !opts.draft) text += `\n\n_I left out ${stripped} detail${stripped === 1 ? "" : "s"} I couldn't match to your sources._`;
  return { text, checked: claims.length, unsupported, stripped, flagged };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
