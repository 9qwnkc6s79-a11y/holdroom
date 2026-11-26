/**
 * Activity events: what the Hatch agent is doing right now.
 *
 * The server attaches these to every chat poll response as `activity`
 * (full list, oldest first) and `status` (the one line to show at the
 * bottom of the chat, above the composer). The UI does not need to
 * understand tool names. Schema is documented in docs/AGENT_HARNESS.md.
 */

export type ActivityKind =
  | "understanding" // reading the ask, matching names from firm memory
  | "searching" // running a search against a source
  | "retrying" // a search came back empty, trying different words
  | "reading" // opening a full email thread, file, or event
  | "thinking" // the firm model is working (model job running)
  | "waking" // the model server is cold-starting
  | "writing" // the final answer is being written
  | "remembering" // saving a fact to firm memory
  | "waiting_approval" // a write is held for a person to approve
  | "done"
  | "error";

export type ActivitySource =
  | "gmail"
  | "outlook"
  | "mail"
  | "drive"
  | "onedrive"
  | "calendar"
  | "library"
  | "slack"
  | "notion"
  | "github"
  | "linear"
  | "memory"
  | "model";

export interface ActivityEvent {
  /** Stable within one turn, e.g. "a3". */
  id: string;
  kind: ActivityKind;
  /** Short, human, present tense. Safe to show as-is. Never contains secrets. */
  label: string;
  source?: ActivitySource;
  /** active = in progress, done = finished, failed = finished with nothing / error. */
  status: "active" | "done" | "failed";
  /** Optional count of results found or items read. */
  count?: number;
  /** Epoch ms. */
  at: number;
}

export interface ActivityLog {
  events: ActivityEvent[];
  seq: number;
}

export function newActivityLog(): ActivityLog {
  return { events: [], seq: 0 };
}

export function pushActivity(
  log: ActivityLog,
  event: Omit<ActivityEvent, "id" | "at" | "status"> & { status?: ActivityEvent["status"] },
  now = Date.now(),
): ActivityEvent {
  // Close any still-active event of the same kind/source so the status line moves forward.
  for (const prior of log.events) {
    if (prior.status === "active") prior.status = "done";
  }
  log.seq += 1;
  const full: ActivityEvent = { status: "active", ...event, id: `a${log.seq}`, at: now, label: event.label.slice(0, 120) };
  log.events.push(full);
  if (log.events.length > 40) log.events.splice(0, log.events.length - 40);
  return full;
}

export function settleActivity(log: ActivityLog, status: "done" | "failed" = "done", count?: number) {
  const last = [...log.events].reverse().find((event) => event.status === "active");
  if (!last) return;
  last.status = status;
  if (typeof count === "number") last.count = count;
}

/** The single status line for the bottom of the chat. */
export function statusLine(log: ActivityLog): string {
  const active = [...log.events].reverse().find((event) => event.status === "active");
  return (active || log.events[log.events.length - 1])?.label || "";
}

export const SOURCE_LABEL: Record<ActivitySource, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  mail: "email",
  drive: "Drive",
  onedrive: "OneDrive",
  calendar: "your calendar",
  library: "the firm library",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
  linear: "Linear",
  memory: "firm memory",
  model: "the firm model",
};
