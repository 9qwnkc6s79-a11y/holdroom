import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  agentLlmConfig,
  agentLlmDedicated,
  connectHelp,
  endpointsToTry,
  HERMES_ENDPOINT_ID,
  HERMES_MODEL,
  hermesEndpointId,
  llmConfig,
  probeLlm,
  resetLlmLaneCache,
  RUNPOD_MODEL,
  streamAgentLlm,
  streamLlm,
} from "./llm.ts";
import { parseToolCalls, stripToolMarkup } from "./tool-parse.ts";

const SNAP = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in SNAP)) delete process.env[key];
  }
  Object.assign(process.env, SNAP);
  resetLlmLaneCache();
});

function runpodAskEnv() {
  process.env.HATCH_LLM_BASE_URL = "https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1";
  process.env.HATCH_LLM_MODEL = RUNPOD_MODEL;
  process.env.HATCH_LLM_API_KEY = "ask-key";
  process.env.HATCH_LLM_PROVIDER = "openai-compatible";
  delete process.env.HATCH_LLM_ALLOW_OLLAMA_FALLBACK;
}

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

describe("Ollama fallback is opt-in", () => {
  it("does not attach Ollama when RunPod Ask / Hermes are set", () => {
    runpodAskEnv();
    process.env.HATCH_AGENT_LLM_BASE_URL = `https://api.runpod.ai/v2/${HERMES_ENDPOINT_ID}/openai/v1`;
    process.env.HATCH_AGENT_LLM_MODEL = HERMES_MODEL;
    process.env.HATCH_AGENT_LLM_API_KEY = "agent-key";

    const ask = llmConfig();
    const agent = agentLlmConfig();
    assert.equal(ask.fallback, null);
    assert.equal(agent.fallback, null);
    assert.deepEqual(endpointsToTry(ask), [ask.primary]);
    assert.deepEqual(endpointsToTry(agent), [agent.primary]);
    assert.equal(ask.primary.host.includes("11434"), false);
    assert.equal(agent.primary.host.includes("11434"), false);
  });

  it("attaches Ollama only when HATCH_LLM_ALLOW_OLLAMA_FALLBACK=1", () => {
    runpodAskEnv();
    process.env.HATCH_LLM_ALLOW_OLLAMA_FALLBACK = "1";
    const ask = llmConfig();
    assert.ok(ask.fallback);
    assert.equal(ask.fallback?.kind, "ollama");
    assert.equal(ask.fallback?.host, "127.0.0.1:11434");
    const order = endpointsToTry(ask);
    assert.equal(order.length, 2);
    assert.equal(order[1]?.kind, "ollama");
  });

  it("does not mention Ollama 404 when a keyed remote chat.completions fails", async () => {
    runpodAskEnv();
    const orig = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("11434") || url.includes("ollama")) {
        return new Response("missing model", { status: 404, statusText: "Not Found" });
      }
      if (url.includes("/chat/completions")) {
        return new Response("worker cold", { status: 503 });
      }
      return new Response("nope", { status: 500 });
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => streamLlm([{ role: "user", content: "How does loyalty work?" }], () => {}),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(/Ollama HTTP 404/i.test(err.message), false);
          assert.equal(err.message.includes("127.0.0.1:11434"), false);
          assert.match(err.message, /Remote/);
          return true;
        },
      );
      assert.equal(seen.some((u) => u.includes("11434")), false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("agent lane also stays on Hermes and skips Ollama 404", async () => {
    runpodAskEnv();
    process.env.HATCH_AGENT_LLM_BASE_URL = `https://api.runpod.ai/v2/${HERMES_ENDPOINT_ID}/openai/v1`;
    process.env.HATCH_AGENT_LLM_MODEL = HERMES_MODEL;
    process.env.HATCH_AGENT_LLM_API_KEY = "agent-key";
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("11434")) return new Response("missing", { status: 404 });
      if (url.includes("/chat/completions")) return new Response("busy", { status: 502 });
      throw new Error("models timeout");
    }) as typeof fetch;
    try {
      const probe = await probeLlm();
      assert.equal((probe.error || "").includes("Ollama HTTP 404"), false);
      await assert.rejects(
        () => streamAgentLlm([{ role: "user", content: "Draft a note." }], () => {}),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(/Ollama HTTP 404/i.test(err.message), false);
          assert.match(err.message, /Remote/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("hermesEndpointId / connectHelp", () => {
  it("uses the dogfood Hermes id and honors env", () => {
    delete process.env.HATCH_AGENT_LLM_BASE_URL;
    assert.equal(hermesEndpointId(), HERMES_ENDPOINT_ID);
    assert.equal(hermesEndpointId("https://api.runpod.ai/v2/custom-hermes/openai/v1"), "custom-hermes");
    const help = connectHelp({
      connected: false,
      reachable: false,
      modelPulled: false,
      model: RUNPOD_MODEL,
      preferredModel: RUNPOD_MODEL,
      baseUrl: "https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1",
      host: "api.runpod.ai",
      kind: "remote",
      provider: "openai-compatible",
      hasKey: true,
      fallback: false,
      models: [],
      error: "Remote api.runpod.ai HTTP 503",
    });
    assert.match(help, new RegExp(HERMES_ENDPOINT_ID));
    assert.equal(help.includes("<HERMES_ENDPOINT>"), false);
    assert.equal(help.includes("Ollama HTTP 404"), false);
    assert.match(help, /Last error: Remote api\.runpod\.ai HTTP 503/);
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
