/** One persona turn: what "Daniel" types and what a good reply must (not) do. All checks are deterministic. */
export interface PersonaTurn {
  ask: string;
  /** "chat" = no lookup expected; "lookup" = must search; "draft" = must show the email draft card; "schedule" = calendar lookup. */
  kind: "chat" | "lookup" | "draft" | "schedule" | "notfound";
  /** Regexes (case-insensitive) a correct answer contains. Each counts equally. */
  facts?: string[];
  /** Regexes a correct answer must NOT contain (wrong thread, invented status, slang misattribution). */
  forbid?: string[];
  /** Regex the answer must match to prove it stayed on the earlier thread (follow-ups). */
  anchor?: string;
  /** Seconds before the turn counts as slow. Defaults by kind. */
  maxSeconds?: number;
}

export interface PersonaScenario {
  id: string;
  /** Free-text note for the report. */
  note?: string;
  turns: PersonaTurn[];
}

export interface PersonaFile {
  persona: string;
  scenarios: PersonaScenario[];
}
