"use client";

import "./routines.css";
import { useState } from "react";
import type { ApprovalCard } from "@/lib/types";

export interface RoutineEdits {
  name?: string;
  prompt?: string;
  when?: string;
}

/** Chat card for a proposed routine: Save / Edit / Cancel. Nothing is saved until Save. */
export function RoutineProposalCard({
  approval,
  onDecide,
}: {
  approval: ApprovalCard;
  onDecide: (decision: "approved" | "cancelled", edits?: RoutineEdits) => Promise<string | null | void>;
}) {
  const field = (label: string) => approval.inputs.find((row) => row.label === label)?.value || "";
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(field("Name"));
  const [when, setWhen] = useState(approval.call.arguments.when || field("When"));
  const [prompt, setPrompt] = useState(approval.call.arguments.prompt || field("Does"));

  async function act(decision: "approved" | "cancelled") {
    setBusy(true);
    setError("");
    const edits = decision === "approved" && editing ? { name, prompt, when } : undefined;
    const problem = await onDecide(decision, edits);
    setBusy(false);
    if (problem) setError(problem);
    else setEditing(false);
  }

  if (approval.status !== "pending") {
    return (
      <div className="rt-proposal">
        <div className="rt-proposal-kicker">Routine</div>
        <h4>{field("Name")}</h4>
        <p className="rt-proposal-done">
          {approval.status === "approved" ? `Saved · ${field("When")}. Manage it in Routines.` : "Cancelled. No routine was saved."}
        </p>
      </div>
    );
  }

  return (
    <div className="rt-proposal" aria-label="Proposed routine">
      <div className="rt-proposal-kicker">New routine</div>
      {editing ? (
        <>
          <label className="rt-field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="rt-field">
            When
            <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="weekdays at 7am" />
            <span className="rt-hint">Plain English: “fridays at 4pm”, “every Monday at 9”.</span>
          </label>
          <label className="rt-field">
            What it does
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          </label>
        </>
      ) : (
        <>
          <h4>{field("Name")}</h4>
          <dl>
            <dt>When</dt>
            <dd>{field("When")}</dd>
            <dt>Does</dt>
            <dd>{field("Does")}</dd>
            <dt>Model</dt>
            <dd>{field("Model")}</dd>
          </dl>
          {field("Note") ? <p className="rt-note">{field("Note")}</p> : null}
        </>
      )}
      {error ? <p className="rt-error" style={{ marginTop: 8 }}>{error}</p> : null}
      <div className="rt-actions">
        <button type="button" className="rt-btn is-primary" disabled={busy} onClick={() => void act("approved")}>
          Save
        </button>
        {!editing ? (
          <button type="button" className="rt-btn" disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : null}
        <button type="button" className="rt-btn" disabled={busy} onClick={() => void act("cancelled")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
