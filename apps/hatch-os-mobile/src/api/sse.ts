import type { LivePayload } from "./types";

export function drainSse(buffer: string): { events: LivePayload[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: LivePayload[] = [];
  for (const part of parts) {
    const line = part
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item.startsWith("data:"));
    if (!line) continue;
    const json = line.replace(/^data:\s*/, "");
    if (!json || json === "[DONE]") continue;
    try {
      events.push(JSON.parse(json) as LivePayload);
    } catch {
      /* Ignore a partial frame. The rest is parsed on the next chunk. */
    }
  }
  return { events, rest };
}
