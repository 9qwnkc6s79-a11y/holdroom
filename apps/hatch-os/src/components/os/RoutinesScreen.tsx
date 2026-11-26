"use client";

import "./routines.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { IconChevronLeft } from "@/components/os/Icons";
import type { RoutineRun, RoutineView } from "@/lib/routines/types";

interface Payload {
  routines: RoutineView[];
  unread: number;
  running: number;
  limits?: { minIntervalMinutes: number; dailyModelRuns: number; maxRoutines: number };
  timezone?: string;
}

type Kind = "agent" | "reminder" | "notify";
type Trigger = "schedule" | "email";

interface Draft {
  id?: string;
  name: string;
  prompt: string;
  mode: Kind;
  trigger: Trigger;
  when: string;
  triggerQuery: string;
  cron: string;
}

const EMPTY: Draft = { name: "", prompt: "", mode: "agent", trigger: "schedule", when: "weekdays at 7am", triggerQuery: "", cron: "" };

function whenShort(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function runLabel(run: RoutineRun) {
  if (run.status === "running") return "Working…";
  if (run.status === "needs_approval") return run.approval?.status === "pending" ? "Needs your approval" : "Done";
  if (run.status === "failed") return "Didn't finish";
  if (run.status === "skipped") return "Skipped";
  return run.reason === "email" ? "New email" : run.reason === "manual" ? "Ran now" : "Done";
}

export function RoutinesScreen() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const polling = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/routines", { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 ? "Sign in again to see your routines." : "Could not load routines.");
      return;
    }
    setError("");
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While a model run is in flight, poll like the chat does.
  useEffect(() => {
    if (!data?.running || polling.current) return;
    polling.current = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/routines/advance", { method: "POST" });
        if (res.ok) setData((await res.json()) as Payload);
      } finally {
        polling.current = false;
      }
    }, 5000);
    return () => {
      clearTimeout(timer);
      polling.current = false;
    };
  }, [data]);

  const results = useMemo(() => {
    const rows = (data?.routines || []).flatMap((routine) => (routine.runs || []).map((run) => ({ run, routine })));
    return rows
      .filter(({ run }) => run.text || run.status === "running")
      .sort((a, b) => (a.run.startedAt < b.run.startedAt ? 1 : -1))
      .slice(0, 12);
  }, [data]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/routines", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = (await res.json().catch(() => null)) as (Payload & { error?: string }) | null;
    if (!res.ok) throw new Error(out?.error || "Could not update that routine.");
    return out;
  }

  async function toggle(routine: RoutineView) {
    setBusy(routine.id);
    try {
      await patch({ id: routine.id, enabled: !routine.enabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that routine.");
    } finally {
      setBusy("");
    }
  }

  async function remove(routine: RoutineView) {
    if (!window.confirm(`Delete “${routine.name}”? Its past results stay in its thread.`)) return;
    setBusy(routine.id);
    await fetch(`/api/routines?id=${encodeURIComponent(routine.id)}`, { method: "DELETE" });
    setBusy("");
    await load();
  }

  async function runNow(routine: RoutineView) {
    if (routine.usesModel && !window.confirm("Run it now? This uses the firm model and can wake the GPU if it is asleep (2–5 minutes).")) return;
    setBusy(routine.id);
    try {
      const res = await fetch("/api/routines/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: routine.id }) });
      const out = (await res.json().catch(() => null)) as (Payload & { error?: string }) | null;
      if (!res.ok || !out) throw new Error(out?.error || "Could not run that routine.");
      setData(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run that routine.");
    } finally {
      setBusy("");
    }
  }

  async function markRead(runId?: string, routineId?: string) {
    const out = await patch({ action: "read", runId, id: routineId }).catch(() => null);
    if (out) setData(out);
  }

  async function decide(run: RoutineRun, decision: "approved" | "cancelled") {
    if (!run.threadId || !run.messageId) return;
    setBusy(run.id);
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: run.threadId, messageId: run.messageId, decision, actor: "Routines" }),
    });
    const out = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) setError(out?.error || "Could not record that decision.");
    setBusy("");
    await load();
  }

  function openEditor(routine?: RoutineView) {
    setFormError("");
    if (!routine) {
      setEditing({ ...EMPTY });
      return;
    }
    setEditing({
      id: routine.id,
      name: routine.name,
      prompt: routine.prompt,
      mode: routine.mode,
      trigger: routine.trigger ? "email" : "schedule",
      when: routine.trigger ? "weekdays at 7am" : routine.schedule.replace(/\s+(CT|ET|MT|PT|MST|UTC)$/, ""),
      triggerQuery: routine.trigger?.query || "",
      cron: routine.cron || "",
    });
  }

  async function save() {
    if (!editing) return;
    setFormError("");
    const original = data?.routines.find((r) => r.id === editing.id);
    const body: Record<string, unknown> = { id: editing.id, name: editing.name, prompt: editing.prompt, mode: editing.trigger === "schedule" && editing.mode === "notify" ? "agent" : editing.mode };
    if (editing.trigger === "email") {
      body.triggerQuery = editing.triggerQuery;
      body.cron = "";
    } else if (editing.cron.trim() && editing.cron.trim() !== (original?.cron || "")) {
      body.cron = editing.cron.trim();
      body.triggerQuery = "";
    } else if (!original || original.trigger || editing.when.trim() !== original.schedule.replace(/\s+(CT|ET|MT|PT|MST|UTC)$/, "")) {
      body.when = editing.when;
    }
    const res = await fetch("/api/routines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setFormError(out?.error || "Could not save that routine.");
      return;
    }
    setEditing(null);
    await load();
  }

  const routines = data?.routines || [];

  return (
    <main className="rt-shell">
      <header className="rt-head">
        <button type="button" className="round" aria-label="Back to chat" onClick={() => router.push("/chat")}>
          <IconChevronLeft />
        </button>
        <h1>Routines</h1>
        <button type="button" className="rt-btn is-primary" onClick={() => openEditor()}>
          New routine
        </button>
      </header>
      <p className="rt-lede">
        Saved asks that run on a schedule or when an email arrives. Results land here and in the routine’s thread.
        Anything that would send or change something waits for your approval. You can also just say “remind me every Monday to…” in chat.
      </p>
      {error ? <p className="rt-error">{error}</p> : null}

      <p className="rt-kicker">
        <span>Results{data?.unread ? ` · ${data.unread} new` : ""}</span>
        {data?.unread ? (
          <button type="button" onClick={() => void markRead()}>
            Mark all read
          </button>
        ) : null}
      </p>
      {results.length ? (
        <div className="rt-card">
          {results.map(({ run, routine }) => (
            <article key={run.id} className="rt-result" onClick={() => (!run.read && run.status !== "running" ? void markRead(run.id, routine.id) : undefined)}>
              <div className="rt-result-head">
                <span className={`rt-dot${run.read || run.status === "running" ? " is-read" : ""}`} aria-label={run.read ? "Read" : "Unread"} />
                <strong>{routine.name}</strong>
                <span>· {whenShort(run.finishedAt || run.startedAt)}</span>
                <span className={`rt-status${run.status === "running" ? " is-wait" : ""}`}>· {runLabel(run)}</span>
              </div>
              {run.status === "running" ? (
                <p className="rt-result-body rt-sub">The firm model is working on it. If it was asleep this can take 2–5 minutes.</p>
              ) : run.text ? (
                <div className="rt-result-body">
                  <div className="bubble">
                    <MarkdownPreview text={run.text.slice(0, 4000)} />
                  </div>
                </div>
              ) : null}
              {run.approval ? (
                <div className="rt-approval">
                  <strong>{run.approval.title}</strong>
                  {run.approval.status === "pending" ? (
                    <div className="rt-actions">
                      <button type="button" className="rt-btn is-primary" disabled={busy === run.id} onClick={(e) => { e.stopPropagation(); void decide(run, "approved"); }}>
                        Approve
                      </button>
                      <button type="button" className="rt-btn" disabled={busy === run.id} onClick={(e) => { e.stopPropagation(); void decide(run, "cancelled"); }}>
                        Deny
                      </button>
                    </div>
                  ) : (
                    <span className="rt-sub">{run.approval.status === "approved" ? "Approved" : "Denied"}</span>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="rt-empty">{data ? "No results yet. When a routine runs, what it found shows up here." : "Loading…"}</p>
      )}

      <p className="rt-kicker">
        <span>Your routines{routines.length ? ` (${routines.length})` : ""}</span>
      </p>
      {routines.length ? (
        <div className="rt-card">
          {routines.map((routine) => (
            <article key={routine.id} className="rt-row">
              <div className="rt-row-top">
                <div className="rt-row-main">
                  <strong>{routine.name}</strong>
                  <span className="rt-sub">{routine.schedule}</span>
                  <p className="rt-prompt">{routine.prompt}</p>
                  <div className="rt-chips">
                    <span className={`rt-chip${routine.usesModel ? " is-model" : ""}`}>{routine.usesModel ? "Firm model" : routine.mode === "reminder" ? "Reminder · no model" : "Email alert · no model"}</span>
                    {!routine.enabled ? <span className="rt-chip is-off">Paused</span> : null}
                    {routine.enabled && routine.nextRunAt ? <span className="rt-chip">Next {whenShort(routine.nextRunAt)}</span> : null}
                    {routine.trigger?.lastCheckedAt ? <span className="rt-chip">Checked {whenShort(routine.trigger.lastCheckedAt)}</span> : null}
                    {routine.lastRunAt ? <span className="rt-chip">Last ran {whenShort(routine.lastRunAt)}</span> : null}
                  </div>
                </div>
                <button
                  type="button"
                  className="rt-toggle"
                  role="switch"
                  aria-checked={routine.enabled}
                  aria-label={routine.enabled ? `Pause ${routine.name}` : `Resume ${routine.name}`}
                  disabled={busy === routine.id}
                  onClick={() => void toggle(routine)}
                />
              </div>
              <div className="rt-actions">
                <button type="button" className="rt-btn" disabled={busy === routine.id} onClick={() => void runNow(routine)}>
                  Run now
                </button>
                <button type="button" className="rt-btn" onClick={() => openEditor(routine)}>
                  Edit
                </button>
                <button type="button" className="rt-btn is-danger" disabled={busy === routine.id} onClick={() => void remove(routine)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rt-empty">
          {data ? "No routines yet. Tap New routine, or tell Hatch in chat: “every weekday at 7am brief me on open vendor threads.”" : ""}
        </p>
      )}
      {data?.limits ? (
        <p className="rt-empty" style={{ fontSize: 12 }}>
          Routines run at most every {data.limits.minIntervalMinutes} minutes. Up to {data.limits.dailyModelRuns} firm-model runs a day. Reminders and email alerts don’t use the model.
        </p>
      ) : null}

      {editing ? (
        <div className="rt-modal" role="presentation" onClick={() => setEditing(null)}>
          <form
            className="rt-sheet"
            role="dialog"
            aria-label={editing.id ? "Edit routine" : "New routine"}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h2>{editing.id ? "Edit routine" : "New routine"}</h2>
            <label className="rt-field">
              Name
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Morning vendor brief" />
            </label>
            <label className="rt-field">
              What should Hatch do?
              <textarea value={editing.prompt} required onChange={(e) => setEditing({ ...editing, prompt: e.target.value })} placeholder="Brief me on open vendor threads: who is waiting on whom, and anything due this week." />
            </label>
            <div className="rt-field">
              Runs
              <div className="rt-seg">
                <button type="button" aria-pressed={editing.trigger === "schedule"} onClick={() => setEditing({ ...editing, trigger: "schedule", mode: editing.mode === "notify" ? "agent" : editing.mode })}>
                  On a schedule
                  <small>Every weekday, every Monday…</small>
                </button>
                <button type="button" aria-pressed={editing.trigger === "email"} onClick={() => setEditing({ ...editing, trigger: "email", mode: editing.mode === "reminder" ? "notify" : editing.mode })}>
                  When an email arrives
                  <small>Checked every 15 minutes</small>
                </button>
              </div>
            </div>
            {editing.trigger === "schedule" ? (
              <>
                <label className="rt-field">
                  When
                  <input value={editing.when} onChange={(e) => setEditing({ ...editing, when: e.target.value, cron: "" })} placeholder="weekdays at 7am" />
                  <span className="rt-hint">Plain English works: “weekdays at 7am”, “every Monday at 9”, “tomorrow at 3pm”, “every 2 hours”.</span>
                </label>
                <details className="rt-field">
                  <summary>Advanced: cron</summary>
                  <input value={editing.cron} onChange={(e) => setEditing({ ...editing, cron: e.target.value })} placeholder="0 7 * * 1-5" />
                  <span className="rt-hint">Minute hour day month weekday, in {data?.timezone || "America/Chicago"}. At most every 15 minutes.</span>
                </details>
              </>
            ) : (
              <label className="rt-field">
                Email to watch for
                <input value={editing.triggerQuery} onChange={(e) => setEditing({ ...editing, triggerQuery: e.target.value })} placeholder='from:robert "monument sign"' />
                <span className="rt-hint">Gmail search. Only new mail counts; what is already in the inbox is skipped.</span>
              </label>
            )}
            <div className="rt-field">
              What happens
              <div className="rt-seg">
                <button type="button" aria-pressed={editing.mode === "agent"} onClick={() => setEditing({ ...editing, mode: "agent" })}>
                  Hatch works on it
                  <small>Uses the firm model</small>
                </button>
                {editing.trigger === "schedule" ? (
                  <button type="button" aria-pressed={editing.mode === "reminder"} onClick={() => setEditing({ ...editing, mode: "reminder" })}>
                    Just remind me
                    <small>No model</small>
                  </button>
                ) : (
                  <button type="button" aria-pressed={editing.mode === "notify"} onClick={() => setEditing({ ...editing, mode: "notify" })}>
                    Just tell me who wrote
                    <small>No model</small>
                  </button>
                )}
              </div>
            </div>
            {formError ? <p className="rt-error">{formError}</p> : null}
            <div className="rt-sheet-actions">
              <button type="button" className="rt-btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="rt-btn is-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
