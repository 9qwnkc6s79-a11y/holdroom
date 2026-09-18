import { workspaceLabel } from "./departments";
import { interleaveHistory, type ThreadHistoryTurn } from "./thread-history.ts";
import { aclPreview, TOOL_SCHEMAS } from "./tools";
import type { Source, ToolEvent } from "./types";

export {
  HISTORY_MAX_CHARS,
  HISTORY_MAX_MESSAGES,
  interleaveHistory,
  windowThreadHistory,
  type ThreadHistoryTurn,
} from "./thread-history.ts";

export interface PromptInput {
  workspaceId: string;
  query: string;
  sources: Source[];
  fileListing?: string;
  toolResults?: ToolEvent[];
  extra?: string[];
  accessibleDepartments: string[];
  history?: ThreadHistoryTurn[];
}

function sharedContext(input: PromptInput) {
  const workspace = workspaceLabel(input.workspaceId);
  const passages = input.sources.length
    ? input.sources.map((s, i) => `[${i + 1}] ${s.file} (${s.room})\n${s.snippet}`).join("\n\n")
    : "(no library passages matched — you may still use general café knowledge, but do not invent prices or Toast numbers)";
  const prior = (input.toolResults || [])
    .map((t) => `- ${t.name}: ${t.ok ? "ok" : "denied"} — ${t.detail}`)
    .join("\n");
  return {
    workspace,
    passages,
    prior,
    firmRules: [
      "You are the in-house assistant for Boundaries Coffee, running on Hatch OS.",
      `Active workspace: ${workspace}. This is UX context (which Chat / Files / Library view the user is in), not an LLM firewall.`,
      "Read / retrieve / reason is firm-capable. Use library passages from any department when they help.",
      "Write / create / update documents only in departments the user can open. Never silently edit another department’s Files (example: do not update a P&L the user cannot open).",
      "If work belongs in a department the user cannot write, hand off — notify + learn — do not pretend you wrote the file.",
      aclPreview(input.accessibleDepartments),
      "Do not call or pretend to call OpenAI, Anthropic, or any public lab.",
      "Do not invent prices or Toast numbers. DEMO files are labeled DEMO.",
      "Do not use <think> tags, </think>, /think, or /no_think. Answer with the final reply only.",
      "Prior user and assistant turns in this request are this thread’s memory. Use them for follow-ups (what the user said, what you answered). If they ask what they said or asked, quote the earlier user turn. Do not say they said nothing when history is present. Library passages are café facts, not a substitute for thread memory.",
      "Be concise. After the answer, mention the filename(s) you used in plain text if any. If the question is only about this conversation, do not cite library files.",
    ],
    corpus: [
      "",
      "Library passages (firm-wide):",
      passages,
      "",
      "Files in the active workspace:",
      input.fileListing || "(none listed)",
      prior ? `\nTool results so far:\n${prior}` : "",
      input.extra?.length ? `\nRead files:\n${input.extra.join("\n\n")}` : "",
    ],
  };
}

export function buildAskMessages(input: PromptInput) {
  const ctx = sharedContext(input);
  const system = [
    ...ctx.firmRules,
    "This is a plain Ask turn — answer only. Do not emit a TOOL line or call tools.",
    ...ctx.corpus,
  ]
    .filter(Boolean)
    .join("\n");

  return interleaveHistory(system, input.history, input.query);
}

export function buildAgentMessages(input: PromptInput) {
  const ctx = sharedContext(input);
  const tools = TOOL_SCHEMAS.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const system = [
    ...ctx.firmRules,
    "This is an agent turn. Use tools when you need to search, read, write a draft, or hand off.",
    "Prefer native tool calls (OpenAI tools / Hermes <tool_call>). Fallback trailer if tools are unavailable:",
    tools,
    'TOOL {"name":"write_draft","arguments":{"departmentId":"little-elm","filename":"notes.md","text":"..."}}',
    'TOOL {"name":"handoff_to_department","arguments":{"toDepartmentId":"hq-ops","summary":"...","facts":"..."}}',
    "If no action is needed, answer in prose and do not emit a TOOL line.",
    ...ctx.corpus,
  ]
    .filter(Boolean)
    .join("\n");

  return interleaveHistory(system, input.history, input.query);
}
