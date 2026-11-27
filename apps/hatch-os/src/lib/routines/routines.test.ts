import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

const tmp = mkdtempSync(path.join(os.tmpdir(), "hatch-routines-"));
process.env.HATCH_DATA_DIR = path.join(tmp, "data");
process.env.HATCH_VAULT_KEY = process.env.HATCH_VAULT_KEY || "test-vault-key-for-routines-only-0123456789";
delete process.env.BLOB_READ_WRITE_TOKEN;

const cron = await import("./cron.ts");
const parse = await import("./parse.ts");
const store = await import("./store.ts");
const runner = await import("./runner.ts");
const proposal = await import("./proposal.ts");
const mail = await import("./mail-trigger.ts");
const push = await import("./push.ts");

let beta = "";
beforeEach(() => {
  beta = mkdtempSync(path.join(tmp, "beta-"));
  process.env.HATCH_BETA_DIR = beta;
  delete process.env.HATCH_ROUTINE_DAILY_RUNS;
});
afterEach(() => rmSync(beta, { recursive: true, force: true }));

// Wed Nov 25 2026, 7:30 PM CT
const NOW = new Date("2026-11-26T01:30:00Z");

describe("cron", () => {
  it("finds the next weekday 7am in Chicago", () => {
    assert.equal(cron.nextRun("0 7 * * 1-5", NOW)?.toISOString(), "2026-11-26T13:00:00.000Z");
    // Friday 7am → Monday 7am
    assert.equal(cron.nextRun("0 7 * * 1-5", new Date("2026-11-27T13:00:00Z"))?.toISOString(), "2026-11-30T13:00:00.000Z");
  });
  it("handles DST: 7am stays 7am local across the March change", () => {
    const before = cron.nextRun("0 7 * * *", new Date("2027-03-13T12:00:00Z"));
    const after = cron.nextRun("0 7 * * *", new Date("2027-03-14T00:00:00Z"));
    assert.equal(before?.toISOString(), "2027-03-13T13:00:00.000Z"); // CST
    assert.equal(after?.toISOString(), "2027-03-14T12:00:00.000Z"); // CDT
  });
  it("enforces the 15 minute minimum", () => {
    assert.equal(cron.validateCron("*/5 * * * *").ok, false);
    assert.equal(cron.validateCron("0,10 9 * * *").ok, false);
    assert.equal(cron.validateCron("*/15 * * * *").ok, true);
    assert.equal(cron.validateCron("not a cron").ok, false);
  });
  it("describes schedules in plain English", () => {
    assert.equal(cron.describeCron("0 7 * * 1-5"), "Weekdays at 7:00 AM CT");
    assert.equal(cron.describeCron("30 8 * * 1"), "Every Monday at 8:30 AM CT");
    assert.equal(cron.describeCron("0 */2 * * *"), "Every 2 hours");
  });
});

describe("plain-language parsing", () => {
  const p = (text: string) => parse.parseRoutineAsk(text, { now: NOW });
  it("weekday brief", () => {
    const r = p("every weekday 7am brief me on open vendor threads")!;
    assert.equal(r.mode, "agent");
    assert.equal(r.cron, "0 7 * * 1-5");
    assert.equal(r.prompt, "Brief me on open vendor threads");
  });
  it("same ask, schedule at the end", () => {
    assert.equal(p("brief me on open vendor threads every weekday at 7am")!.cron, "0 7 * * 1-5");
  });
  it("weekly reminder does not use the model", () => {
    const r = p("remind me every Monday to call Rick")!;
    assert.equal(r.mode, "reminder");
    assert.equal(r.cron, "0 8 * * 1");
    assert.equal(r.name, "Call Rick");
  });
  it("one-time reminders", () => {
    const r = p("remind me tomorrow at 9 to send the W-9")!;
    assert.equal(r.runAt, "2026-11-26T15:00:00.000Z");
    assert.equal(r.cron, undefined);
    assert.equal(p("Remind me on Thursday to order cups")!.cron, undefined);
  });
  it("email triggers", () => {
    const r = p("tell me when Robert replies")!;
    assert.equal(r.mode, "notify");
    assert.equal(r.triggerQuery, "from:robert");
    const about = p("let me know when an email about the monument sign comes in")!;
    assert.equal(about.triggerQuery, '"monument sign"');
    const agentic = p("when robert replies about the sign, summarize it and tell me what he wants")!;
    assert.equal(agentic.mode, "agent");
    assert.equal(agentic.triggerQuery, "from:robert sign");
  });
  it("uses a known email address from firm memory", () => {
    const r = parse.parseRoutineAsk("let me know when Sarah gets back to me", { now: NOW, people: [{ name: "Sarah Lee", email: "sarah@example.com" }] })!;
    assert.equal(r.triggerQuery, "from:sarah@example.com");
  });
  it("clamps too-frequent asks to 15 minutes", () => {
    const r = p("every 5 minutes check my email")!;
    assert.equal(r.cron, "*/15 * * * *");
    assert.ok(r.assumptions.some((a) => /15 minutes/.test(a)));
  });
  it("leaves normal questions alone", () => {
    for (const text of ["what happens every monday at the store?", "whats the latest w the monument sign", "draft a reply to Robert", "who's waiting on who", "write a haiku about cold brew"]) {
      assert.equal(p(text), null, text);
    }
  });
  it("parses edit-field times", () => {
    assert.equal(parse.parseWhen("fridays at 4pm", { now: NOW })?.cron, "0 16 * * 5");
    assert.equal(parse.parseWhen("0 9 * * 1", { now: NOW })?.cron, "0 9 * * 1");
    assert.equal(parse.parseWhen("whenever", { now: NOW }), null);
  });
});

describe("store", () => {
  it("creates, updates without touching the schedule, and pauses", async () => {
    const doc = await store.loadDoc("HATCH-TEST");
    const created = store.applyInput(doc, { name: "Brief", prompt: "Brief me", cron: "0 7 * * 1-5" }, NOW);
    assert.ok(created.ok);
    if (!created.ok) return;
    assert.equal(created.routine.nextRunAt, "2026-11-26T13:00:00.000Z");
    assert.equal(created.routine.schedule, "Weekdays at 7:00 AM CT");
    await store.saveDoc(doc);
    // Older clients post the whole object back with a human `schedule` label to pause it.
    const again = await store.loadDoc("HATCH-TEST");
    const toggled = store.applyInput(again, { ...created.routine, enabled: false } as never, NOW);
    assert.ok(toggled.ok);
    if (!toggled.ok) return;
    assert.equal(toggled.routine.enabled, false);
    assert.equal(toggled.routine.cron, "0 7 * * 1-5");
    assert.equal(toggled.routine.nextRunAt, undefined);
  });
  it("accepts legacy schedule strings and rejects too-frequent crons", async () => {
    const doc = await store.loadDoc("HATCH-TEST");
    const legacy = store.applyInput(doc, { prompt: "Afternoon check", schedule: "weekdays 17:00" }, NOW);
    assert.ok(legacy.ok && legacy.routine.cron === "0 17 * * 1-5");
    const bad = store.applyInput(doc, { prompt: "Spam", cron: "*/5 * * * *" }, NOW);
    assert.equal(bad.ok, false);
  });
  it("keeps the cron index small and current", async () => {
    const doc = await store.loadDoc("HATCH-IDX");
    store.applyInput(doc, { prompt: "a", cron: "0 7 * * 1-5" }, NOW);
    await store.saveDoc(doc);
    const index = await store.loadIndex();
    assert.equal(Object.keys(index.scopes).length, 1);
    assert.equal(Object.values(index.scopes)[0].nextDueAt, "2026-11-26T13:00:00.000Z");
  });
});

function fakeDeps(over: Partial<import("./runner.ts").RunnerDeps> = {}) {
  let clock = NOW;
  const calls = { start: 0, advance: 0, posts: [] as string[], push: [] as string[], mail: 0, sleeps: 0 };
  const deps: import("./runner.ts").RunnerDeps = {
    now: () => clock,
    modelReady: () => true,
    ensureThread: async (_s, r) => r.threadId || `th-${r.id}`,
    postMessage: async (_s, _t, _r, text) => {
      calls.posts.push(text);
      return `msg-${calls.posts.length}`;
    },
    startAgent: async (_s, routine, _q, threadId) => {
      calls.start++;
      return { phase: "wait", threadId, state: { version: 2, threadId, messageId: `m-${routine.id}`, agentId: "general", actor: "routine", workspaceId: "x", testerCode: "s", startedAt: 0, harness: {} as never } };
    },
    advanceAgent: async (_s, state) => {
      calls.advance++;
      return { phase: "done", threadId: state.threadId, messageId: state.messageId, text: "Two vendor threads are open." };
    },
    mailSearch: async () => {
      calls.mail++;
      return [];
    },
    push: async (_s, kind) => {
      calls.push.push(kind);
    },
    sleep: async () => {
      calls.sleeps++;
    },
    ...over,
  };
  return { deps, calls, setNow: (d: Date) => (clock = d) };
}

async function seed(scope: string, inputs: import("./store.ts").RoutineInput[], at = NOW) {
  const doc = await store.loadDoc(scope);
  const out = inputs.map((input) => {
    const res = store.applyInput(doc, input, at);
    assert.ok(res.ok, JSON.stringify(res));
    return res.ok ? res.routine : null!;
  });
  await store.saveDoc(doc);
  return out;
}

describe("runner", () => {
  const SEVEN = new Date("2026-11-26T13:00:30Z");

  it("posts a due reminder without the model and schedules the next one", async () => {
    const [r] = await seed("S1", [{ prompt: "Call Rick", mode: "reminder", cron: "0 7 * * 1-5" }]);
    const { deps, calls, setNow } = fakeDeps();
    setNow(SEVEN);
    const report = await runner.runTick(deps, { budgetMs: 5_000 });
    assert.equal(calls.start, 0);
    assert.deepEqual(calls.posts, ["Reminder: Call Rick"]);
    const doc = await store.loadDoc("S1");
    const saved = doc.routines.find((x) => x.id === r.id)!;
    assert.equal(saved.runs[0].status, "done");
    assert.equal(saved.runs[0].read, false);
    assert.equal(saved.nextRunAt, "2026-11-27T13:00:00.000Z");
    assert.equal(report.posted, 1);
    assert.deepEqual(calls.push, ["result"]);
  });

  it("batches agent routines due in the same tick and finishes them", async () => {
    await seed("S2", [
      { prompt: "Brief me on vendor threads", cron: "0 7 * * 1-5" },
      { prompt: "What's on my calendar today", cron: "0 7 * * *" },
      { prompt: "Later one", cron: "0 9 * * *" },
    ]);
    const { deps, calls, setNow } = fakeDeps();
    setNow(SEVEN);
    const report = await runner.runTick(deps, { budgetMs: 20_000, pollMs: 1 });
    assert.equal(calls.start, 2, "both 7am routines start in the same tick; the 9am one waits");
    assert.equal(report.started, 2);
    assert.equal(report.finished, 2);
    const doc = await store.loadDoc("S2");
    assert.equal(doc.active.length, 0);
    assert.deepEqual(doc.routines.filter((r) => r.runs.length).map((r) => r.runs[0].status), ["done", "done"]);
    assert.equal(doc.usage?.agentRuns, 2);
  });

  it("holds writes as pending approval cards and never executes them", async () => {
    await seed("S3", [{ prompt: "Reply to Robert", cron: "0 7 * * *" }]);
    const { deps, setNow } = fakeDeps({
      advanceAgent: async (_s, state) => ({
        phase: "done",
        threadId: state.threadId,
        messageId: "m-approval",
        text: "Draft ready.",
        approval: { id: "a1", tool: "email_send", title: "Send an email", summary: "", inputs: [], call: { name: "email_send", arguments: {} }, status: "pending" },
      }),
    });
    setNow(SEVEN);
    await runner.runTick(deps, { budgetMs: 10_000, pollMs: 1 });
    const run = (await store.loadDoc("S3")).routines[0].runs[0];
    assert.equal(run.status, "needs_approval");
    assert.deepEqual(run.approval, { title: "Send an email", status: "pending" });
    assert.equal(run.messageId, "m-approval");
  });

  it("respects the minimum interval, the daily cap, and a missing model", async () => {
    process.env.HATCH_ROUTINE_DAILY_RUNS = "1";
    await seed("S4", [{ prompt: "one", cron: "0 7 * * *" }, { prompt: "two", cron: "0 7 * * *" }]);
    const { deps, calls, setNow } = fakeDeps();
    setNow(SEVEN);
    await runner.runTick(deps, { budgetMs: 10_000, pollMs: 1 });
    assert.equal(calls.start, 1);
    const statuses = (await store.loadDoc("S4")).routines.map((r) => r.runs[0]?.status).sort();
    assert.deepEqual(statuses, ["done", "skipped"]);

    await seed("S5", [{ prompt: "needs model", cron: "0 7 * * *" }]);
    const off = fakeDeps({ modelReady: () => false });
    off.setNow(SEVEN);
    await runner.runTick(off.deps, { budgetMs: 5_000 });
    assert.equal(off.calls.start, 0);
    assert.equal((await store.loadDoc("S5")).routines[0].runs[0].status, "skipped");
  });

  it("never fires a routine twice within 15 minutes", async () => {
    await seed("S4b", [{ prompt: "Brief", cron: "0 7 * * *" }]);
    await store.updateDoc("S4b", (doc) => {
      doc.routines[0].lastRunAt = new Date(SEVEN.getTime() - 5 * 60_000).toISOString();
      doc.routines[0].nextRunAt = new Date(SEVEN.getTime() - 60_000).toISOString();
    });
    const { deps, calls, setNow } = fakeDeps();
    setNow(SEVEN);
    await runner.runTick(deps, { budgetMs: 10_000, pollMs: 1 });
    assert.equal(calls.start, 0);
    assert.equal((await store.loadDoc("S4b")).routines[0].nextRunAt, "2026-11-27T13:00:00.000Z");
  });

  it("one-time routines turn themselves off after running", async () => {
    await seed("S6", [{ prompt: "Send the W-9", mode: "reminder", runAt: "2026-11-26T15:00:00.000Z" }]);
    const { deps, setNow } = fakeDeps();
    setNow(new Date("2026-11-26T15:01:00Z"));
    await runner.runTick(deps, { budgetMs: 5_000 });
    const r = (await store.loadDoc("S6")).routines[0];
    assert.equal(r.enabled, false);
    assert.equal(r.nextRunAt, undefined);
    assert.equal(r.runs.length, 1);
  });

  it("email triggers prime on first check, then notify without the model", async () => {
    await seed("S7", [{ prompt: "Tell me when Robert replies", mode: "notify", triggerQuery: "from:robert" }]);
    let inbox: import("./mail-trigger.ts").MailHit[] = [{ id: "old1", from: "Robert <r@x.com>", subject: "Old", snippet: "" }];
    const { deps, calls, setNow } = fakeDeps({ mailSearch: async () => inbox });
    setNow(SEVEN);
    await runner.runTick(deps, { budgetMs: 5_000 });
    assert.equal(calls.posts.length, 0, "first check only records what is already there");
    inbox = [{ id: "new1", from: "Robert Smith <r@x.com>", subject: "Re: monument sign proof", snippet: "Looks good, go ahead." }, ...inbox];
    setNow(new Date(SEVEN.getTime() + 15 * 60_000));
    await runner.runTick(deps, { budgetMs: 5_000 });
    assert.equal(calls.start, 0);
    assert.equal(calls.posts.length, 1);
    assert.match(calls.posts[0], /Robert Smith.*Re: monument sign proof/);
    // Checked within 14 minutes → skipped.
    setNow(new Date(SEVEN.getTime() + 20 * 60_000));
    await runner.runTick(deps, { budgetMs: 5_000 });
    assert.equal(calls.posts.length, 1);
  });

  it("manual run works on a paused routine and leaves the schedule alone", async () => {
    const [r] = await seed("S8", [{ prompt: "Brief", cron: "0 7 * * *", enabled: false }]);
    const { deps, calls } = fakeDeps();
    const report = runner.emptyReport();
    const runs = await runner.processScope("S8", deps, report, r.id);
    assert.equal(runs.length, 1);
    assert.equal(calls.start, 1);
    await runner.advanceScope("S8", deps, report, { deadline: Date.now() + 5_000 });
    const after = (await store.loadDoc("S8")).routines[0];
    assert.equal(after.runs[0].status, "done");
    assert.equal(after.enabled, false);
  });

  it("does nothing on an idle tick", async () => {
    await seed("S9", [{ prompt: "Brief", cron: "0 7 * * *" }]);
    const { deps, calls } = fakeDeps();
    const report = await runner.runTick(deps, { budgetMs: 5_000 });
    assert.equal(report.scopes, 0);
    assert.equal(calls.start + calls.posts.length + calls.mail, 0);
  });
});

describe("chat proposal", () => {
  it("builds a Save/Edit/Cancel card with plain fields", () => {
    const p = parse.parseRoutineAsk("every weekday 7am brief me on open vendor threads", { now: NOW })!;
    const card = proposal.proposalCard(p, "general");
    assert.equal(card.tool, "routine_create");
    assert.equal(card.status, "pending");
    assert.deepEqual(card.inputs.slice(0, 2), [
      { label: "Name", value: "Brief me on open vendor threads" },
      { label: "When", value: "Weekdays at 7:00 AM CT" },
    ]);
    assert.equal(card.call.arguments.cron, "0 7 * * 1-5");
  });
  it("applies edits in plain language and saves", async () => {
    const p = parse.parseRoutineAsk("remind me every Monday to call Rick", { now: NOW })!;
    const card = proposal.proposalCard(p);
    const merged = proposal.mergeEdits(card.call.arguments, { when: "fridays at 4pm", name: "Rick call" }, NOW);
    assert.ok(merged.ok);
    if (!merged.ok) return;
    assert.equal(merged.args.cron, "0 16 * * 5");
    const saved = await proposal.saveProposal("S10", merged.args, NOW);
    assert.ok(saved.ok);
    if (!saved.ok) return;
    assert.equal(saved.routine.name, "Rick call");
    assert.equal(saved.routine.mode, "reminder");
    assert.match(proposal.savedDetail(saved.routine), /Fridays|Friday/);
    const bad = proposal.mergeEdits(card.call.arguments, { when: "whenever" }, NOW);
    assert.equal(bad.ok, false);
  });
  it("approving a routine card saves it; cancelling saves nothing", async () => {
    const { applyApprovalDecision } = await import("../approvals.ts");
    const { createThread, appendThreadMessages } = await import("../store.ts");
    const p = parse.parseRoutineAsk("tell me when Robert replies", { now: NOW })!;
    const thread = createThread("north-desk" as never, "t", "general");
    appendThreadMessages(thread.id, [
      { id: "m1", role: "assistant", text: "Save?", done: true, sources: [], approval: proposal.proposalCard(p, "general") },
      { id: "m2", role: "assistant", text: "Save?", done: true, sources: [], approval: proposal.proposalCard(p, "general") },
    ]);
    const cancelled = await applyApprovalDecision({ threadId: thread.id, messageId: "m2", decision: "cancelled", testerCode: "S11" });
    assert.ok(cancelled.ok);
    assert.equal((await store.loadDoc("S11")).routines.length, 0);
    const ok = await applyApprovalDecision({ threadId: thread.id, messageId: "m1", decision: "approved", testerCode: "S11" });
    assert.ok(ok.ok);
    const doc = await store.loadDoc("S11");
    assert.equal(doc.routines.length, 1);
    assert.equal(doc.routines[0].trigger?.query, "from:robert");
    assert.equal(doc.routines[0].mode, "notify");
  });
});

describe("push", () => {
  it("is off by default and never includes routine names or content", async () => {
    assert.equal(push.pushEnabled(), false);
    assert.equal(await push.sendPush("S12", "result", 1, (async () => { throw new Error("should not send"); }) as never), 0);
    const copy = push.pushCopy("result", 1);
    assert.doesNotMatch(copy.body, /Robert|vendor|monument/i);
    assert.equal(push.validExpoToken("ExponentPushToken[abcdefghijklmnop]"), true);
    assert.equal(push.validExpoToken("nope"), false);
  });
  it("notify text names sender and subject", () => {
    const text = mail.notifyText([{ id: "1", from: '"Robert Smith" <r@x.com>', subject: "Re: proof", snippet: "ok" }]);
    assert.match(text, /\*\*Robert Smith\*\*: “Re: proof”/);
  });
});
