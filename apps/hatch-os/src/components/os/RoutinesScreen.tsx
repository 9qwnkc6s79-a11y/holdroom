"use client";

import { FormEvent, useEffect, useState } from "react";
import { OsShell } from "@/components/os/OsShell";
import { AGENTS } from "@/lib/agents";
import type { Routine } from "@/lib/types";

const SCHEDULES = ["weekdays 07:00", "weekdays 17:00", "mondays 08:00", "daily 09:00"];

export function RoutinesScreen() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/routines", { cache: "no-store" });
    const data = (await res.json()) as { routines?: Routine[]; note?: string };
    setRoutines(data.routines || []);
    setNote(data.note || "");
  }

  useEffect(() => {
    void load().catch(() => setError("Could not load routines."));
  }, []);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    const res = await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") || ""),
        agentId: String(form.get("agentId") || "general"),
        prompt: String(form.get("prompt") || ""),
        schedule: String(form.get("schedule") || SCHEDULES[0]),
      }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string };
    if (!res.ok) {
      setError(data?.error || "Could not save that routine.");
      return;
    }
    event.currentTarget.reset();
    await load();
  }

  async function toggle(routine: Routine) {
    await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...routine, enabled: !routine.enabled }),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/routines?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <OsShell title="Routines" lede="Scheduled prompts, saved on this system. They do not run by themselves yet.">
      <div className="os-page">
        {note ? <p>{note}</p> : null}
        <div className="os-list">
          {routines.map((routine) => {
            const agent = AGENTS.find((item) => item.id === routine.agentId);
            return (
              <article key={routine.id} className="os-row">
                <h3>{routine.name}</h3>
                <p>{routine.prompt}</p>
                <div className="os-meta">
                  <span className="os-tag">{routine.schedule}</span>
                  <span className="os-tag">{agent?.name || routine.agentId}</span>
                  <span className="os-tag">{routine.enabled ? "On" : "Off"}</span>
                  <button className="os-btn-ghost" type="button" onClick={() => void toggle(routine)}>
                    {routine.enabled ? "Pause" : "Resume"}
                  </button>
                  <button className="os-btn-ghost" type="button" onClick={() => void remove(routine.id)}>
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <h2>Add a routine</h2>
        <form className="os-form" onSubmit={onCreate}>
          <label>
            Name
            <input name="name" required placeholder="Morning brief" />
          </label>
          <label>
            Agent
            <select name="agentId" defaultValue="general">
              {AGENTS.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prompt
            <textarea name="prompt" required placeholder="What should the agent prepare?" />
          </label>
          <label>
            Schedule
            <select name="schedule" defaultValue={SCHEDULES[0]}>
              {SCHEDULES.map((schedule) => (
                <option key={schedule}>{schedule}</option>
              ))}
            </select>
          </label>
          {error ? <p className="os-error">{error}</p> : null}
          <button className="os-btn" type="submit">
            Save routine
          </button>
        </form>
      </div>
    </OsShell>
  );
}
