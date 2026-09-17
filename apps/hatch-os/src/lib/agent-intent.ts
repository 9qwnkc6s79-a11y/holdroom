/** Heuristic: Chat should run the Hermes tool loop instead of a plain Ask completion. */
const AGENT_HINT =
  /\b(write_draft|search_library|read_file|handoff_to_department|list_files)\b|\bhandoff\b|\blist files\b|\b(draft|write|create|save)\b.{0,40}\b(note|notes|file|doc|document|memo|checklist|draft)\b/i;

export function looksAgenticQuery(query: string): boolean {
  return AGENT_HINT.test((query || "").trim());
}

export function wantsAgentTurn(query: string, agent?: boolean): boolean {
  if (agent === true) return true;
  if (agent === false) return false;
  return looksAgenticQuery(query);
}
