/** In-flight RunPod turns. The job id only lives in the browser, so a reload must keep it. */

const KEY = "hatch-pending-jobs";

export interface PendingJob {
  assistantId: string;
  agentId: string;
  departmentId: string;
  query: string;
  startedAt: number;
  voice?: boolean;
  state: unknown;
}

export function readPending(): PendingJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PendingJob[]) : [];
    return Array.isArray(parsed) ? parsed.filter((job) => job && job.assistantId && job.state) : [];
  } catch {
    return [];
  }
}

export function writePending(jobs: PendingJob[]) {
  if (typeof window === "undefined") return;
  if (!jobs.length) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, JSON.stringify(jobs));
}

export function upsertPending(job: PendingJob) {
  const rest = readPending().filter((item) => item.assistantId !== job.assistantId);
  writePending([...rest, job]);
}

export function dropPending(assistantId: string) {
  writePending(readPending().filter((item) => item.assistantId !== assistantId));
}

export function waitClock(startedAt: number) {
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function waitCopy(startedAt: number, running: boolean) {
  const clock = waitClock(startedAt);
  if (running) return `The firm model is running. ${clock}`;
  return `Warming up test server… First message after a break can take 2–5 minutes. You can switch apps and come back. ${clock}`;
}
