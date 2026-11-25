/** Rubric scorer. 100 points per case. */
import type { EvalCase } from "./cases.ts";

export interface CaseScore {
  id: string;
  total: number;
  parts: Record<string, number>;
  notes: string[];
}

const CLARIFY = /(could|can) you (please )?(clarify|specify|tell me (which|what|more))|which (one|thread|email|project|sign)\b[^.?]*\?|what do you mean|more (details|context|information) (would|will) help|let me know which/i;
const PREAMBLE = /^(sure|certainly|of course|absolutely|great question|i found some|i searched|here is what i found|based on)/i;
const NOT_FOUND = /(couldn'?t|could not|did not|didn'?t) find|no (emails?|files?|results?|threads?|mention)|nothing (about|on|in)|not (find|see) any/i;

export function scoreCase(c: EvalCase, answer: string, usedTools: boolean): CaseScore {
  const notes: string[] = [];
  const text = String(answer || "");
  const parts: Record<string, number> = {};
  parts.routing = usedTools === c.needsTools ? 15 : 0;
  if (!parts.routing) notes.push(usedTools ? "used tools on a plain ask" : "did not look anything up");
  if (c.facts.length) {
    const hit = c.facts.filter((f) => new RegExp(f, "i").test(text));
    parts.facts = Math.round((40 * hit.length) / c.facts.length);
    const miss = c.facts.filter((f) => !hit.includes(f));
    if (miss.length) notes.push(`missing: ${miss.join(", ")}`);
  } else parts.facts = text.trim().length > 0 ? 40 : 0;
  parts.noClarify = CLARIFY.test(text) ? 0 : 15;
  if (!parts.noClarify) notes.push("asked the user to clarify");
  const first = text.trim().split("\n")[0] || "";
  parts.leads = first && !first.trim().endsWith("?") && !PREAMBLE.test(first) ? 10 : 0;
  if (!parts.leads) notes.push("does not lead with the answer");
  parts.cites = !c.cite?.length || c.cite.some((x) => new RegExp(x, "i").test(text)) ? 10 : 0;
  if (!parts.cites) notes.push("no source named");
  let honest = 10;
  for (const f of c.forbid || []) if (new RegExp(f, "i").test(text)) honest = 0;
  if (c.expectNotFound && !NOT_FOUND.test(text)) honest = 0;
  parts.honesty = honest;
  if (!honest) notes.push(c.expectNotFound ? "did not say it found nothing" : "said something forbidden");
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { id: c.id, total, parts, notes };
}
