import assert from "node:assert/strict";
import test from "node:test";
import type { Agent, ChatThread } from "../api/types.ts";
import { activityLine, composeDictation, greeting, hostLine, isWaitStatus, jpegName, normalizeInvite, startersForAgent, tasksFromThreads } from "./derive.ts";

const legal: Agent = {
  id: "legal",
  name: "Legal",
  title: "Counsel",
  description: "Contracts.",
  departmentId: "legal",
  writeDepartmentId: "legal",
};

test("greeting follows the local hour", () => {
  assert.equal(greeting(8), "Good morning");
  assert.equal(greeting(12), "Good afternoon");
  assert.equal(greeting(17), "Good evening");
});

test("live dictation replaces partials without dropping what was already typed", () => {
  assert.equal(composeDictation("", "hello"), "hello");
  assert.equal(composeDictation("", "hello there"), "hello there");
  assert.equal(composeDictation("Draft the note", "about the lease"), "Draft the note about the lease");
  assert.equal(composeDictation("Draft the note", ""), "Draft the note");
});

test("photos are renamed to jpeg and warmup copy is not a reply", () => {
  assert.equal(jpegName("IMG_2067.HEIC"), "IMG_2067.jpg");
  assert.equal(jpegName("scan.png"), "scan.jpg");
  assert.equal(isWaitStatus("Warming up your firm’s host. The first reply can take a few minutes."), true);
  assert.equal(isWaitStatus("Thinking…"), true);
  assert.equal(isWaitStatus("The dossier is ready."), false);
});

test("invite codes keep their dash and case is folded", () => {
  assert.equal(normalizeInvite("  hatch-beta "), "HATCH-BETA");
});

test("urgent work sorts ahead of other threads", () => {
  const threads: ChatThread[] = [
    {
      id: "later",
      title: "Notes",
      departmentId: "legal",
      agentId: "legal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      messages: [{ id: "m1", role: "assistant", text: "Ready when you are.", done: true }],
    },
    {
      id: "now",
      title: "Draft",
      departmentId: "legal",
      agentId: "legal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      messages: [
        {
          id: "m2",
          role: "assistant",
          text: "This waits for you.",
          done: true,
          approval: {
            id: "a1",
            tool: "email_send",
            title: "Send an email",
            summary: "Nothing is sent until you approve.",
            inputs: [],
            status: "pending",
          },
        },
      ],
    },
  ];
  const tasks = tasksFromThreads(threads, [legal]);
  assert.equal(tasks[0]?.id, "now");
  assert.equal(tasks[0]?.urgent, true);
  assert.match(tasks[0]?.meta || "", /Legal · Needs your approval/);
  assert.equal(tasks[1]?.urgent, false);
});

test("host line does not surface a vendor name", () => {
  assert.deepEqual(hostLine({ ok: true, label: "https://api.runpod.ai is ready", modelState: "ready" }), {
    detail: "Your firm’s host is ready",
    connected: true,
  });
  assert.equal(hostLine(null).connected, false);
});

test("activityLine preserves live Gmail/Drive status lines", () => {
  assert.equal(activityLine("Reading Gmail…"), "Reading Gmail…");
  assert.equal(activityLine("Reading Drive…"), "Reading Drive…");
  assert.equal(activityLine("Warming up test server…"), "Warming up your firm’s host. The first reply can take a few minutes.");
});

test("startersForAgent returns 3 non-empty starter prompts", () => {
  const list = startersForAgent({ id: "general" });
  assert.equal(list.length, 3);
  assert.ok(list.every((item) => item.length > 5));
});
