export const DEFAULT_MODEL = "qwen3:8b";

export function llmConfig() {
  const baseUrl = (process.env.HATCH_LLM_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  return {
    baseUrl,
    model: process.env.HATCH_LLM_MODEL || DEFAULT_MODEL,
    apiKey: process.env.HATCH_LLM_API_KEY || "",
  };
}

export function ollamaInstallHelp(model: string) {
  return [
    "Local model is not connected. This dry-run talks to Ollama on this machine — not OpenAI, Anthropic, or a Hatch cloud.",
    "",
    "On a Mac:",
    "  1. Install: https://ollama.com/download  (or `brew install ollama`)",
    "  2. In a terminal: ollama serve",
    `  3. ollama pull ${model}`,
    "  4. Restart Hatch OS: cd apps/hatch-os && npm run dev",
    "",
    `Expected: Ollama at ${llmConfig().baseUrl} with model ${model}.`,
    "Later: point HATCH_LLM_BASE_URL at the appliance vLLM OpenAI-compatible endpoint. Same Ask API.",
  ].join("\n");
}

export interface LlmProbe {
  connected: boolean;
  model: string;
  baseUrl: string;
  models: string[];
  error?: string;
}

export async function probeLlm(): Promise<LlmProbe> {
  const { baseUrl, model } = llmConfig();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return { connected: false, model, baseUrl, models: [], error: `Ollama HTTP ${res.status}` };
    }
    const json = (await res.json()) as { models?: { name?: string }[] };
    const models = (json.models || []).map((m) => m.name || "").filter(Boolean);
    const have = models.some(
      (n) => n === model || n.startsWith(`${model}`) || n.split(":")[0] === model.split(":")[0],
    );
    if (!have) {
      return {
        connected: false,
        model,
        baseUrl,
        models,
        error: `Ollama is up but ${model} is not pulled. Run: ollama pull ${model}`,
      };
    }
    return { connected: true, model, baseUrl, models };
  } catch {
    return {
      connected: false,
      model,
      baseUrl,
      models: [],
      error: `Cannot reach Ollama at ${baseUrl}`,
    };
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function streamLlm(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
): Promise<void> {
  const { baseUrl, model, apiKey } = llmConfig();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const openai = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.2,
      // Qwen3 thinking off — GM answers should be short and grounded.
      think: false,
    }),
  }).catch(() => null);

  if (openai?.ok && openai.body) {
    await readOpenAiStream(openai.body, onDelta);
    return;
  }

  const native = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      think: false,
      options: { temperature: 0.2 },
    }),
  }).catch(() => null);

  if (native?.ok && native.body) {
    await readOllamaStream(native.body, onDelta);
    return;
  }

  const status = native?.status || openai?.status || 0;
  throw new Error(status ? `LLM HTTP ${status}` : "LLM unreachable");
}

function stripThink(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "");
}

async function readOpenAiStream(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void) {
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
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        const clean = stripThink(raw).slice(emitted);
        if (clean) onDelta(clean);
        return;
      }
      try {
        const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          raw += delta;
          const clean = stripThink(raw);
          if (clean.length > emitted) {
            onDelta(clean.slice(emitted));
            emitted = clean.length;
          }
        }
      } catch {
        /* ignore keepalives */
      }
    }
  }
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
