import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksAgenticQuery, wantsAgentTurn } from "./agent-intent.ts";

describe("looksAgenticQuery", () => {
  it("routes draft / write / list-files to the agent lane", () => {
    assert.equal(looksAgenticQuery("Draft a note for Little Elm about catering."), true);
    assert.equal(looksAgenticQuery("List files in HQ Ops."), true);
    assert.equal(looksAgenticQuery("Please write_draft for prosper"), true);
    assert.equal(looksAgenticQuery("handoff this to HQ Ops"), true);
  });

  it("keeps plain Ask questions on Qwen", () => {
    assert.equal(looksAgenticQuery("How does loyalty work — TapMango or text COFFEE?"), false);
    assert.equal(looksAgenticQuery("Who is the GM at Little Elm?"), false);
    assert.equal(looksAgenticQuery("What is the catering protocol?"), false);
  });
});

describe("wantsAgentTurn", () => {
  it("honors an explicit agent flag over the heuristic", () => {
    assert.equal(wantsAgentTurn("How does loyalty work?", true), true);
    assert.equal(wantsAgentTurn("Draft a note for Little Elm.", false), false);
    assert.equal(wantsAgentTurn("Draft a note for Little Elm."), true);
  });
});
