import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripThinkBlocks, thinkingOffExtras, visibleStreamText } from "./think.ts";

const FINAL = "I'm here. What do you need?";

describe("stripThinkBlocks", () => {
  it("strips a full <think>…</think> wrap and keeps the final answer", () => {
    const raw = `<think>\nNeed a short greeting. No files.\n</think>\n\n${FINAL}`;
    assert.equal(stripThinkBlocks(raw), FINAL);
  });

  it("strips an orphan </think> preamble (Daniel Telegram leak)", () => {
    const raw = `We need answer user "Testing /no_think". Need plain Ask turn, no tool. Need likely concise. Need maybe mention no files used? User just testing. We can say "I'm here. What do you need?" Since no files used maybe not mention. Ensure no think tags. Final only.
</think>

${FINAL}`;
    assert.equal(stripThinkBlocks(raw), FINAL);
    assert.equal(stripThinkBlocks(raw).includes("/no_think"), false);
    assert.equal(stripThinkBlocks(raw).includes("</think>"), false);
  });

  it("leaves a plain final-only reply unchanged", () => {
    assert.equal(stripThinkBlocks(FINAL), FINAL);
    assert.equal(stripThinkBlocks("TapMango or text COFFEE."), "TapMango or text COFFEE.");
  });

  it("drops an unclosed <think> body", () => {
    assert.equal(stripThinkBlocks(`<think>\nstill reasoning`), "");
    assert.equal(stripThinkBlocks(`Hello\n<think>\nscratch`), "Hello");
  });

  it("removes leftover /no_think and stray tags", () => {
    assert.equal(stripThinkBlocks(`${FINAL} /no_think`), FINAL);
    assert.equal(stripThinkBlocks(`</think>\n${FINAL}`), FINAL);
    assert.equal(stripThinkBlocks(`<thinking>plan</thinking>\n${FINAL}`), FINAL);
  });
});

describe("visibleStreamText", () => {
  it("holds tokens inside an open <think> until it closes", () => {
    assert.equal(visibleStreamText("<think>\nNeed a short"), "");
    assert.equal(visibleStreamText(`<think>\nNeed a short\n</think>\n\n${FINAL}`), FINAL);
    assert.equal(visibleStreamText(`preamble\n</think>\n\n${FINAL}`), FINAL);
    assert.equal(visibleStreamText(FINAL), FINAL);
    assert.equal(visibleStreamText(`<think>x`, true), "");
  });
});

describe("thinkingOffExtras", () => {
  it("sends vLLM chat_template_kwargs on remote Ask", () => {
    const remote = thinkingOffExtras(true);
    assert.equal(remote.enable_thinking, false);
    assert.deepEqual(remote.chat_template_kwargs, { enable_thinking: false });
    assert.equal(thinkingOffExtras(false).think, false);
  });
});
