export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

const TOOL_LINE = /(?:^|\n)TOOL\s*(\{[\s\S]*\})\s*$/;
const HERMES_TOOL_CALL = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;

/** Qwen3.8 / qwen3_coder format: <function=name><parameter=query>value</parameter></function>. */
function parseToolXml(raw: string): ToolCall | null {
  const fn = raw.match(/<function=([\w.-]+)>([\s\S]*?)(?:<\/function>|$)/);
  if (!fn) return null;
  const args: Record<string, unknown> = {};
  for (const m of fn[2].matchAll(/<parameter=([\w.-]+)>\s*([\s\S]*?)\s*(?:<\/parameter>|(?=<parameter=)|$)/g)) args[m[1]] = m[2].trim();
  return { name: fn[1], arguments: args };
}

function parseToolJson(raw: string): ToolCall | null {
  if (/^\s*<function=/.test(raw)) return parseToolXml(raw);
  try {
    const json = JSON.parse(raw) as {
      name?: string;
      arguments?: Record<string, unknown> | string;
      args?: Record<string, unknown> | string;
    };
    if (!json.name) return null;
    const args = json.arguments ?? json.args ?? {};
    if (typeof args === "string") {
      try {
        return { name: json.name, arguments: JSON.parse(args) as Record<string, unknown> };
      } catch {
        return { name: json.name, arguments: {} };
      }
    }
    return { name: json.name, arguments: args };
  } catch {
    return null;
  }
}

export function parseToolTrailer(text: string): ToolCall | null {
  const match = text.match(TOOL_LINE);
  if (!match) return null;
  return parseToolJson(match[1]);
}

export function parseHermesToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const re = new RegExp(HERMES_TOOL_CALL.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const parsed = parseToolJson(match[1].trim());
    if (parsed) calls.push(parsed);
  }
  return calls;
}

export function parseToolCalls(text: string): ToolCall[] {
  const calls = parseHermesToolCalls(text);
  const trailer = parseToolTrailer(text);
  if (trailer && !calls.some((c) => c.name === trailer.name)) calls.push(trailer);
  return calls;
}

export function stripToolTrailer(text: string): string {
  return text.replace(TOOL_LINE, "").trim();
}

export function stripToolMarkup(text: string): string {
  return stripToolTrailer(text.replace(HERMES_TOOL_CALL, "")).trim();
}
