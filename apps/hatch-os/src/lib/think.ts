/** Hide Qwen / vLLM chain-of-thought so Chat and Telegram only show the final answer. */

const COMPLETE_THINK_SRC = "<(think|thinking|redacted_reasoning)\\b[^>]*>[\\s\\S]*?<\\/\\1>";
const UNCLOSED_THINK = /<(?:think|thinking|redacted_reasoning)\b[^>]*>[\s\S]*$/i;
const ORPHAN_CLOSE_SRC = "<\\/(?:think|thinking|redacted_reasoning)>";
const STRAY_TAGS = /<\/?(?:think|thinking|redacted_reasoning)\b[^>]*>/gi;
const SOFT_SWITCH = /(?:^|\s)\/(?:no_think|think)\b/gi;

function lastOrphanCloseEnd(text: string): number {
  const re = new RegExp(ORPHAN_CLOSE_SRC, "gi");
  let end = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    end = match.index + match[0].length;
  }
  return end;
}

/** Post-process a finished assistant string. Safe to run more than once. */
export function stripThinkBlocks(text: string): string {
  let out = String(text ?? "");
  out = out.replace(new RegExp(COMPLETE_THINK_SRC, "gi"), "");
  out = out.replace(UNCLOSED_THINK, "");
  const orphanEnd = lastOrphanCloseEnd(out);
  if (orphanEnd >= 0) out = out.slice(orphanEnd);
  out = out.replace(STRAY_TAGS, "");
  out = out.replace(SOFT_SWITCH, " ");
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Incremental view while tokens arrive. Holds unclosed `<think>` bodies.
 * Once `</think>` is seen (paired or orphan), only the final answer remains.
 */
export function visibleStreamText(raw: string, finished = false): string {
  if (finished) return stripThinkBlocks(raw);
  const withoutComplete = String(raw ?? "").replace(new RegExp(COMPLETE_THINK_SRC, "gi"), "");
  const open = withoutComplete.search(/<(?:think|thinking|redacted_reasoning)\b/i);
  if (open >= 0) return stripThinkBlocks(withoutComplete.slice(0, open));
  return stripThinkBlocks(withoutComplete);
}

/** Request fields that turn off Qwen3 / Qwen3.8 thinking on vLLM-style OpenAI servers. */
export function thinkingOffExtras(remote: boolean): Record<string, unknown> {
  if (!remote) return { think: false };
  return {
    max_tokens: 1024,
    think: false,
    enable_thinking: false,
    chat_template_kwargs: { enable_thinking: false },
  };
}
