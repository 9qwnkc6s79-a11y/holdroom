import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeThreads, richerThread } from "./transcripts.ts";
import type { ChatThread } from "./types.ts";

function thread(agentId: string, texts: string[], updatedAt: string): ChatThread {
  return {
    id: `th-${agentId}`,
    agentId,
    departmentId: "hq-ops",
    title: texts[0] || "New thread",
    archived: false,
    createdAt: updatedAt,
    updatedAt,
    messages: texts.map((text, index) => ({
      id: `${agentId}-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      text,
      done: true,
      sources: [],
    })),
  };
}

describe("transcript merge", () => {
  it("keeps a local conversation when the server thread is empty", () => {
    const local = thread("general", ["Hello", "Hi there"], "2026-11-19T18:00:00.000Z");
    const server = thread("general", [], "2026-11-19T18:05:00.000Z");
    const merged = mergeThreads([local], [server]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0]?.messages.map((message) => message.text), ["Hello", "Hi there"]);
  });

  it("takes a longer server copy and keeps other agents", () => {
    const local = [
      thread("general", ["Hello"], "2026-11-19T18:00:00.000Z"),
      thread("legal", ["Contract?"], "2026-11-19T18:01:00.000Z"),
    ];
    const server = [thread("general", ["Hello", "Answer"], "2026-11-19T18:02:00.000Z")];
    const merged = mergeThreads(local, server);
    const general = merged.find((item) => item.agentId === "general");
    const legal = merged.find((item) => item.agentId === "legal");
    assert.equal(general?.messages.length, 2);
    assert.equal(legal?.messages.length, 1);
  });

  it("does not prefer an empty thread just because it is newer", () => {
    const chosen = richerThread(
      thread("operations", ["One", "Two"], "2026-11-19T18:00:00.000Z"),
      thread("operations", [], "2026-11-19T19:00:00.000Z"),
    );
    assert.equal(chosen?.messages.length, 2);
  });
});
