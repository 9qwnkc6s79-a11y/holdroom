/** Heuristic: Chat should run the Hermes tool loop instead of a plain Ask completion. */
const TOOL_NAMES =
  /\b(write_draft|search_library|read_file|handoff_to_department|list_files)\b/i;
const DRAFT_HINT =
  /\b(draft|write|create|save)\b.{0,40}\b(note|notes|file|doc|document|memo|checklist|draft)\b/i;
const NATURAL_TOOLS =
  /\b(use tools?|search(?: the)? library|look(?:ing)? up (?:in )?(?:the )?library|read (?:the )?files?|tool calls?)\b/i;
const OTHER_AGENT = /\bhandoff\b|\blist files\b/i;

export function looksSoftDraft(query: string): boolean {
  return DRAFT_HINT.test((query || "").trim());
}

export function looksAgenticQuery(query: string): boolean {
  const text = (query || "").trim();
  return TOOL_NAMES.test(text) || DRAFT_HINT.test(text) || NATURAL_TOOLS.test(text) || OTHER_AGENT.test(text);
}

export function wantsAgentTurn(query: string, agent?: boolean): boolean {
  if (agent === true) return true;
  if (agent === false) return false;
  return looksAgenticQuery(query);
}
