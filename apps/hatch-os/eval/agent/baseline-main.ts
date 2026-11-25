/**
 * A faithful, condensed replica of main's live chat loop (chat-live.ts +
 * prompt.ts + connectors.ts on main @ 3bbed26) for the "before" score:
 * - Agent lane with native tools (Daniel's Model & Ethics is set to Hermes).
 * - Library passages ranked by keyword overlap.
 * - email_search / email_read return Gmail SUBJECT LINES only; Drive returns names only.
 * - Up to 4 model turns; tool results are appended as "Tool results:" user turns.
 * `deep: true` simulates PR #30's connectors (full thread bodies) on main's loop.
 */
import { EVENTS, FILES, LIBRARY, THREADS } from "./fixtures.ts";
import { gmailMatch } from "./fixture-tools.ts";
import type { ChatTurn, ToolCallLike } from "../../src/lib/harness/engine.ts";

export type ModelFn = (input: { messages: ChatTurn[]; toolsAvailable: boolean; protocol: "text" | "native" | "none" }) => Promise<{ text: string; toolCalls: ToolCallLike[] }>;

function rankPassages(query: string) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  return LIBRARY.map((row) => ({ row, score: terms.filter((t) => `${row.title} ${row.text}`.toLowerCase().includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ row }) => ({ file: row.title, room: row.source, snippet: row.text.slice(0, 360) }));
}

const STOP = new Set("a an the and or for of on in at to from with is are what get up speed me my".split(" "));

function fallbackQueries(raw: string) {
  const terms = raw.toLowerCase().split(/[^a-z0-9@._-]+/).filter((t) => t.length >= 2 && !STOP.has(t));
  return [...new Set([raw, terms.slice(0, 6).join(" "), terms.slice(0, 5).join(" OR ")].filter(Boolean))];
}

function runTool(call: ToolCallLike, deep: boolean): { detail: string; extra?: string } {
  const q = String(call.arguments?.query || call.arguments?.q || "");
  if (call.name === "email_search" || call.name === "email_read") {
    if (!deep) {
      const subjects = THREADS.filter((t) => gmailMatch(t, q)).slice(0, 5).map((t) => t.subject);
      return { detail: subjects.length ? `Gmail: ${subjects.join(" · ")}` : "No mail matched." };
    }
    for (const query of fallbackQueries(q)) {
      const found = THREADS.filter((t) => gmailMatch(t, query)).slice(0, 3);
      if (found.length) {
        const text = found.map((t) => `Subject: ${t.subject}\n${t.messages.map((m) => `From: ${m.from}\nDate: ${m.date.slice(0, 10)}\n${m.body}`).join("\n\n")}`).join("\n\n");
        return { detail: `Gmail: ${found.map((t) => t.subject).join(" · ")}`, extra: `Full thread text:\n${text}` };
      }
    }
    return { detail: "No mail matched." };
  }
  if (call.name === "cloud_files_search" || call.name === "cloud_files_read") {
    const files = FILES.filter((f) => f.name.toLowerCase().includes(q.replace(/'/g, "").toLowerCase()));
    if (deep) {
      const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const hits = FILES.filter((f) => terms.some((t) => `${f.name} ${f.text}`.toLowerCase().includes(t))).slice(0, 3);
      return { detail: hits.map((f) => f.name).join("\n") || "No files matched.", extra: hits.length ? `Full thread text:\n${hits.map((f) => `Subject: ${f.name}\n${f.text}`).join("\n\n")}` : undefined };
    }
    return { detail: files.map((f) => f.name).join("\n") || "No files matched." };
  }
  if (call.name === "calendar_list") return { detail: EVENTS.map((e) => `${e.start} ${e.title}`).join("\n") };
  return { detail: "That connector tool is not available." };
}

export async function runMainPipeline(
  query: string,
  history: { role: "user" | "assistant"; text: string }[] | undefined,
  model: ModelFn,
  deep: boolean,
): Promise<{ text: string; usedTools: boolean; turns: number }> {
  const passages = rankPassages(query);
  const system = [
    "You are an assistant for a sample firm, running on Hatch OS during a beta. The files are sample material, not a real client.",
    "Read / retrieve / reason is firm-capable. Use library passages from any department when they help.",
    "Do not invent prices or account numbers.",
    "Be concise. After the answer, mention the filename(s) you used in plain text if any.",
    "This is an agent turn. Use tools when you need to search, read, write a draft, or hand off.",
    "",
    "Library passages (firm-wide):",
    passages.length ? passages.map((s, i) => `[${i + 1}] ${s.file} (${s.room})\n${s.snippet}`).join("\n\n") : "(no library passages matched)",
  ].join("\n");
  const messages: ChatTurn[] = [{ role: "system", content: system }, ...(history || []).map((h) => ({ role: h.role, content: h.text })), { role: "user", content: query }];
  let usedTools = false;
  let visible = "";
  for (let turn = 1; turn <= 4; turn++) {
    const out = await model({ messages, toolsAvailable: true, protocol: "native" });
    if (!out.toolCalls.length) {
      visible = [visible, out.text].filter(Boolean).join("\n\n");
      return { text: visible, usedTools, turns: turn };
    }
    usedTools = true;
    const results = out.toolCalls.map((call) => ({ call, ...runTool(call, deep) }));
    messages.push({ role: "assistant", content: out.text || "(tool call)" });
    messages.push({
      role: "user",
      content: ["Tool results:", ...results.map((r) => `- ${r.call.name}: ok — ${r.detail.slice(0, 500)}`), ...results.map((r) => (r.extra || r.detail).slice(0, deep ? 16000 : 4000)), "Continue. If you can answer now, answer in prose. If you need another tool, call it."].join("\n"),
    });
  }
  return { text: visible || "The model returned an empty reply.", usedTools, turns: 4 };
}
