/** Shared helpers for the /api/routines routes. */
import { DEFAULT_TZ, MIN_INTERVAL_MINUTES } from "./cron.ts";
import { parseWhen } from "./parse.ts";
import { MAX_ROUTINES, applyInput, computeNextRun, loadDoc, saveDoc, updateDoc, viewRoutine, type RoutineInput } from "./store.ts";
import { dailyRunCap } from "./runner.ts";
import type { RoutineView } from "./types.ts";

export interface RoutinesPayload {
  routines: RoutineView[];
  unread: number;
  running: number;
  execution: "scheduled";
  limits: { minIntervalMinutes: number; dailyModelRuns: number; maxRoutines: number };
  timezone: string;
}

export async function routinesPayload(scope: string): Promise<RoutinesPayload> {
  const doc = await loadDoc(scope);
  const routines = doc.routines.map(viewRoutine);
  return {
    routines,
    unread: routines.reduce((n, r) => n + r.unread, 0),
    running: doc.active.length,
    execution: "scheduled",
    limits: { minIntervalMinutes: MIN_INTERVAL_MINUTES, dailyModelRuns: dailyRunCap(), maxRoutines: MAX_ROUTINES },
    timezone: process.env.HATCH_TIME_ZONE || DEFAULT_TZ,
  };
}

export type SaveBody = RoutineInput & { when?: string };

export async function saveRoutineInput(scope: string, body: SaveBody, now = new Date()) {
  const input: RoutineInput = { ...body, source: body.source || "screen" };
  if (typeof body.when === "string" && body.when.trim()) {
    const parsed = parseWhen(body.when, { now, timezone: body.timezone || DEFAULT_TZ });
    if (!parsed) return { ok: false as const, error: `I couldn't read “${body.when.trim()}” as a time. Try “weekdays at 7am” or “every Monday at 9”.`, status: 400 };
    input.cron = parsed.cron || "";
    input.runAt = parsed.runAt || "";
    input.triggerQuery = "";
    if (!parsed.cron && !parsed.runAt) return { ok: false as const, error: "Pick when it should run.", status: 400 };
    if (parsed.cron) input.runAt = undefined;
    else input.cron = undefined;
  }
  const doc = await loadDoc(scope);
  const applied = applyInput(doc, input, now);
  if (!applied.ok) return { ok: false as const, error: applied.error, status: applied.status || 400 };
  await saveDoc(doc);
  return { ok: true as const, routine: viewRoutine(applied.routine), created: applied.created };
}

export async function setEnabled(scope: string, id: string, enabled: boolean, now = new Date()) {
  const { result } = await updateDoc(scope, (doc) => {
    const r = doc.routines.find((item) => item.id === id);
    if (!r) return null;
    r.enabled = enabled;
    r.updatedAt = now.toISOString();
    r.nextRunAt = computeNextRun(r, now);
    return viewRoutine(r);
  });
  return result;
}

export async function deleteRoutine(scope: string, id: string) {
  const { result } = await updateDoc(scope, (doc) => {
    const before = doc.routines.length;
    doc.routines = doc.routines.filter((r) => r.id !== id);
    doc.active = doc.active.filter((a) => a.routineId !== id);
    return doc.routines.length !== before;
  });
  return result;
}

export async function markRead(scope: string, routineId?: string, runId?: string) {
  await updateDoc(scope, (doc) => {
    for (const r of doc.routines) {
      if (routineId && r.id !== routineId) continue;
      for (const run of r.runs) if ((!runId || run.id === runId) && run.status !== "running") run.read = true;
    }
  });
}

/** Keep a routine run's approval badge in step with the card in its thread. */
export async function syncRunApproval(scope: string, messageId: string, status: "pending" | "approved" | "cancelled") {
  await updateDoc(scope, (doc) => {
    for (const r of doc.routines) {
      for (const run of r.runs) {
        if (run.messageId === messageId && run.approval) {
          run.approval.status = status;
          if (status !== "pending" && run.status === "needs_approval") run.status = "done";
        }
      }
    }
  });
}
