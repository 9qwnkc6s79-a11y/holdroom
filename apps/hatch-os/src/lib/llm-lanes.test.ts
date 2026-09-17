import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { agentLlmConfig, agentLlmDedicated, HERMES_MODEL, llmConfig, RUNPOD_MODEL } from "./llm.ts";
import { parseToolCalls, stripToolMarkup } from "./tool-parse.ts";

const SNAP = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in SNAP)) delete process.env[key];
  }
  Object.assign(process.env, SNAP);
});

describe("agentLlmConfig fallback", () => {
  it("uses HATCH_LLM_* when agent vars are missing", () => {
    process.env.HATCH_LLM_BASE_URL = "https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1";
    process.env.HATCH_LLM_MODEL = RUNPOD_MODEL;
    process.env.HATCH_LLM_API_KEY = "ask-key";
    delete process.env.HATCH_AGENT_LLM_BASE_URL;
    delete process.env.HATCH_AGENT_LLM_MODEL;
    delete process.env.HATCH_AGENT_LLM_API_KEY;

    const ask = llmConfig();
    const agent = agentLlmConfig();
    assert.equal(agentLlmDedicated(), false);
    assert.equal(agent.usingAskFallback, true);
    assert.equal(agent.primary.model, ask.primary.model);
    assert.equal(agent.primary.rawBase, ask.primary.rawBase);
    assert.equal(agent.primary.apiKey, "ask-key");
    assert.equal(agent.primary.lane, "agent");
    assert.equal(ask.primary.lane, "ask");
  });

  it("uses Hermes when HATCH_AGENT_LLM_* is set", () => {
    process.env.HATCH_LLM_BASE_URL = "https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1";
    process.env.HATCH_LLM_MODEL = RUNPOD_MODEL;
    process.env.HATCH_LLM_API_KEY = "ask-key";
    process.env.HATCH_AGENT_LLM_BASE_URL = "https://api.runpod.ai/v2/hermes-id/openai/v1";
    process.env.HATCH_AGENT_LLM_MODEL = HERMES_MODEL;
    process.env.HATCH_AGENT_LLM_API_KEY = "agent-key";

    const ask = llmConfig();
    const agent = agentLlmConfig();
    assert.equal(agent.dedicated, true);
    assert.equal(agent.usingAskFallback, false);
    assert.equal(agent.primary.model, HERMES_MODEL);
    assert.equal(ask.primary.model, RUNPOD_MODEL);
    assert.equal(agent.primary.apiKey, "agent-key");
    assert.equal(agent.primary.label, "RunPod / Hermes");
    assert.equal(ask.primary.label, "RunPod / Qwen3.8");
    assert.match(agent.primary.rawBase, /hermes-id/);
  });
});

describe("Hermes tool markup", () => {
  it("parses <tool_call> and TOOL trailers", () => {
    const hermes = parseToolCalls(
      `Working.\n<tool_call>\n{"name":"write_draft","arguments":{"departmentId":"little-elm","filename":"notes.md","text":"hi"}}\n</tool_call>`,
    );
    assert.equal(hermes[0]?.name, "write_draft");
    assert.equal(hermes[0]?.arguments.filename, "notes.md");

    const trailer = parseToolCalls(
      `Done.\nTOOL {"name":"handoff_to_department","arguments":{"toDepartmentId":"hq-ops","summary":"x","facts":"y"}}`,
    );
    assert.equal(trailer[0]?.name, "handoff_to_department");
    assert.equal(stripToolMarkup(`${hermes[0] ? "Working." : ""}\n<tool_call>{"name":"x"}</tool_call>`).includes("tool_call"), false);
  });
});
