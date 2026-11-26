import type { HarnessLiveState } from "../harness/live.ts";
import type { RoutineMode } from "./parse.ts";

export type { RoutineMode };

export interface RoutineTrigger {
  type: "email";
  /** Gmail search syntax, e.g. `from:robert "monument sign"`. */
  query: string;
  /** Message ids already seen, newest last (capped). The first check only records. */
  seenIds?: string[];
  primed?: boolean;
  lastCheckedAt?: string;
}

export type RunStatus = "running" | "done" | "failed" | "skipped" | "needs_approval";

export interface RoutineRun {
  id: string;
  routineId: string;
  reason: "schedule" | "email" | "manual";
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  /** Result text as posted to the routine thread (trimmed). */
  text?: string;
  error?: string;
  read: boolean;
  threadId?: string;
  messageId?: string;
  approval?: { title: string; status: "pending" | "approved" | "cancelled" };
  /** True when this run submitted work to the firm model. */
  usedModel?: boolean;
}

/**
 * A saved routine. `schedule` stays a human string so older clients (build 6,
 * the agent info pane) that render it as text keep working.
 */
export interface RoutineRecord {
  id: string;
  scope: string;
  agentId: string;
  name: string;
  prompt: string;
  mode: RoutineMode;
  /** Human label, e.g. "Weekdays at 7:00 AM CT". */
  schedule: string;
  cron?: string;
  runAt?: string;
  timezone: string;
  trigger?: RoutineTrigger;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  /** Dedicated thread where results are posted. */
  threadId?: string;
  source?: "chat" | "screen";
  runs: RoutineRun[];
}

export interface ActiveRun {
  runId: string;
  routineId: string;
  startedAt: string;
  state: HarnessLiveState;
  polls: number;
  /** Set while a tick or a client poll is advancing this run. */
  leaseUntil?: string;
}

export interface RoutineDoc {
  version: 1;
  scope: string;
  routines: RoutineRecord[];
  active: ActiveRun[];
  /** Agent runs started per local day, for the daily cap. */
  usage?: { day: string; agentRuns: number };
  updatedAt: string;
}

export interface RoutineIndexEntry {
  scope: string;
  nextDueAt?: string;
  triggers: number;
  active: number;
  updatedAt: string;
}

export interface RoutineIndex {
  version: 1;
  scopes: Record<string, RoutineIndexEntry>;
}

/** Public shape returned to clients (no harness state, no seen ids). */
export type RoutineView = Omit<RoutineRecord, "trigger" | "scope"> & {
  trigger?: { type: "email"; query: string; lastCheckedAt?: string };
  unread: number;
  usesModel: boolean;
};
