/**
 * Hatch agent eval.
 *
 *   node --experimental-strip-types eval/agent/run.ts            # offline, all arms, mocked model
 *   node --experimental-strip-types eval/agent/run.ts --live     # live: harness arm on cases marked live
 *
 * Live mode talks to the firm's own RunPod endpoints only (never a third-party
 * API). It uses HATCH_LLM_* / HATCH_AGENT_LLM_* from the environment, or, with
 * --exchange <dir>, writes each model request to <dir>/<id>.req.json and reads
 * the reply from <dir>/<id>.res.json (so an operator can submit them with any
 * RunPod client). Re-run to continue; finished replies are reused, so you only
 * pay for each request once.
 *
 * Options: --live  --lane ask|agent  --cases id1,id2  --arms a,b  --exchange <dir>  --json <file>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CASES, type EvalCase } from "./cases.ts";
import { FIXTURE_MEMORY, FIXTURE_TODAY } from "./fixtures.ts";
import { deepRunNamed, deepTools, mainShallowTools, shallowRunNamed } from "./fixture-tools.ts";
import { mockModel } from "./mock-model.ts";
import { runMainPipeline, type ModelFn } from "./baseline-main.ts";
import { scoreCase, type CaseScore } from "./score.ts";
import { initHarness, runToCompletion, type ModelRequest, type Lane, type HarnessConfig } from "../../src/lib/harness/engine.ts";
import { parseRunpodChatOutput } from "../../src/lib/runpod-jobs.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const LIVE = flag("live");
const EXCHANGE = opt("exchange");
const LANE = (opt("lane") as Lane) || "ask";
const CONNECTED = ["google"];

class PendingError extends Error {}

function laneEndpoint(lane: Lane) {
  const ask = { base: process.env.HATCH_LLM_BASE_URL || "", model: process.env.HATCH_LLM_MODEL || "Qwen/Qwen3.8-27B-FP8", key: process.env.HATCH_LLM_API_KEY || "" };
  if (lane === "ask") return ask;
  return { base: process.env.HATCH_AGENT_LLM_BASE_URL || ask.base, model: process.env.HATCH_AGENT_LLM_MODEL || "NousResearch/Hermes-4.3-36B", key: process.env.HATCH_AGENT_LLM_API_KEY || ask.key };
}

export const ENDPOINT_IDS: Record<Lane, string> = { ask: "diqb3ykkxo0i16", agent: "gy5a9f9lpjz2y7" };

/** The RunPod worker input for one model request. Same shape submitRunpodChat uses. */
export function runpodInput(lane: Lane, messages: { role: string; content: string }[], opts: { maxTokens: number; tools?: { name: string; description: string; parameters: string[] }[] }) {
  const ep = laneEndpoint(lane);
  const tools = opts.tools?.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: { type: "object", properties: Object.fromEntries(t.parameters.map((p) => [p, { type: "string" }])), required: t.parameters } } }));
  return {
    openai_route: "/v1/chat/completions",
    openai_input: {
      model: ep.model,
      messages,
      temperature: 0.3,
      stream: false,
      max_tokens: opts.maxTokens,
      chat_template_kwargs: { enable_thinking: false },
      ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
    },
  };
}

async function liveCall(id: string, lane: Lane, messages: { role: string; content: string }[], maxTokens: number, tools?: { name: string; description: string; parameters: string[] }[]) {
  const input = runpodInput(lane, messages, { maxTokens, tools });
  if (EXCHANGE) {
    mkdirSync(EXCHANGE, { recursive: true });
    const req = path.join(EXCHANGE, `${id}.req.json`);
    const res = path.join(EXCHANGE, `${id}.res.json`);
    if (existsSync(res)) return parseRunpodChatOutput(JSON.parse(readFileSync(res, "utf8")).output ?? JSON.parse(readFileSync(res, "utf8")));
    writeFileSync(req, JSON.stringify({ endpointId: ENDPOINT_IDS[lane], input }, null, 2));
    throw new PendingError(`waiting for ${res}`);
  }
  const ep = laneEndpoint(lane);
  if (!ep.base || !ep.key) throw new Error("Set HATCH_LLM_BASE_URL/HATCH_LLM_API_KEY (and HATCH_AGENT_LLM_* for the agent lane) or use --exchange <dir>.");
  const root = ep.base.match(/^(https:\/\/[^/]+\/v2\/[^/]+)/)?.[1];
  if (!root || !/runpod\.ai/.test(root)) throw new Error("Live eval only talks to the firm's RunPod endpoints.");
  const res = await fetch(`${root}/runsync`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ep.key}` }, body: JSON.stringify({ input }) });
  const json = (await res.json()) as { status?: string; output?: unknown; id?: string };
  if (json.status !== "COMPLETED") throw new Error(`RunPod job ${json.id || ""} status ${json.status}`);
  return parseRunpodChatOutput(json.output);
}

function mockFor(request: { messages: { role: string; content: string }[]; nativeTools?: unknown[]; purpose?: string }, protocol: "text" | "native" | "none") {
  return mockModel({ messages: request.messages as never, toolsAvailable: protocol !== "none", protocol });
}

type Arm = "main-shallow" | "main-deep" | "harness-shallow" | "harness-deep";

async function runArm(arm: Arm, c: EvalCase, live: boolean): Promise<{ text: string; usedTools: boolean; modelCalls: number; activity?: string[] }> {
  if (arm.startsWith("main")) {
    let n = 0;
    const model: ModelFn = async (input) => {
      n++;
      if (!live) return mockModel(input);
      const specs = [
        { name: "email_search", description: "Search the connected mailbox. Does not send anything.", parameters: ["query"] },
        { name: "email_read", description: "Read matching mailbox headers. Does not send anything.", parameters: ["query"] },
        { name: "cloud_files_search", description: "Search Drive or OneDrive by name.", parameters: ["query"] },
        { name: "calendar_list", description: "List upcoming calendar events.", parameters: ["query"] },
      ];
      return liveCall(`${arm}-${c.id}-${n}`, "agent", input.messages, 1024, specs);
    };
    const r = await runMainPipeline(c.query, c.history, model, arm === "main-deep");
    return { text: r.text, usedTools: r.usedTools, modelCalls: n };
  }
  const deep = arm === "harness-deep";
  const config: Partial<HarnessConfig> = { toolLane: LANE };
  const state = initHarness({ query: c.query, history: c.history, connected: CONNECTED, memory: FIXTURE_MEMORY, today: `Wednesday, ${FIXTURE_TODAY}`, todayIso: FIXTURE_TODAY, config });
  let n = 0;
  const result = await runToCompletion(state, {
    tools: deep ? deepTools : mainShallowTools,
    runNamed: deep ? deepRunNamed : shallowRunNamed,
    remember: async () => undefined,
    model: async (request: ModelRequest) => {
      n++;
      const protocol = request.nativeTools ? "native" : /<tool_call>\{"name"/.test(request.messages[0].content) ? "text" : "none";
      if (!live) return mockFor(request, protocol);
      return liveCall(`${arm}-${LANE}-${c.id}-${n}`, request.lane, request.messages, request.maxTokens, request.nativeTools);
    },
  });
  return { text: result.text, usedTools: result.state.usedTools, modelCalls: n, activity: result.state.activity.events.map((e) => `${e.status === "failed" ? "✗" : "✓"} ${e.label}`) };
}

async function main() {
  const only = opt("cases")?.split(",");
  const cases = CASES.filter((c) => (only ? only.includes(c.id) : LIVE ? c.live : true));
  const arms = (opt("arms")?.split(",") as Arm[]) || (LIVE ? (["harness-deep"] as Arm[]) : (["main-shallow", "main-deep", "harness-shallow", "harness-deep"] as Arm[]));
  const results: Record<string, { score: CaseScore; text: string; modelCalls: number; activity?: string[] }[]> = {};
  let pending = 0;
  for (const arm of arms) {
    results[arm] = [];
    for (const c of cases) {
      try {
        const r = await runArm(arm, c, LIVE);
        results[arm].push({ score: scoreCase(c, r.text, r.usedTools), text: r.text, modelCalls: r.modelCalls, activity: r.activity });
      } catch (err) {
        if (err instanceof PendingError) {
          pending++;
          continue;
        }
        throw err;
      }
    }
  }
  const avg = (rows: { score: CaseScore }[]) => (rows.length ? Math.round((rows.reduce((a, r) => a + r.score.total, 0) / rows.length) * 10) / 10 : 0);
  console.log(`\nHatch agent eval — ${LIVE ? `LIVE (${LANE} lane)` : "offline, mocked model"} — ${cases.length} cases\n`);
  const header = ["case", ...arms].map((h) => h.padEnd(16)).join("");
  console.log(header);
  for (const c of cases) {
    console.log([c.id, ...arms.map((a) => String(results[a].find((r) => r.score.id === c.id)?.score.total ?? "…"))].map((v) => v.padEnd(16)).join(""));
  }
  console.log(["AVERAGE", ...arms.map((a) => String(avg(results[a])))].map((v) => v.padEnd(16)).join(""));
  if (pending) console.log(`\n${pending} case(s) waiting on model replies in ${EXCHANGE}. Submit the .req.json files and re-run.`);
  const out = opt("json");
  if (out) writeFileSync(out, JSON.stringify({ live: LIVE, lane: LANE, at: new Date().toISOString(), results }, null, 2));
  if (flag("verbose")) {
    for (const arm of arms) for (const r of results[arm]) console.log(`\n--- ${arm} / ${r.score.id} (${r.score.total}) ${r.score.notes.join("; ")}\n${r.activity ? r.activity.join("\n") + "\n" : ""}${r.text}`);
  }
}

await main();
