/**
 * Routine persistence. One JSON doc per session scope in Vercel Blob
 * (`hatch-beta/routines/<scope>/doc.json`, local files in dev/tests) plus a
 * tiny index (`routines-index/index.json`) so the cron tick reads one object
 * when nothing is due.
 */
import { randomBytes } from "node:crypto";
import { readRecord, saveRecord } from "../beta-store.ts";
import { safeCode } from "../testers.ts";
import { DEFAULT_TZ, MIN_INTERVAL_MINUTES, describeCron, formatWhen, nextRun, validTimeZone, validateCron } from "./cron.ts";
import type { RoutineDoc, RoutineIndex, RoutineMode, RoutineRecord, RoutineRun, RoutineView } from "./types.ts";

export const MAX_ROUTINES = Number(process.env.HATCH_ROUTINES_MAX || 25);
export const MAX_RUNS_KEPT = 20;
const INDEX_FOLDER = "routines-index";

export function scopeFolder(scope: string) {
  return `routines/${safeCode(scope || "staff")}`;
}

export function newRoutineId(prefix = "rt") {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

export function emptyDoc(scope: string): RoutineDoc {
  return { version: 1, scope, routines: [], active: [], updatedAt: new Date().toISOString() };
}

export async function loadDoc(scope: string): Promise<RoutineDoc> {
  const doc = await readRecord<RoutineDoc>(scopeFolder(scope), "doc");
  if (!doc || doc.version !== 1 || !Array.isArray(doc.routines)) return emptyDoc(scope);
  return { ...doc, scope, active: Array.isArray(doc.active) ? doc.active : [] };
}

export async function loadIndex(): Promise<RoutineIndex> {
  const index = await readRecord<RoutineIndex>(INDEX_FOLDER, "index");
  return index?.version === 1 && index.scopes ? index : { version: 1, scopes: {} };
}

/** Earliest pending schedule across a scope's routines. */
export function docNextDue(doc: RoutineDoc): string | undefined {
  const times = doc.routines
    .filter((r) => r.enabled && r.nextRunAt)
    .map((r) => r.nextRunAt as string)
    .sort();
  return times[0];
}

export async function saveDoc(doc: RoutineDoc): Promise<RoutineDoc> {
  doc.updatedAt = new Date().toISOString();
  await saveRecord(scopeFolder(doc.scope), "doc", doc);
  const index = await loadIndex();
  const key = safeCode(doc.scope || "staff");
  const triggers = doc.routines.filter((r) => r.enabled && r.trigger).length;
  const nextDueAt = docNextDue(doc);
  if (!doc.routines.length && !doc.active.length) delete index.scopes[key];
  else index.scopes[key] = { scope: doc.scope, nextDueAt, triggers, active: doc.active.length, updatedAt: doc.updatedAt };
  await saveRecord(INDEX_FOLDER, "index", index);
  return doc;
}

/** Read-modify-write on a fresh copy, so a tick and a user edit rarely clobber each other. */
export async function updateDoc<T>(scope: string, fn: (doc: RoutineDoc) => T | Promise<T>): Promise<{ doc: RoutineDoc; result: T }> {
  const doc = await loadDoc(scope);
  const result = await fn(doc);
  await saveDoc(doc);
  return { doc, result };
}

export function computeNextRun(routine: Pick<RoutineRecord, "enabled" | "cron" | "runAt" | "timezone" | "lastRunAt" | "trigger">, now = new Date()): string | undefined {
  if (!routine.enabled) return undefined;
  if (routine.trigger) return undefined;
  if (routine.cron) {
    const floor = routine.lastRunAt ? new Date(Math.max(now.getTime(), new Date(routine.lastRunAt).getTime() + (MIN_INTERVAL_MINUTES - 1) * 60_000)) : now;
    return nextRun(routine.cron, floor, routine.timezone || DEFAULT_TZ)?.toISOString();
  }
  if (routine.runAt && !routine.lastRunAt) return routine.runAt;
  return undefined;
}

export interface RoutineInput {
  id?: string;
  agentId?: string;
  name?: string;
  prompt?: string;
  mode?: RoutineMode | string;
  cron?: string;
  /** Legacy/human schedule strings: "weekdays 07:00", "mondays 08:00", "daily 09:00". */
  schedule?: string;
  runAt?: string;
  timezone?: string;
  triggerQuery?: string;
  enabled?: boolean;
  source?: "chat" | "screen";
}

const LEGACY_DAYS: Record<string, string> = {
  weekdays: "1-5", weekday: "1-5", daily: "*", everyday: "*", weekends: "0,6",
  sundays: "0", mondays: "1", tuesdays: "2", wednesdays: "3", thursdays: "4", fridays: "5", saturdays: "6",
};

/** "weekdays 07:00" → "0 7 * * 1-5". */
export function legacyScheduleToCron(schedule: string): string | null {
  const m = String(schedule || "").trim().toLowerCase().match(/^([a-z]+)\s+(\d{1,2}):(\d{2})$/);
  if (!m || !(m[1] in LEGACY_DAYS)) return null;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (hour > 23 || minute > 59) return null;
  return `${minute} ${hour} * * ${LEGACY_DAYS[m[1]]}`;
}

function clean(text: unknown, max: number) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isoOrRaw(value: unknown) {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function cleanPrompt(text: unknown) {
  return String(text ?? "").trim().slice(0, 2000);
}

/** Validate and apply input to a new or existing routine. Does not save. */
export function applyInput(
  doc: RoutineDoc,
  input: RoutineInput,
  now = new Date(),
): { ok: true; routine: RoutineRecord; created: boolean } | { ok: false; error: string; status?: number } {
  const existing = input.id ? doc.routines.find((r) => r.id === input.id) : undefined;
  if (input.id && !existing) return { ok: false, error: "Unknown routine.", status: 404 };
  if (!existing && doc.routines.length >= MAX_ROUTINES) return { ok: false, error: `You can keep up to ${MAX_ROUTINES} routines. Delete one first.` };
  const prompt = input.prompt !== undefined ? cleanPrompt(input.prompt) : existing?.prompt || "";
  if (!prompt) return { ok: false, error: "Write what the routine should do." };
  const timezone = clean(input.timezone, 64) || existing?.timezone || DEFAULT_TZ;
  if (!validTimeZone(timezone)) return { ok: false, error: `Unknown time zone “${timezone}”.` };
  const mode: RoutineMode = input.mode === "reminder" || input.mode === "notify" || input.mode === "agent" ? input.mode : existing?.mode || "agent";

  let cron = existing?.cron;
  let runAt = existing?.runAt;
  let trigger = existing?.trigger;
  const differs = (value: unknown, current: unknown) => value !== undefined && clean(value, 300) !== clean(current, 300);
  const scheduleTouched = existing
    ? differs(input.cron, existing.cron) ||
      differs(input.triggerQuery, existing.trigger?.query) ||
      (input.runAt !== undefined && clean(input.runAt, 64) !== "" && isoOrRaw(input.runAt) !== existing.runAt) ||
      differs(input.schedule, existing.schedule)
    : input.cron !== undefined || input.schedule !== undefined || input.runAt !== undefined || input.triggerQuery !== undefined;
  if (scheduleTouched) {
    cron = undefined;
    runAt = undefined;
    trigger = undefined;
    const triggerQuery = clean(input.triggerQuery, 300);
    if (triggerQuery) {
      trigger = existing?.trigger?.query === triggerQuery ? existing.trigger : { type: "email", query: triggerQuery };
    } else if (clean(input.cron, 120)) {
      cron = clean(input.cron, 120);
    } else if (clean(input.runAt, 64)) {
      const at = new Date(String(input.runAt));
      if (Number.isNaN(at.getTime())) return { ok: false, error: "That date and time is not valid." };
      if (at.getTime() < now.getTime() - 60_000) return { ok: false, error: "That time has already passed." };
      runAt = at.toISOString();
    } else if (clean(input.schedule, 120)) {
      const legacy = legacyScheduleToCron(clean(input.schedule, 120));
      const raw = clean(input.schedule, 120);
      cron = legacy || (raw.split(/\s+/).length === 5 ? raw : undefined);
      if (!cron) return { ok: false, error: "Pick when it should run." };
    }
  }
  if (!cron && !runAt && !trigger) return { ok: false, error: "Pick when it should run, or an email to watch for." };
  if (cron) {
    const valid = validateCron(cron, timezone);
    if (!valid.ok) return { ok: false, error: valid.error };
  }
  if (mode === "notify" && !trigger) return { ok: false, error: "Notify-only routines need an email to watch for." };

  const at = now.toISOString();
  const name = clean(input.name, 80) || existing?.name || prompt.slice(0, 48);
  const routine: RoutineRecord = {
    ...(existing || {
      id: newRoutineId(),
      scope: doc.scope,
      createdAt: at,
      runs: [],
    }),
    scope: doc.scope,
    agentId: clean(input.agentId, 60) || existing?.agentId || "general",
    name,
    prompt,
    mode,
    cron,
    runAt,
    timezone,
    trigger,
    enabled: input.enabled ?? existing?.enabled ?? true,
    updatedAt: at,
    source: existing?.source || input.source,
    schedule: "",
  } as RoutineRecord;
  if (scheduleTouched && routine.runAt) routine.lastRunAt = undefined;
  routine.schedule = scheduleLabel(routine);
  routine.nextRunAt = computeNextRun(routine, now);
  if (existing) doc.routines = doc.routines.map((r) => (r.id === routine.id ? routine : r));
  else doc.routines.unshift(routine);
  return { ok: true, routine, created: !existing };
}

export function scheduleLabel(r: Pick<RoutineRecord, "cron" | "runAt" | "trigger" | "timezone">): string {
  if (r.trigger) return `When a new email matches ${r.trigger.query}`;
  if (r.cron) return describeCron(r.cron, r.timezone);
  if (r.runAt) return `Once, ${formatWhen(r.runAt, r.timezone)}`;
  return "Not scheduled";
}

export function pushRun(routine: RoutineRecord, run: RoutineRun) {
  routine.runs = [run, ...(routine.runs || []).filter((r) => r.id !== run.id)].slice(0, MAX_RUNS_KEPT);
}

export function viewRoutine(r: RoutineRecord): RoutineView {
  const { trigger, scope: _scope, ...rest } = r;
  void _scope;
  return {
    ...rest,
    trigger: trigger ? { type: "email", query: trigger.query, lastCheckedAt: trigger.lastCheckedAt } : undefined,
    unread: (r.runs || []).filter((run) => !run.read && run.status !== "running").length,
    usesModel: r.mode === "agent",
  };
}
