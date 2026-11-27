/**
 * Runs due routines. Called by the Vercel Cron tick (/api/routines/tick), by
 * "Run now", and by the Routines screen while a run is in flight.
 *
 * Cost rules (each agent run can wake the GPU, billed while it is up):
 * - Reminders and email-notify routines never call a model.
 * - Everything due in the same tick is submitted together, so one wake serves
 *   the batch (RunPod queues the jobs on the same worker).
 * - A routine cannot fire more often than every 15 minutes.
 * - Model runs per scope per day are capped (HATCH_ROUTINE_DAILY_RUNS, default 12).
 * - Writes are never executed here: the harness turns them into pending
 *   approval cards in the routine's thread.
 */
import type { ApprovalCard } from "../types.ts";
import type { HarnessLiveState } from "../harness/live.ts";
import { DEFAULT_TZ, MIN_INTERVAL_MINUTES, localParts } from "./cron.ts";
import { freshMatches, notifyText, type MailHit, type MailSearch } from "./mail-trigger.ts";
import { computeNextRun, loadDoc, loadIndex, newRoutineId, pushRun, updateDoc } from "./store.ts";
import type { ActiveRun, RoutineDoc, RoutineRecord, RoutineRun } from "./types.ts";

export const ROUTINES_AGENT_ID = "routines";
const TRIGGER_EVERY_MS = 14 * 60_000;
const STALE_RUN_MS = 30 * 60_000;
const LEASE_MS = 55_000;

export interface AgentTurnResult {
  phase: "wait" | "done";
  state?: HarnessLiveState;
  text?: string;
  approval?: ApprovalCard;
  messageId?: string;
  threadId: string;
  error?: boolean;
}

export interface RunnerDeps {
  now: () => Date;
  modelReady: () => boolean;
  ensureThread: (scope: string, routine: RoutineRecord) => Promise<string>;
  postMessage: (scope: string, threadId: string, routine: RoutineRecord, text: string) => Promise<string>;
  startAgent: (scope: string, routine: RoutineRecord, query: string, threadId: string) => Promise<AgentTurnResult>;
  advanceAgent: (scope: string, state: HarnessLiveState) => Promise<AgentTurnResult>;
  mailSearch: MailSearch;
  push: (scope: string, kind: "result" | "approval", count: number) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
}

export interface TickReport {
  scopes: number;
  started: number;
  posted: number;
  finished: number;
  skipped: number;
  active: number;
  checkedTriggers: number;
  errors: string[];
}

export function emptyReport(): TickReport {
  return { scopes: 0, started: 0, posted: 0, finished: 0, skipped: 0, active: 0, checkedTriggers: 0, errors: [] };
}

export function dailyRunCap() {
  const n = Number(process.env.HATCH_ROUTINE_DAILY_RUNS || 12);
  return Number.isFinite(n) && n >= 0 ? n : 12;
}

export function routinesEnabled() {
  return (process.env.HATCH_ROUTINES || "on").toLowerCase() !== "off";
}

function localDay(now: Date) {
  const p = localParts(now, process.env.HATCH_TIME_ZONE || DEFAULT_TZ);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function trim(text: string | undefined, max = 4000) {
  const t = String(text || "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function finalize(run: RoutineRun, res: AgentTurnResult, now: Date) {
  run.finishedAt = now.toISOString();
  run.text = trim(res.text);
  run.messageId = res.messageId;
  run.threadId = res.threadId || run.threadId;
  if (res.error) {
    run.status = "failed";
    run.error = trim(res.text, 300) || "The firm model did not answer.";
  } else if (res.approval) {
    run.status = "needs_approval";
    run.approval = { title: res.approval.title, status: res.approval.status };
  } else {
    run.status = "done";
  }
}

function agentQuery(routine: RoutineRecord, hits?: MailHit[]) {
  if (!hits?.length) return routine.prompt;
  const list = hits.slice(0, 3).map((h) => `from ${h.from || "unknown"}, subject “${h.subject}”`).join("; ");
  return `${routine.prompt}\n\nNew email just arrived (${list}).`;
}

type Mutation = (doc: RoutineDoc) => void;

function onRoutine(id: string, fn: (r: RoutineRecord, doc: RoutineDoc) => void): Mutation {
  return (doc) => {
    const r = doc.routines.find((item) => item.id === id);
    if (r) fn(r, doc);
  };
}

/**
 * Start whatever is due for one scope. `manualId` runs that routine now,
 * whatever its schedule.
 */
export async function processScope(scope: string, deps: RunnerDeps, report: TickReport, manualId?: string): Promise<RoutineRun[]> {
  const doc = await loadDoc(scope);
  const now = deps.now();
  const day = localDay(now);
  let agentRuns = doc.usage?.day === day ? doc.usage.agentRuns : 0;
  const mutations: Mutation[] = [];
  const newActive: ActiveRun[] = [];
  const touched: RoutineRun[] = [];

  for (const routine of doc.routines) {
    const manual = manualId === routine.id;
    if (manualId && !manual) continue;
    if (!manual && !routine.enabled) continue;

    let reason: RoutineRun["reason"] | null = manual ? "manual" : null;
    let hits: MailHit[] | undefined;

    if (routine.trigger && (manual || !routine.trigger.lastCheckedAt || now.getTime() - new Date(routine.trigger.lastCheckedAt).getTime() >= TRIGGER_EVERY_MS)) {
      report.checkedTriggers++;
      try {
        const found = await deps.mailSearch(scope, routine.trigger.query, new Set(routine.trigger.seenIds || []));
        if (found === null) {
          mutations.push(onRoutine(routine.id, (r) => r.trigger && (r.trigger.lastCheckedAt = now.toISOString())));
          if (manual) reason = "manual";
          else continue;
        } else {
          const fresh = freshMatches(routine.trigger, found);
          mutations.push(onRoutine(routine.id, (r) => {
            if (!r.trigger) return;
            r.trigger.seenIds = fresh.seenIds;
            r.trigger.primed = fresh.primed;
            r.trigger.lastCheckedAt = now.toISOString();
          }));
          if (fresh.fresh.length) {
            hits = fresh.fresh;
            reason = manual ? "manual" : "email";
          } else if (!manual) continue;
        }
      } catch (err) {
        report.errors.push(`${routine.id}: ${err instanceof Error ? err.message : "mail check failed"}`);
        if (!manual) continue;
      }
    } else if (!manual && !routine.trigger && routine.nextRunAt && routine.nextRunAt <= now.toISOString()) {
      if (routine.lastRunAt && now.getTime() - new Date(routine.lastRunAt).getTime() < (MIN_INTERVAL_MINUTES - 1) * 60_000) {
        mutations.push(onRoutine(routine.id, (r) => (r.nextRunAt = computeNextRun(r, now))));
        continue;
      }
      reason = "schedule";
    }
    if (!reason) continue;

    const run: RoutineRun = { id: newRoutineId("run"), routineId: routine.id, reason, status: "running", startedAt: now.toISOString(), read: false };
    try {
      const threadId = await deps.ensureThread(scope, routine);
      run.threadId = threadId;
      if (routine.mode === "reminder") {
        run.text = `Reminder: ${routine.prompt}`;
        run.messageId = await deps.postMessage(scope, threadId, routine, run.text);
        run.status = "done";
        run.finishedAt = now.toISOString();
        report.posted++;
      } else if (routine.mode === "notify") {
        if (hits?.length) {
          run.text = notifyText(hits);
          run.messageId = await deps.postMessage(scope, threadId, routine, run.text);
          report.posted++;
        } else {
          run.text = routine.trigger ? "No new email matches right now." : "Nothing to report.";
          run.read = true;
        }
        run.status = "done";
        run.finishedAt = now.toISOString();
      } else if (!deps.modelReady()) {
        run.status = "skipped";
        run.error = "The firm model is not set up on this server, so the routine did not run.";
        run.text = run.error;
        run.finishedAt = now.toISOString();
        report.skipped++;
      } else if (agentRuns >= dailyRunCap()) {
        run.status = "skipped";
        run.error = `Daily limit reached (${dailyRunCap()} model runs). It will run again tomorrow.`;
        run.text = run.error;
        run.finishedAt = now.toISOString();
        report.skipped++;
      } else {
        agentRuns++;
        run.usedModel = true;
        const res = await deps.startAgent(scope, routine, agentQuery(routine, hits), threadId);
        report.started++;
        if (res.phase === "wait" && res.state) {
          newActive.push({ runId: run.id, routineId: routine.id, startedAt: now.toISOString(), state: res.state, polls: 0 });
        } else {
          finalize(run, res, deps.now());
          report.finished++;
        }
      }
    } catch (err) {
      run.status = "failed";
      run.error = err instanceof Error ? err.message.slice(0, 300) : "The routine failed.";
      run.finishedAt = deps.now().toISOString();
      report.errors.push(`${routine.id}: ${run.error}`);
    }
    touched.push(run);
    mutations.push(onRoutine(routine.id, (r) => {
      r.threadId = run.threadId || r.threadId;
      if (reason !== "manual" || !r.trigger) r.lastRunAt = now.toISOString();
      if (reason === "schedule" && r.runAt && !r.cron) r.enabled = false;
      r.nextRunAt = computeNextRun(r, now);
      pushRun(r, run);
    }));
  }

  if (!mutations.length && !newActive.length) return touched;
  await updateDoc(scope, (fresh) => {
    for (const m of mutations) m(fresh);
    fresh.active = [...fresh.active, ...newActive.filter((a) => fresh.routines.some((r) => r.id === a.routineId))];
    fresh.usage = { day, agentRuns };
  });
  const done = touched.filter((r) => r.status === "done" && r.messageId).length;
  const approvals = touched.filter((r) => r.status === "needs_approval").length;
  if (approvals) await deps.push(scope, "approval", approvals);
  else if (done) await deps.push(scope, "result", done);
  return touched;
}

/** Poll in-flight model runs for one scope. `rounds` > 1 keeps polling (cron). */
export async function advanceScope(scope: string, deps: RunnerDeps, report: TickReport, opts: { deadline: number; rounds?: number; pollMs?: number }): Promise<number> {
  const rounds = opts.rounds ?? 1;
  for (let round = 0; round < rounds; round++) {
    const doc = await loadDoc(scope);
    const now = deps.now();
    const mine = doc.active.filter((a) => !a.leaseUntil || a.leaseUntil < now.toISOString());
    if (!doc.active.length) return 0;
    if (mine.length) {
      const lease = new Date(now.getTime() + LEASE_MS).toISOString();
      const ids = new Set(mine.map((a) => a.runId));
      await updateDoc(scope, (fresh) => {
        for (const a of fresh.active) if (ids.has(a.runId)) a.leaseUntil = lease;
      });
      const mutations: Mutation[] = [];
      let finishedHere = 0;
      let approvalsHere = 0;
      for (const active of mine) {
        let res: AgentTurnResult;
        const stale = now.getTime() - new Date(active.startedAt).getTime() > STALE_RUN_MS;
        try {
          res = stale
            ? { phase: "done", threadId: active.state.threadId, text: "The firm model did not finish within 30 minutes, so this run stopped.", error: true }
            : await deps.advanceAgent(scope, active.state);
        } catch (err) {
          res = { phase: "done", threadId: active.state.threadId, text: err instanceof Error ? err.message : "The firm model could not be reached.", error: true };
        }
        if (res.phase === "wait" && res.state) {
          const state = res.state;
          mutations.push((fresh) => {
            const a = fresh.active.find((item) => item.runId === active.runId);
            if (a) {
              a.state = state;
              a.polls += 1;
              a.leaseUntil = undefined;
            }
          });
          continue;
        }
        report.finished++;
        finishedHere++;
        if (res.approval) approvalsHere++;
        const at = deps.now();
        mutations.push((fresh) => {
          fresh.active = fresh.active.filter((item) => item.runId !== active.runId);
          const r = fresh.routines.find((item) => item.id === active.routineId);
          const run = r?.runs.find((item) => item.id === active.runId);
          if (r && run) finalize(run, res, at);
        });
      }
      await updateDoc(scope, (fresh) => {
        for (const m of mutations) m(fresh);
      });
      if (approvalsHere) await deps.push(scope, "approval", approvalsHere);
      else if (finishedHere) await deps.push(scope, "result", finishedHere);
    }
    const after = await loadDoc(scope);
    report.active = after.active.length;
    if (!after.active.length) return 0;
    if (round + 1 >= rounds || Date.now() + (opts.pollMs ?? 8000) > opts.deadline) return after.active.length;
    await deps.sleep(opts.pollMs ?? 8000);
  }
  return 0;
}

/** One cron tick: start everything due across scopes, then poll in-flight runs until the deadline. */
export async function runTick(deps: RunnerDeps, opts: { budgetMs?: number; pollMs?: number } = {}): Promise<TickReport> {
  const report = emptyReport();
  if (!routinesEnabled()) return report;
  const startedAt = Date.now();
  const deadline = startedAt + (opts.budgetMs ?? 250_000);
  const index = await loadIndex();
  const now = deps.now();
  const entries = Object.values(index.scopes);
  const due = entries.filter((e) => e.active > 0 || e.triggers > 0 || (e.nextDueAt && e.nextDueAt <= now.toISOString()));
  report.scopes = due.length;
  for (const entry of due) {
    try {
      await processScope(entry.scope, deps, report);
    } catch (err) {
      report.errors.push(`${entry.scope.slice(0, 6)}…: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  // Poll everything in flight together, round-robin, until time is up.
  const scopes = due.map((e) => e.scope);
  for (let round = 0; Date.now() < deadline - 5_000; round++) {
    let remaining = 0;
    for (const scope of scopes) {
      try {
        remaining += await advanceScope(scope, deps, report, { deadline, rounds: 1 });
      } catch (err) {
        report.errors.push(err instanceof Error ? err.message : "advance failed");
      }
    }
    report.active = remaining;
    if (!remaining || Date.now() + (opts.pollMs ?? 8000) > deadline) break;
    await deps.sleep(opts.pollMs ?? 8000);
  }
  return report;
}

/** Production wiring. Imported lazily so tests can run without the harness. */
export async function defaultDeps(): Promise<RunnerDeps> {
  const [live, threadStore, store, chatLive, demo, chat, mail, push] = await Promise.all([
    import("../harness/live.ts"),
    import("../thread-store.ts"),
    import("../store.ts"),
    import("../chat-live.ts"),
    import("../demo.ts"),
    import("../chat.ts"),
    import("./mail-trigger.ts"),
    import("./push.ts"),
  ]);
  const label = (routine: RoutineRecord) => ({ text: `Routine · ${routine.name}` });
  return {
    now: () => new Date(),
    modelReady: () => chatLive.liveRunpodReady() && !demo.demoModeEnabled(),
    ensureThread: async (scope, routine) => {
      if (routine.threadId) {
        const existing = await threadStore.getThreadScoped(scope, routine.threadId);
        if (existing) return existing.id;
      }
      const agent = store.resolveAgent(routine.agentId);
      const thread = await threadStore.createThreadScoped(scope, agent.departmentId, `Routine · ${routine.name}`.slice(0, 60), ROUTINES_AGENT_ID);
      return thread.id;
    },
    postMessage: async (scope, threadId, routine, text) => {
      await threadStore.getThreadScoped(scope, threadId);
      const message = chat.newChatMessage("assistant", text, { done: true, replyTo: label(routine) });
      await threadStore.saveThreadScoped(scope, store.appendThreadMessages(threadId, [message]));
      return message.id;
    },
    startAgent: async (scope, routine, query, threadId) => {
      await threadStore.getThreadScoped(scope, threadId);
      const res = await live.startHarnessTurn({
        query,
        threadId,
        agentId: routine.agentId,
        actor: "routine",
        testerCode: scope,
        agent: true,
        replyTo: label(routine),
      });
      await threadStore.saveThreadScoped(scope, store.getThread(threadId));
      return { phase: res.phase, state: res.state, text: res.text, approval: res.approval, messageId: res.messageId, threadId: res.threadId, error: res.error };
    },
    advanceAgent: async (scope, state) => {
      await threadStore.getThreadScoped(scope, state.threadId);
      const res = await live.advanceHarnessTurn(state);
      if (res.phase === "done") await threadStore.saveThreadScoped(scope, store.getThread(state.threadId));
      return { phase: res.phase, state: res.state, text: res.text, approval: res.approval, messageId: res.messageId, threadId: res.threadId, error: res.error };
    },
    mailSearch: mail.gmailSearchNew,
    push: (scope, kind, count) => push.sendPush(scope, kind, count).catch(() => 0),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
