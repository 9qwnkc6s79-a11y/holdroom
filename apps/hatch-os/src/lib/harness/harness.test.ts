import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIntent } from "./intent.ts";
import { addFact, emptyMemory, matchEntities, rememberRequest, sanitizeMemory } from "./memory.ts";
import { budgetEvidence, compactThread, stripQuoted } from "./context.ts";
import { applyModelOutput, initHarness, runToCompletion, advance } from "./engine.ts";
import { newActivityLog, pushActivity, statusLine } from "./events.ts";
import { FIXTURE_MEMORY, FIXTURE_TODAY } from "../../../eval/agent/fixtures.ts";
import { deepRunNamed, deepTools } from "../../../eval/agent/fixture-tools.ts";

const google = new Set(["google"]);

test("sloppy status ask becomes a multi-source status brief with expanded queries", () => {
  const intent = analyzeIntent("get up to speed on the monument sign for boundaries little elm", { memory: FIXTURE_MEMORY, connected: google });
  assert.equal(intent.kind, "status_brief");
  assert.equal(intent.needsTools, true);
  assert.deepEqual(intent.sources, ["mail", "files", "library"]);
  assert.ok(intent.queries[0].includes('"monument sign"'));
  assert.ok(intent.queries.some((q) => !/little|elm/.test(q)), "has a topic-only fallback");
});

test("typos resolve through firm memory to the canonical words", () => {
  const intent = analyzeIntent("whats the deal w the monumnet sign", { memory: FIXTURE_MEMORY, connected: google });
  assert.ok(intent.entities.some((e) => e.name === "Little Elm monument sign"));
  assert.ok(intent.queries[0].includes("monument sign"));
});

test("plain creative or math asks stay chat; everyday questions look things up", () => {
  assert.equal(analyzeIntent("write a haiku about cold brew", { connected: google }).needsTools, false);
  assert.equal(analyzeIntent("whats 18% of 19250", { connected: google }).needsTools, false);
  assert.equal(analyzeIntent("did we ever hear back from the town", { connected: google }).needsTools, true);
});

test("follow-ups carry the earlier topic and search the new word first", () => {
  const intent = analyzeIntent("what about the landlord?", {
    memory: FIXTURE_MEMORY,
    connected: google,
    history: [{ role: "user", text: "get up to speed on the monument sign" }],
  });
  assert.equal(intent.followUp, true);
  assert.match(intent.queries[0], /landlord/);
});

test("calendar asks get a date range from the user's today", () => {
  const intent = analyzeIntent("whats on my calendar tmrw", { connected: google, todayIso: "2026-11-25" });
  assert.equal(intent.kind, "schedule");
  assert.deepEqual(intent.dateRange, { from: "2026-11-26", to: "2026-11-26" });
});

test("remember requests are captured and stored as facts", () => {
  assert.equal(rememberRequest("remember that Rick is our sign vendor"), "Rick is our sign vendor");
  const mem = addFact(emptyMemory(), "Rick is our sign vendor");
  assert.equal(mem.facts.length, 1);
  assert.equal(sanitizeMemory({ people: [{ name: "A", evil: 1 }], facts: "x" }).people[0].name, "A");
  assert.equal(matchEntities("ping lil elm", FIXTURE_MEMORY)[0]?.name, "Little Elm");
});

test("thread compaction drops quoted replies and keeps the newest message whole", () => {
  assert.equal(stripQuoted("Thanks!\n\nOn Oct 28, 2026, Rick wrote:\n> old"), "Thanks!");
  const thread = ["From: A\nDate: 1\n" + "old ".repeat(400), "From: B\nDate: 2\nNEWEST message body stays."].join("\n\n");
  const out = compactThread(thread, 900);
  assert.ok(out.includes("NEWEST message body stays."));
  assert.ok(out.length <= 900);
  const budget = budgetEvidence([{ id: "1", source: "mail", title: "T", text: thread, score: 1 }], 1200);
  assert.ok(budget.text.includes("Latest message"));
});

test("status line follows the newest active event", () => {
  const log = newActivityLog();
  pushActivity(log, { kind: "searching", label: "Searching Gmail" });
  pushActivity(log, { kind: "reading", label: "Reading “Proof v3”" });
  assert.equal(statusLine(log), "Reading “Proof v3”");
  assert.equal(log.events[0].status, "done");
});

test("the harness reads full threads before the first model call", async () => {
  const state = initHarness({ query: "get up to speed on the monument sign for boundaries little elm", connected: ["google"], memory: FIXTURE_MEMORY, todayIso: FIXTURE_TODAY });
  const next = await advance(state, { tools: deepTools, runNamed: deepRunNamed });
  assert.equal(next.kind, "model");
  if (next.kind !== "model") return;
  const system = next.request.messages[0].content;
  assert.match(system, /19,250/);
  assert.match(system, /survey/);
  assert.equal(next.request.lane, "ask");
  assert.ok(state.activity.events.some((e) => e.kind === "reading"));
});

test("model tool calls run, writes are held for approval, empty answers get one synthesis pass", async () => {
  const state = initHarness({ query: "did rick send the new quote", connected: ["google"], memory: FIXTURE_MEMORY });
  let calls = 0;
  const result = await runToCompletion(state, {
    tools: deepTools,
    runNamed: deepRunNamed,
    model: async (req) => {
      calls++;
      if (calls === 1) return { text: "", toolCalls: [{ name: "email_search", arguments: { query: "quote" } }] };
      if (calls === 2) return { text: "", toolCalls: [] };
      assert.equal(req.purpose, "synthesis");
      return { text: "Yes — rev 3 at $19,250.", toolCalls: [] };
    },
  });
  assert.match(result.text, /19,250/);
  const held = initHarness({ query: "send rick the approval", connected: ["google"] });
  applyModelOutput(held, { text: "Ready to send.", toolCalls: [{ name: "email_send", arguments: { to: "x" } }] });
  assert.equal(held.phase, "approval");
});

test("chat turns go to the Ask lane without searching", async () => {
  const state = initHarness({ query: "write a haiku about cold brew", connected: ["google"] });
  const next = await advance(state, { tools: deepTools, runNamed: deepRunNamed });
  assert.equal(next.kind, "model");
  assert.equal(state.usedTools, false);
  if (next.kind === "model") assert.equal(next.request.lane, "ask");
});
