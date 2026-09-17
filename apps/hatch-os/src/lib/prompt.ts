import { roomLabel } from "./rooms";
import type { Source } from "./types";

export function buildAskMessages(roomId: string, query: string, sources: Source[]) {
  const room = roomLabel(roomId);
  const passages = sources.length
    ? sources
        .map((s, i) => `[${i + 1}] ${s.file} (${s.room})\n${s.snippet}`)
        .join("\n\n")
    : "(no passages retrieved in this room)";

  const system = [
    "You are the in-house assistant for Boundaries Coffee, running on Hatch OS.",
    `Current room: ${room}. Never retrieve or invent facts from another store room.`,
    "Use ONLY the library passages below. If they do not answer the question, say you do not have that in this room’s library and suggest Library upload or switching rooms.",
    "Do not call or pretend to call OpenAI, Anthropic, or any public lab.",
    "Do not invent prices or Toast numbers. DEMO files are labeled DEMO.",
    "Do not use <think> tags. Answer directly in plain sentences.",
    "Be concise. After the answer, mention the filename(s) you used in plain text if any.",
    "",
    "Library passages:",
    passages,
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `${query}\n/no_think` },
  ];
}
