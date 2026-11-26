import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIntent } from "./intent.ts";
import { addFact, emptyMemory, matchEntities, rememberRequest, sanitizeMemory } from "./memory.ts";
import { budgetEvidence, compactThread, formatCsvForModel, stripQuoted } from "./context.ts";
import { applyModelOutput, buildRequest, cleanAnswer, initHarness, runToCompletion, advance } from "./engine.ts";
import { buildLongThreadContext } from "../thread-history.ts";
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

test("word-form math and casual banter stay plain chat without searching", () => {
  assert.equal(analyzeIntent("what's 2 plus 2", { connected: google }).needsTools, false);
  assert.equal(analyzeIntent("Lol what is pussified nation?", { connected: google }).needsTools, false);
  assert.equal(analyzeIntent("did anyone email about pussified nation?", { connected: google }).needsTools, true);
});

test("real Monument sign and follow-up draft queries drop noise words", () => {
  const brief = analyzeIntent("Can you brief me on the current status of the Monument sign for Little Elm?", { connected: google });
  assert.equal(brief.kind, "status_brief");
  assert.ok(!brief.terms.includes("current"));
  assert.ok(brief.queries.some((q) => /monument sign/i.test(q)));

  const draft = analyzeIntent("Draft an email following up with Robert", { connected: google });
  assert.equal(draft.kind, "draft_reply");
  assert.deepEqual(draft.terms, ["robert"]);
});

test("relevance gate drops weak single-word matches and tangential library docs", () => {
  const slangSearch = initHarness({ query: "did anyone email about pussified nation?", connected: ["google"] });
  slangSearch.evidence.push({
    id: "m1",
    source: "mail",
    title: "Coffee for the office",
    ref: "g0:abc",
    text: "Our nation loves morning coffee deliveries on Fridays. Let's order two cases.",
    score: 0.4,
  });
  const req1 = buildRequest(slangSearch, "ask", true);
  assert.ok(!req1.messages[0].content.includes("Coffee for the office"), "drops single-word false-positive email");
  assert.match(req1.messages[0].content, /RELEVANCE GATE/);

  const standards = initHarness({ query: "what is my status with the standards? What do I have left to submit?", connected: ["google"] });
  standards.evidence.push({
    id: "lib1",
    source: "library",
    title: "The Keenes: A Family History from Plymouth to Texas",
    text: ("Early generations of the Keene family migrated from Plymouth to Texas across several decades. ".repeat(15)) +
      "They held themselves to high standards of community life and farming.",
    score: 0.35,
  });
  const req2 = buildRequest(standards, "ask", true);
  assert.ok(!req2.messages[0].content.includes("The Keenes"), "drops tangential library match");
  assert.match(req2.messages[0].content, /AMBIGUITY & RELEVANCE GATE/);
});

test("follow-up anchor keeps prior thread and vendor primary over competing threads", async () => {
  const state = initHarness({
    query: "Who is waiting on who with the sign again?",
    history: [
      { role: "user", text: "Can you brief me on the current status of the Monument sign for Little Elm?" },
      { role: "assistant", text: "Robert Hyman (L&S Signs) sent proof options and will call Monday." },
    ],
    anchor: {
      topic: "monument sign",
      people: ["Robert Hyman"],
      emails: ["robert@lnssigns.test"],
      subjects: ["Regarding Height Of Monument Signs"],
      refs: ["g0:thread-robert"],
      fileRefs: [],
    },
    connected: ["google"],
  });
  assert.equal(state.intent.followUp, true);
  state.evidence.push(
    {
      id: "mail-1",
      source: "mail",
      title: "Regarding Height Of Monument Signs",
      ref: "g0:thread-robert",
      text: "From: Robert Hyman <robert@lnssigns.test>\nBoth heights virtually the same at 7'. Let's talk Monday.",
      score: 0.6,
    },
    {
      id: "mail-2",
      source: "mail",
      title: "Boundaries Coffee Signage",
      ref: "g0:thread-brent",
      text: "From: Brent Henley <brent@highpoint.test>\nChecking in on signage.",
      score: 0.65,
    },
  );
  const req = buildRequest(state, "ask", true);
  const sys = req.messages[0].content;
  assert.match(sys, /FOLLOW-UP ANCHOR/);
  assert.ok(sys.indexOf("Regarding Height Of Monument Signs") < sys.indexOf("Boundaries Coffee Signage"));
});

test("email_draft tool call and plain-text fallback produce an editable EmailDraftCard", () => {
  const s1 = initHarness({ query: "Draft an email following up with Robert", connected: ["google"] });
  s1.evidence.push({
    id: "m1",
    source: "mail",
    title: "Quote For Monument Sign-Little Elm",
    ref: "g0:thread-1",
    text: "From: Robert Hyman <robert@lnssigns.test>\nMeet Tuesday at 10:30 AM.",
    score: 0.9,
    meta: {
      threadRef: "g0:thread-1",
      gmailThreadId: "thread-1",
      accountEmail: "daniel@boundariescoffee.com",
      replyToEmail: "robert@lnssigns.test",
      subject: "Quote For Monument Sign-Little Elm",
      inReplyTo: "<msg1@lnssigns.test>",
      references: "<msg1@lnssigns.test>",
    },
  });
  applyModelOutput(s1, {
    text: "",
    toolCalls: [{ name: "email_draft", arguments: { to: "Robert", subject: "", body: "Hi Robert, following up on next steps.", thread_ref: "g0:thread-1" } }],
  });
  assert.equal(s1.phase, "done");
  assert.equal(s1.answer, "");
  assert.equal(s1.emailDraft?.to, "robert@lnssigns.test");
  assert.equal(s1.emailDraft?.subject, "Re: Quote For Monument Sign-Little Elm");
  assert.equal(s1.emailDraft?.gmailThreadId, "thread-1");
  assert.equal(s1.emailDraft?.accountEmail, "daniel@boundariescoffee.com");

  const s2 = initHarness({ query: "Draft an email following up with Robert", connected: ["google"] });
  s2.evidence = [...s1.evidence];
  applyModelOutput(s2, {
    text: "Here is a draft:\n\nSubject: Re: Quote For Monument Sign-Little Elm\n\nHi Robert,\nChecking in on Monday.\n\nWould you like me to send this?",
    toolCalls: [],
  });
  assert.equal(s2.phase, "done");
  assert.equal(s2.answer, "");
  assert.equal(s2.emailDraft?.to, "robert@lnssigns.test");
  assert.match(s2.emailDraft?.body || "", /Checking in on Monday/);
  assert.ok(!/Would you like me to send/i.test(s2.emailDraft?.body || ""));
});

test("chat turns skip tool schemas and firm-library prompt rules; casual asks stay chat", () => {
  for (const q of ["hey thanks!", "yo whats a good rule of thumb for espresso extraction time?", "Lol what is pussified nation?"]) {
    const intent = analyzeIntent(q, { connected: google });
    assert.equal(intent.kind, "chat", q);
    assert.equal(intent.needsTools, false, q);
    const state = initHarness({ query: q, connected: ["google"] });
    const req = buildRequest(state, "ask", false);
    assert.equal(req.nativeTools, undefined);
    assert.ok(!req.messages[0].content.includes("<tool_call>"));
    assert.ok(!req.messages[0].content.includes("Example of the target behavior"));
  }
});

test("social calendar routes to Drive files, cal tmrw drops cal noise, and standards drops submit", () => {
  const social = analyzeIntent("what did we decide for black friday on the social calendar?", { connected: google });
  assert.equal(social.kind, "find");
  assert.equal(social.sources[0], "files");

  const cal = analyzeIntent("whats on my cal tmrw", { connected: google, todayIso: "2026-11-25" });
  assert.equal(cal.kind, "schedule");
  assert.deepEqual(cal.dateRange, { from: "2026-11-26", to: "2026-11-26" });

  const standards = analyzeIntent("what is my status with the standards? What do I have left to submit?", { connected: google });
  assert.ok(!standards.terms.includes("submit"));
  assert.ok(standards.terms.includes("standards"));
});

test("answer style only applies briefing example to status_brief and passes tappable citation URLs", () => {
  const findState = initHarness({ query: "did onyx coffee ship yet", connected: ["google"] });
  findState.evidence.push({
    id: "m1",
    source: "mail",
    title: "A shipment from order #1346140 has been delivered",
    ref: "g0:onyx1",
    url: "https://mail.google.com/mail/?authuser=daniel@boundariescoffee.com#all/onyx1",
    text: "Onyx Coffee Lab shipped and delivered order #1346140 today via FedEx 385339110444.",
    score: 0.9,
  });
  const req = buildRequest(findState, "ask", true);
  const sys = req.messages[0].content;
  assert.ok(!sys.includes("Example of the target behavior"));
  assert.match(sys, /Do NOT use a 'Bottom line:' header/);
  assert.match(sys, /citation_url: https:\/\/mail\.google\.com\/mail\//);
});

test("gather phase runs multi-source searches and reads in parallel", async () => {
  let active = 0;
  let maxActive = 0;
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const state = initHarness({ query: "get up to speed on the monument sign for boundaries little elm", connected: ["google"], memory: FIXTURE_MEMORY });
  const next = await advance(state, {
    tools: {
      async search(source, query) {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(25);
        active--;
        return deepTools.search(source, query, {});
      },
      async read(source, ref, title) {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(25);
        active--;
        return deepTools.read(source, ref, title);
      },
    },
    runNamed: deepRunNamed,
  });
  assert.equal(next.kind, "model");
  assert.ok(maxActive >= 2, `expected parallel gather calls, got maxActive=${maxActive}`);
});

test("connector errors and timeouts surface gracefully without claiming nothing exists", async () => {
  const allFail = initHarness({ query: "whats our gross receipts on the 1120?", connected: ["google"] });
  const resAll = await advance(allFail, {
    tools: {
      async search() {
        return { ok: false, hits: [], timedOut: true, error: "Request timed out" };
      },
      async read() {
        return { ok: false, text: "" };
      },
    },
    runNamed: async () => ({ ok: false, text: "offline" }),
  });
  assert.equal(resAll.kind, "done");
  if (resAll.kind === "done") {
    assert.match(resAll.text, /^Unable to reach .*\(timed out\)/i);
    assert.ok(!/nothing matched|did not find/i.test(resAll.text));
  }

  const partial = initHarness({ query: "update on monument sign quote", connected: ["google"] });
  const resPartial = await advance(partial, {
    tools: {
      async search(source, query) {
        if (source === "files") return { ok: false, hits: [], needsReconnect: true, error: "Authorization failed (401)" };
        return deepTools.search(source, query, {});
      },
      read: deepTools.read,
    },
    runNamed: deepRunNamed,
  });
  assert.equal(resPartial.kind, "model");
  if (resPartial.kind === "model") {
    assert.match(resPartial.request.messages[0].content, /CONNECTOR ERROR:.*Google Drive.*Authorization failed/);
  }
});

test("long threads summarize earlier turns and retain prior topic anchors", () => {
  const messages = [
    { role: "user" as const, text: "Brief me on the Little Elm monument sign" },
    {
      role: "assistant" as const,
      text: "Robert Hyman (L&S Signs) quoted $23,484.84 and will call Monday.",
      done: true,
      anchor: {
        topic: "monument sign",
        people: ["Robert Hyman"],
        emails: ["robert@lnssigns.test"],
        subjects: ["Quote For Monument Sign-Little Elm"],
        refs: ["g0:sign-thread"],
        fileRefs: [],
      },
    },
    ...Array.from({ length: 10 }, (_, idx) => ([
      { role: "user" as const, text: `Turn ${idx + 2} question about McDermott lease section ${idx + 1}` },
      {
        role: "assistant" as const,
        text: `Turn ${idx + 2} answer covering McDermott lease redline section ${idx + 1}.`,
        done: true,
        anchor: {
          topic: "mcdermott lease",
          people: ["Daniel Rudd"],
          emails: ["daniel.rudd@avisonyoung.test"],
          subjects: ["FW: Boundaries Coffee Lease - 2021 W McDermott"],
          refs: ["g0:mcdermott"],
          fileRefs: [],
        },
      },
    ])).flat(),
  ];
  const longCtx = buildLongThreadContext(messages, { maxMessages: 6, maxChars: 2000 });
  assert.equal(longCtx.turns.length, 6);
  assert.ok(longCtx.earlierSummary?.includes("Little Elm monument sign"));
  assert.equal(longCtx.anchor?.topic, "mcdermott lease");
  assert.ok(longCtx.priorAnchors.some((a) => a.topic === "monument sign"));

  const state = initHarness({
    query: "back to the sign, who is waiting on who?",
    history: longCtx.turns,
    earlierSummary: longCtx.earlierSummary,
    anchor: longCtx.anchor,
    priorAnchors: longCtx.priorAnchors,
    connected: ["google"],
  });
  assert.equal(state.anchor?.topic, "monument sign");
  const req = buildRequest(state, "ask", true);
  assert.match(req.messages[0].content, /Earlier conversation summary/);
  assert.match(req.messages[0].content, /Robert Hyman/);
});

test("formatCsvForModel pairs column headers with cell values for tabular spreadsheets", () => {
  const raw = [
    "## 2026 Fitness Standards",
    "Column 1,Alfaro,Beeby,Keene,Reagan",
    "Tier 3 - Minimum,FALSE,TRUE,FALSE,TRUE",
    "Swim: Complete 200m,FALSE,TRUE,FALSE,TRUE",
  ].join("\n");
  const formatted = formatCsvForModel(raw);
  assert.match(formatted, /Tier 3 - Minimum — Alfaro: FALSE, Beeby: TRUE, Keene: FALSE, Reagan: TRUE/);
  assert.match(formatted, /Swim: Complete 200m — .*Keene: FALSE/);
});

test("formatCsvForModel ignores prose/PDF lines with thousands commas and cleanAnswer strips unclosed tool_call", () => {
  const pdfText = [
    "BOUNDARIES COFFEE, LLC | EIN 88-0745345 | Two-Year Comparison 2024",
    "GROSS RECEIPTS OR SALES LESS RETURNS AND ALLOWANCES: Prior Year 161,073 | Current Year (2024) 467,930",
    "COST OF GOODS SOLD: Prior 95,712 | Current 212,908",
    "GROSS PROFITS: Prior 65,361 | Current 255,022",
  ].join("\n");
  assert.equal(formatCsvForModel(pdfText), pdfText);
  assert.equal(cleanAnswer('<tool_call>{"name": "email_read", "arguments": {"ref": "https://example.com"}}'), "");
});
