import type { LlmEndpoint } from "./llm.ts";
import type { OpenAiTool } from "./tools.ts";
import { parseToolCalls, stripToolMarkup, type ToolCall } from "./tool-parse.ts";
import { stripThinkBlocks } from "./think.ts";

export interface RunpodChatBody {
  model: string;
  messages: { role: string; content: string }[];
  tools?: OpenAiTool[];
  extras?: Record<string, unknown>;
}

export function runpodEndpointId(rawBase: string): string | null {
  const match = String(rawBase || "").match(/\/v2\/([^/]+)/);
  return match?.[1] || null;
}

export function runpodApiRoot(rawBase: string): string | null {
  const id = runpodEndpointId(rawBase);
  if (!id) return null;
  try {
    const origin = new URL(rawBase.includes("://") ? rawBase : `https://${rawBase}`).origin;
    return `${origin}/v2/${id}`;
  } catch {
    return null;
  }
}

export async function submitRunpodChat(endpoint: LlmEndpoint, body: RunpodChatBody): Promise<string> {
  const root = runpodApiRoot(endpoint.rawBase);
  if (!root) throw new Error(`Cannot find a RunPod endpoint id in ${endpoint.host}`);
  const res = await fetch(`${root}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      input: {
        openai_route: "/v1/chat/completions",
        openai_input: {
          model: body.model,
          messages: body.messages,
          temperature: 0.2,
          stream: false,
          ...(body.extras || {}),
          ...(body.tools?.length ? { tools: body.tools, tool_choice: "auto" } : {}),
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
  if (!res.ok || !json?.id) {
    const detail = json?.error || `HTTP ${res.status}`;
    throw new Error(`RunPod did not accept the job (${detail}).`);
  }
  return json.id;
}

export interface RunpodJobView {
  status: string;
  done: boolean;
  failed: boolean;
  text: string;
  toolCalls: ToolCall[];
  error?: string;
}

export async function readRunpodJob(endpoint: LlmEndpoint, jobId: string): Promise<RunpodJobView> {
  const root = runpodApiRoot(endpoint.rawBase);
  if (!root) throw new Error("RunPod endpoint id is missing.");
  const res = await fetch(`${root}/status/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${endpoint.apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { status?: string; error?: string; output?: unknown } | null;
  if (!res.ok || !json) {
    throw new Error(`RunPod status HTTP ${res.status}`);
  }
  const status = json.status || "UNKNOWN";
  const failed = status === "FAILED" || status === "CANCELLED" || status === "TIMED_OUT";
  const done = status === "COMPLETED";
  const parsed = done ? parseRunpodChatOutput(json.output) : { text: "", toolCalls: [] as ToolCall[] };
  return {
    status,
    done,
    failed,
    text: parsed.text,
    toolCalls: parsed.toolCalls,
    error: failed ? json.error || `RunPod job ${status}` : undefined,
  };
}

/** Accept the shapes the vLLM worker returns: a completion, a wrapper, or streamed chunks. */
export function parseRunpodChatOutput(output: unknown): { text: string; toolCalls: ToolCall[] } {
  const completion = unwrapCompletion(output);
  if (!completion) return { text: "", toolCalls: [] };
  const choice = completion.choices?.[0];
  const message = choice?.message;
  let text = typeof message?.content === "string" ? message.content : "";
  if (!text && Array.isArray(output)) {
    text = output
      .map((chunk) => {
        const delta = unwrapCompletion(chunk)?.choices?.[0]?.delta?.content;
        return typeof delta === "string" ? delta : "";
      })
      .join("");
  }
  const toolCalls: ToolCall[] = [];
  for (const call of message?.tool_calls || []) {
    const name = call.function?.name;
    if (!name) continue;
    let args: Record<string, unknown> = {};
    const raw = call.function?.arguments;
    if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
      } catch {
        args = {};
      }
    }
    toolCalls.push({ name, arguments: args });
  }
  const clean = stripThinkBlocks(text);
  for (const extra of parseToolCalls(clean)) {
    if (!toolCalls.some((call) => call.name === extra.name)) toolCalls.push(extra);
  }
  return { text: stripToolMarkup(clean), toolCalls };
}

function unwrapCompletion(value: unknown): Completion | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Completion & { output?: unknown };
  if (Array.isArray(record.choices)) return record;
  if (record.output) return unwrapCompletion(record.output);
  return null;
}

interface Completion {
  choices?: {
    message?: {
      content?: string;
      tool_calls?: { function?: { name?: string; arguments?: string } }[];
    };
    delta?: { content?: string };
  }[];
  output?: unknown;
}
