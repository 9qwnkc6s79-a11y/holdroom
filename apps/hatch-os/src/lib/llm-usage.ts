export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function asCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Read prompt+completion counts from a vLLM / OpenAI-compatible `usage` object. */
export function parseUsage(value: unknown): LlmUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const nested = record.usage;
  const raw = nested && typeof nested === "object" && !Array.isArray(nested) ? (nested as Record<string, unknown>) : record;
  const promptTokens = asCount(raw.prompt_tokens ?? raw.promptTokens ?? raw.prompt_eval_count);
  const completionTokens = asCount(raw.completion_tokens ?? raw.completionTokens ?? raw.eval_count);
  const totalTokens = asCount(raw.total_tokens ?? raw.totalTokens) || promptTokens + completionTokens;
  if (promptTokens + completionTokens <= 0 && totalTokens <= 0) return null;
  return {
    promptTokens,
    completionTokens,
    totalTokens: totalTokens || promptTokens + completionTokens,
  };
}

export function usageFromCounts(promptTokens: number, completionTokens: number): LlmUsage | null {
  return parseUsage({ prompt_tokens: promptTokens, completion_tokens: completionTokens });
}

export function tokensUsed(usage: LlmUsage | null | undefined): number {
  if (!usage) return 0;
  return Math.max(usage.totalTokens, usage.promptTokens + usage.completionTokens);
}
