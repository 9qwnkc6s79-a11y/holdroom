import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HISTORY_MAX_CHARS,
  interleaveHistory,
  windowThreadHistory,
} from "./thread-history.ts";

describe("windowThreadHistory", () => {
  it("drops the just-appended current user turn and empty assistant stubs", () => {
    const prior = windowThreadHistory(
      [
        { role: "user", text: "Hello", done: true },
        { role: "assistant", text: "Hey! How can I help you today?", done: true },
        { role: "assistant", text: "", done: false },
        { role: "user", text: "What did I say to start this conversation?", done: true },
      ],
      { excludeLastUser: "What did I say to start this conversation?" },
    );
    assert.deepEqual(prior, [
      { role: "user", text: "Hello" },
      { role: "assistant", text: "Hey! How can I help you today?" },
    ]);
  });

  it("keeps a newest window and does not grow unbounded", () => {
    const messages = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: "user" as const, text: `u${i}`, done: true });
      messages.push({ role: "assistant" as const, text: `a${i}`, done: true });
    }
    const windowed = windowThreadHistory(messages);
    assert.ok(windowed.length <= 12);
    assert.equal(windowed[0]?.role, "user");
    assert.equal(windowed.at(-1)?.text, "a19");
    const huge = windowThreadHistory(
      [
        { role: "user", text: "x".repeat(HISTORY_MAX_CHARS + 50), done: true },
        { role: "assistant", text: "ok", done: true },
        { role: "user", text: "later", done: true },
      ],
      { maxChars: 100 },
    );
    assert.ok(huge.every((t) => t.text.length <= 100));
  });
});

describe("interleaveHistory follow-up", () => {
  it("includes prior user+assistant turns so a follow-up can see Hello", () => {
    const history = windowThreadHistory(
      [
        { role: "user", text: "Hello", done: true },
        { role: "assistant", text: "Hey! How can I help you today?", done: true },
        { role: "user", text: "What did I say to start this conversation?", done: true },
      ],
      { excludeLastUser: "What did I say to start this conversation?" },
    );
    const messages = interleaveHistory(
      "Ask. Use thread history for follow-ups.",
      history,
      "What did I say to start this conversation?",
    );
    assert.equal(messages[0]?.role, "system");
    assert.deepEqual(
      messages.slice(1),
      [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hey! How can I help you today?" },
        { role: "user", content: "What did I say to start this conversation?" },
      ],
    );
    const userTurns = messages.filter((m) => m.role === "user").map((m) => m.content);
    assert.ok(userTurns.includes("Hello"));
    assert.equal(userTurns.at(-1), "What did I say to start this conversation?");
    assert.equal(messages.some((m) => /You didn’t say anything|You didn't say anything/.test(m.content)), false);
  });

  it("stays single-turn when there is no history", () => {
    const messages = interleaveHistory("Ask.", [], "Hello");
    assert.deepEqual(
      messages.map((m) => m.role),
      ["system", "user"],
    );
    assert.equal(messages[1]?.content, "Hello");
  });

  it("answers a what-did-I-say follow-up from history, not RAG passages", () => {
    const followUp = "What did I just say";
    const history = windowThreadHistory(
      [
        { role: "user", text: "Hello", done: true },
        { role: "assistant", text: "Hey! How can I help you today?", done: true },
        { role: "user", text: followUp, done: true },
      ],
      { excludeLastUser: followUp },
    );
    const ragSystem = [
      "Ask. Use thread history for follow-ups.",
      "Library passages (firm-wide):",
      "[1] DEMO_catering_protocol.md (hq-ops)",
      "[2] DEMO_open_close_checklist.md (little-elm)",
      "[3] DEMO_loyalty.md (hq-ops)",
      "If the question is only about this conversation, do not cite library files.",
    ].join("\n");
    const messages = interleaveHistory(ragSystem, history, followUp);
    const hello = messages.find((m) => m.role === "user" && m.content === "Hello");
    const rag = messages.find((m) => m.role === "system");
    assert.ok(hello, "prior user turn must be a chat message the model can quote");
    assert.ok(rag?.content.includes("DEMO_catering_protocol.md"));
    assert.equal(rag?.content.includes("Hello"), false);
    assert.equal(messages.filter((m) => m.role === "user").length, 2);
    assert.equal(messages.at(-1)?.content, followUp);
  });
});
