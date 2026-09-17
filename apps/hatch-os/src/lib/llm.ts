import type { ToolCall } from "./tool-parse";
import type { OpenAiTool } from "./tools";

/** 16 GB Mac / local Ollama fallback. */
export const DEFAULT_MODEL = "qwen3:8b";
/** RunPod Serverless Qwen3.8-27B (OpenAI chat.completions). */
/** RunPod A100 FP8 worker — lowercase qwen/qwen3.8-27b 500s on this endpoint. */
export const RUNPOD_MODEL = "Qwen/Qwen3.8-27B-FP8";
export const RUNPOD_ENDPOINT_ID = "diqb3ykkxo0i16";
/** Hermes 4.3 36B — agent / tool loop. Paste the RunPod endpoint id in .env.local. */
export const HERMES_MODEL = "NousResearch/Hermes-4.3-36B";
export const HERMES_ENDPOINT_PLACEHOLDER = "<HERMES_ENDPOINT>";
/** Appliance / Spark target name. */
export const PREFERRED_MODEL = "qwen3.8";
export const LOCAL_OLLAMA = "http://127.0.0.1:11434";
export const REMOTE_CHAT_TIMEOUT_MS = 180_000;

export type LlmLane = "ask" | "agent";

export function isRunpodUrl(raw: string) {
  return /runpod\.ai/i.test(raw);
}

export type LlmKind = "remote" | "ollama";

export interface LlmEndpoint {
  kind: LlmKind;
  rawBase: string;
  openaiRoot: string;
  nativeRoot: string;
  model: string;
  apiKey: string;
  host: string;
  provider: string;
  label: string;
  lane: LlmLane;
  keyEnv: string;
  dedicated: boolean;
}

function stripSlash(url: string) {
  return url.replace(/\/$/, "");
}

function asUrl(raw: string) {
  return raw.includes("://") ? raw : `http://${raw}`;
}

export function isLocalLlmUrl(raw: string) {
  try {
    const host = new URL(asUrl(raw)).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

export function endpointHost(raw: string) {
  try {
    return new URL(asUrl(raw)).host;
  } catch {
    return raw;
  }
}

function isOllamaEndpoint(base: string) {
  try {
    const u = new URL(asUrl(base));
    const local = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1";
    if (!local) return false;
    return u.port === "11434" || u.port === "";
  } catch {
    return false;
  }
}

function needsApiKey(base: string) {
  return asUrl(base).startsWith("https://");
}

function endpointLabel(base: string, model: string, ollama: boolean) {
  if (isRunpodUrl(base) && /hermes/i.test(model)) return "RunPod / Hermes";
  if (isRunpodUrl(base)) return "RunPod / Qwen3.8";
  if (ollama) return "Ollama (local)";
  return "OpenAI-compatible";
}

function buildEndpoint(
  raw: string,
  model: string,
  apiKey: string,
  provider: string,
  lane: LlmLane,
  keyEnv: string,
  dedicated = false,
): LlmEndpoint {
  const base = stripSlash(raw || LOCAL_OLLAMA);
  const ollama = isOllamaEndpoint(base);
  const openaiRoot = base.endsWith("/v1") ? base : `${base}/v1`;
  const nativeRoot = base.replace(/\/v1$/, "");
  return {
    kind: ollama ? "ollama" : "remote",
    rawBase: base,
    openaiRoot,
    nativeRoot,
    model,
    apiKey: apiKey.trim(),
    host: endpointHost(base),
    provider,
    label: endpointLabel(base, model, ollama),
    lane,
    keyEnv,
    dedicated,
  };
}

function askDefaults(raw: string) {
  const ollama = isOllamaEndpoint(raw);
  return {
    raw,
    provider: process.env.HATCH_LLM_PROVIDER || "openai-compatible",
    apiKey: process.env.HATCH_LLM_API_KEY || "",
    model:
      process.env.HATCH_LLM_MODEL ||
      (isRunpodUrl(raw) ? RUNPOD_MODEL : ollama ? DEFAULT_MODEL : PREFERRED_MODEL),
  };
}

export function agentLlmDedicated() {
  return Boolean(process.env.HATCH_AGENT_LLM_BASE_URL || process.env.HATCH_AGENT_LLM_MODEL);
}

export function llmConfig() {
  const raw = stripSlash(process.env.HATCH_LLM_BASE_URL || LOCAL_OLLAMA);
  const ask = askDefaults(raw);
  const primary = buildEndpoint(ask.raw, ask.model, ask.apiKey, ask.provider, "ask", "HATCH_LLM_API_KEY");
  const fallback =
    primary.kind === "remote"
      ? buildEndpoint(LOCAL_OLLAMA, DEFAULT_MODEL, "", "openai-compatible", "ask", "HATCH_LLM_API_KEY")
      : null;
  return { primary, fallback, provider: ask.provider };
}

export function agentLlmConfig() {
  const ask = llmConfig();
  const dedicated = agentLlmDedicated();
  const raw = stripSlash(process.env.HATCH_AGENT_LLM_BASE_URL || ask.primary.rawBase);
  const provider =
    process.env.HATCH_AGENT_LLM_PROVIDER || ask.provider || "openai-compatible";
  const apiKey = process.env.HATCH_AGENT_LLM_API_KEY || ask.primary.apiKey;
  const model =
    process.env.HATCH_AGENT_LLM_MODEL ||
    (process.env.HATCH_AGENT_LLM_BASE_URL ? HERMES_MODEL : ask.primary.model);
  const keyEnv = process.env.HATCH_AGENT_LLM_API_KEY
    ? "HATCH_AGENT_LLM_API_KEY"
    : dedicated
      ? "HATCH_AGENT_LLM_API_KEY (or HATCH_LLM_API_KEY)"
      : "HATCH_LLM_API_KEY";
  const primary = buildEndpoint(raw, model, apiKey, provider, "agent", keyEnv, dedicated);
  const fallback =
    primary.kind === "remote"
      ? buildEndpoint(LOCAL_OLLAMA, DEFAULT_MODEL, "", "openai-compatible", "agent", keyEnv)
      : null;
  return { primary, fallback, provider, dedicated, usingAskFallback: !dedicated };
}

export function connectHelp(probe: LlmProbe) {
  const { primary } = llmConfig();
  const agent = agentLlmConfig();
  const lines = [
    "No model is ready. This dry-run does not call a named public lab and will not invent an answer.",
    "",
    "Ask — RunPod Serverless Qwen3.8-27B:",
    `  HATCH_LLM_BASE_URL=https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/openai/v1`,
    `  HATCH_LLM_MODEL=${RUNPOD_MODEL}`,
    "  HATCH_LLM_API_KEY=<RunPod API key>",
    "  HATCH_LLM_PROVIDER=openai-compatible",
    "",
    "Agent / tools — RunPod Hermes 4.3 36B (paste the endpoint id):",
    `  HATCH_AGENT_LLM_BASE_URL=https://api.runpod.ai/v2/${HERMES_ENDPOINT_PLACEHOLDER}/openai/v1`,
    `  HATCH_AGENT_LLM_MODEL=${HERMES_MODEL}`,
    "  HATCH_AGENT_LLM_API_KEY=<same RunPod key or dedicated>",
    "  HATCH_AGENT_LLM_PROVIDER=openai-compatible",
    "",
    "Local fallback (16 GB Mac / Ollama):",
    "  1. ollama serve",
    `  2. ollama pull ${DEFAULT_MODEL}`,
    "  3. HATCH_LLM_BASE_URL=http://127.0.0.1:11434",
    `  4. HATCH_LLM_MODEL=${DEFAULT_MODEL}`,
    "",
    `Ask now: ${primary.kind} · ${primary.host} · model ${primary.model}.`,
    agent.dedicated
      ? `Agent now: ${agent.primary.kind} · ${agent.primary.host} · model ${agent.primary.model}.`
      : "Agent now: using Ask (HATCH_AGENT_LLM_* unset).",
    probe.error ? `Last error: ${probe.error}` : "",
    "Later: same env on the appliance vLLM endpoint. Do not paste the API key into chat.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** @deprecated use connectHelp */
export function ollamaInstallHelp(model: string) {
  return connectHelp({
    connected: false,
    reachable: false,
    modelPulled: false,
    model,
    preferredModel: PREFERRED_MODEL,
    baseUrl: llmConfig().primary.rawBase,
    host: llmConfig().primary.host,
    kind: llmConfig().primary.kind,
    provider: llmConfig().provider,
    hasKey: Boolean(llmConfig().primary.apiKey),
    fallback: false,
    label: llmConfig().primary.label,
    lane: "ask",
    models: [],
  });
}

export interface LlmProbe {
  connected: boolean;
  reachable: boolean;
  modelPulled: boolean;
  model: string;
  preferredModel: string;
  baseUrl: string;
  host: string;
  kind: LlmKind;
  provider: string;
  hasKey: boolean;
  fallback: boolean;
  label?: string;
  lane?: LlmLane;
  dedicated?: boolean;
  usingAskFallback?: boolean;
  models: string[];
  error?: string;
}

function headersFor(endpoint: LlmEndpoint) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (endpoint.kind === "remote" || endpoint.apiKey) {
    if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`;
  }
  return headers;
}

function modelListed(models: string[], model: string) {
  if (!models.length) return true;
  return models.some((n) => n === model || n.startsWith(`${model}:`) || n.split(":")[0] === model);
}

async function probeRemote(endpoint: LlmEndpoint): Promise<LlmProbe> {
  const base = {
    model: endpoint.model,
    preferredModel: PREFERRED_MODEL,
    baseUrl: endpoint.rawBase,
    host: endpoint.host,
    kind: endpoint.kind,
    provider: endpoint.provider,
    hasKey: Boolean(endpoint.apiKey),
    fallback: false,
    label: endpoint.label,
    lane: endpoint.lane,
    dedicated: endpoint.dedicated,
    models: [] as string[],
  };
  if (needsApiKey(endpoint.rawBase) && !endpoint.apiKey) {
    return {
      ...base,
      connected: false,
      reachable: false,
      modelPulled: false,
      error: `${endpoint.keyEnv} is required for ${endpoint.host}`,
    };
  }
  try {
    const res = await fetch(`${endpoint.openaiRoot}/models`, {
      cache: "no-store",
      headers: headersFor(endpoint),
      signal: AbortSignal.timeout(isRunpodUrl(endpoint.rawBase) ? 20_000 : 8_000),
    });
    const reachable = res.status !== 0;
    if (res.status === 401 || res.status === 403) {
      return {
        ...base,
        connected: false,
        reachable: true,
        modelPulled: false,
        error: `Endpoint ${endpoint.host} reachable — auth failed (HTTP ${res.status})`,
      };
    }
    if (!res.ok && res.status !== 404) {
      return {
        ...base,
        connected: false,
        reachable,
        modelPulled: false,
        error: `Endpoint ${endpoint.host} HTTP ${res.status}`,
      };
    }
    let models: string[] = [];
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as
        | { data?: { id?: string }[]; models?: { name?: string; id?: string }[] }
        | null;
      models = [
        ...(json?.data || []).map((m) => m.id || ""),
        ...(json?.models || []).map((m) => m.name || m.id || ""),
      ].filter(Boolean);
    }
    const modelPulled = modelListed(models, endpoint.model);
    return {
      ...base,
      models,
      connected: true,
      reachable: true,
      modelPulled,
    };
  } catch {
    /* RunPod cold start can stall /models. Key + host is enough to try Ask. */
    if (isRunpodUrl(endpoint.rawBase) && endpoint.apiKey) {
      return {
        ...base,
        connected: true,
        reachable: true,
        modelPulled: true,
        error: `RunPod /models timed out — ${endpoint.lane === "agent" ? "Agent" : "Ask"} will still try chat.completions (cold start up to 3 min).`,
      };
    }
    return {
      ...base,
      connected: false,
      reachable: false,
      modelPulled: false,
      error: `Cannot reach ${endpoint.host}`,
    };
  }
}

async function probeOllama(endpoint: LlmEndpoint, fallback = false): Promise<LlmProbe> {
  const base = {
    model: endpoint.model,
    preferredModel: PREFERRED_MODEL,
    baseUrl: endpoint.rawBase,
    host: endpoint.host,
    kind: endpoint.kind,
    provider: endpoint.provider,
    hasKey: Boolean(endpoint.apiKey),
    fallback,
    label: endpoint.label,
    lane: endpoint.lane,
    dedicated: endpoint.dedicated,
    models: [] as string[],
  };
  try {
    const res = await fetch(`${endpoint.nativeRoot}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return {
        ...base,
        connected: false,
        reachable: false,
        modelPulled: false,
        error: `Ollama HTTP ${res.status} at ${endpoint.host}`,
      };
    }
    const json = (await res.json()) as { models?: { name?: string }[] };
    const models = (json.models || []).map((m) => m.name || "").filter(Boolean);
    const modelPulled = models.some((n) => {
      const tag = n.split(":")[0];
      return n === endpoint.model || tag === endpoint.model || n.startsWith(`${endpoint.model}:`);
    });
    if (!modelPulled) {
      return {
        ...base,
        models,
        connected: false,
        reachable: true,
        modelPulled: false,
        error: `Ollama at ${endpoint.host} is reachable but ${endpoint.model} is not pulled. Run: ollama pull ${endpoint.model}`,
      };
    }
    return { ...base, models, connected: true, reachable: true, modelPulled: true };
  } catch {
    return {
      ...base,
      connected: false,
      reachable: false,
      modelPulled: false,
      error: `Cannot reach Ollama at ${endpoint.host}`,
    };
  }
}

async function probeEndpoint(endpoint: LlmEndpoint, fallback = false): Promise<LlmProbe> {
  return endpoint.kind === "remote" ? probeRemote(endpoint) : probeOllama(endpoint, fallback);
}

const resolved: Record<LlmLane, LlmEndpoint | null> = { ask: null, agent: null };

async function probeLane(lane: LlmLane): Promise<LlmProbe> {
  const cfg = lane === "agent" ? agentLlmConfig() : llmConfig();
  const first = await probeEndpoint(cfg.primary);
  const tagged = {
    ...first,
    lane,
    dedicated: lane === "agent" ? agentLlmDedicated() : true,
    usingAskFallback: lane === "agent" ? !agentLlmDedicated() : false,
  };
  if (first.connected) {
    resolved[lane] = cfg.primary;
    return tagged;
  }
  /* RunPod with a key: do not steal Ask onto Ollama just because /models is slow. */
  if (isRunpodUrl(cfg.primary.rawBase) && cfg.primary.apiKey) {
    resolved[lane] = cfg.primary;
    return { ...tagged, connected: true, reachable: first.reachable || true, label: cfg.primary.label };
  }
  if (cfg.fallback) {
    const second = await probeEndpoint(cfg.fallback, true);
    if (second.connected) {
      resolved[lane] = cfg.fallback;
      return {
        ...second,
        fallback: true,
        lane,
        dedicated: tagged.dedicated,
        usingAskFallback: tagged.usingAskFallback,
        error: first.error
          ? `${first.error} — using local Ollama fallback ${cfg.fallback.host} / ${cfg.fallback.model}`
          : `Using local Ollama fallback ${cfg.fallback.host} / ${cfg.fallback.model}`,
      };
    }
    resolved[lane] = null;
    return {
      ...tagged,
      error: [first.error, second.error].filter(Boolean).join(" · "),
    };
  }
  resolved[lane] = null;
  return tagged;
}

export async function probeLlm(): Promise<LlmProbe> {
  return probeLane("ask");
}

export async function probeAgentLlm(): Promise<LlmProbe> {
  return probeLane("agent");
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface StreamLlmResult {
  toolCalls: ToolCall[];
}

async function streamLane(
  lane: LlmLane,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  tools?: OpenAiTool[],
): Promise<StreamLlmResult> {
  const cfg = lane === "agent" ? agentLlmConfig() : llmConfig();
  const cached = resolved[lane];
  const order =
    isRunpodUrl(cfg.primary.rawBase) && cfg.primary.apiKey
      ? cfg.fallback
        ? [cfg.primary, cfg.fallback]
        : [cfg.primary]
      : cached
        ? [cached]
        : cfg.fallback
          ? [cfg.primary, cfg.fallback]
          : [cfg.primary];

  let last = "LLM unreachable";
  for (const endpoint of order) {
    if (needsApiKey(endpoint.rawBase) && !endpoint.apiKey) {
      last = `${endpoint.keyEnv} is required for ${endpoint.host}`;
      continue;
    }
    try {
      return await streamEndpoint(endpoint, messages, onDelta, tools);
    } catch (err) {
      last = err instanceof Error ? err.message : "LLM failed";
    }
  }
  throw new Error(last);
}

export async function streamLlm(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
): Promise<void> {
  await streamLane("ask", messages, onDelta);
}

export async function streamAgentLlm(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  tools?: OpenAiTool[],
): Promise<StreamLlmResult> {
  return streamLane("agent", messages, onDelta, tools);
}

async function streamEndpoint(
  endpoint: LlmEndpoint,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  tools?: OpenAiTool[],
): Promise<StreamLlmResult> {
  const headers = headersFor(endpoint);
  const remote = endpoint.kind === "remote";
  const openai = await fetch(`${endpoint.openaiRoot}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: endpoint.model,
      messages,
      stream: true,
      temperature: 0.2,
      ...(remote ? { max_tokens: 1024 } : { think: false }),
      ...(remote && tools?.length ? { tools, tool_choice: "auto" } : {}),
    }),
    signal: remote ? AbortSignal.timeout(REMOTE_CHAT_TIMEOUT_MS) : undefined,
  }).catch((err) => {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(`Remote ${endpoint.host} timed out after ${REMOTE_CHAT_TIMEOUT_MS / 1000}s (cold start).`);
    }
    return null;
  });

  if (openai?.ok && openai.body) {
    const toolCalls = await readOpenAiStream(openai.body, onDelta);
    return { toolCalls };
  }

  if (endpoint.kind === "ollama") {
    const native = await fetch(`${endpoint.nativeRoot}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: endpoint.model,
        messages,
        stream: true,
        think: false,
        options: { temperature: 0.2 },
      }),
    }).catch(() => null);
    if (native?.ok && native.body) {
      await readOllamaStream(native.body, onDelta);
      return { toolCalls: [] };
    }
    const status = native?.status || openai?.status || 0;
    throw new Error(status ? `Ollama HTTP ${status} at ${endpoint.host}` : `Ollama unreachable at ${endpoint.host}`);
  }

  const status = openai?.status || 0;
  let detail = status ? `HTTP ${status}` : "unreachable";
  if (openai && !openai.ok) {
    const body = await openai.text().catch(() => "");
    if (body) detail = `${detail} ${body.slice(0, 180)}`;
  }
  throw new Error(`Remote ${endpoint.host} ${detail}`);
}

function stripThink(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "");
}

function parseArgsObject(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function readOpenAiStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<ToolCall[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let emitted = 0;
  const acc: { id?: string; name?: string; arguments?: string }[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        const clean = stripThink(raw).slice(emitted);
        if (clean) onDelta(clean);
        return acc
          .filter((a) => a.name)
          .map((a) => ({ name: a.name as string, arguments: parseArgsObject(a.arguments) }));
      }
      try {
        const json = JSON.parse(data) as {
          choices?: {
            delta?: {
              content?: string;
              tool_calls?: {
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }[];
            };
          }[];
        };
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) {
          raw += delta.content;
          const clean = stripThink(raw);
          if (clean.length > emitted) {
            onDelta(clean.slice(emitted));
            emitted = clean.length;
          }
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === "number" ? tc.index : acc.length;
            if (!acc[idx]) acc[idx] = { arguments: "" };
            if (tc.id) acc[idx].id = tc.id;
            if (tc.function?.name) acc[idx].name = `${acc[idx].name || ""}${tc.function.name}`;
            if (tc.function?.arguments) {
              acc[idx].arguments = `${acc[idx].arguments || ""}${tc.function.arguments}`;
            }
          }
        }
      } catch {
        /* ignore keepalives */
      }
    }
  }
  return acc
    .filter((a) => a.name)
    .map((a) => ({ name: a.name as string, arguments: parseArgsObject(a.arguments) }));
}

async function readOllamaStream(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let emitted = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        if (json.message?.content) {
          raw += json.message.content;
          const clean = stripThink(raw);
          if (clean.length > emitted) {
            onDelta(clean.slice(emitted));
            emitted = clean.length;
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
}
