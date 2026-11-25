import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUsage, tokensUsed } from "./llm-usage.ts";

describe("llm usage", () => {
  it("reads vLLM / OpenAI usage fields", () => {
    const usage = parseUsage({ prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 });
    assert.deepEqual(usage, { promptTokens: 12, completionTokens: 8, totalTokens: 20 });
    assert.equal(tokensUsed(usage), 20);
  });

  it("reads a nested usage object and Ollama counts", () => {
    assert.equal(parseUsage({ usage: { prompt_tokens: 3, completion_tokens: 2 } })?.totalTokens, 5);
    assert.equal(parseUsage({ prompt_eval_count: 10, eval_count: 4 })?.completionTokens, 4);
  });

  it("ignores empty or missing counts", () => {
    assert.equal(parseUsage(null), null);
    assert.equal(parseUsage({}), null);
    assert.equal(parseUsage({ prompt_tokens: 0, completion_tokens: 0 }), null);
    assert.equal(tokensUsed(null), 0);
  });
});
