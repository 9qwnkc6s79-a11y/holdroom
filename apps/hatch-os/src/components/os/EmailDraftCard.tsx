"use client";

import { useEffect, useState } from "react";
import type { EmailDraftCard as EmailDraftCardType } from "@/lib/types";

interface Props {
  draft: EmailDraftCardType;
  threadId: string | null;
  messageId: string;
  onUpdated: (next: EmailDraftCardType) => void;
}

export function EmailDraftCard({ draft, threadId, messageId, onUpdated }: Props) {
  const [to, setTo] = useState(draft.to || "");
  const [subject, setSubject] = useState(draft.subject || "");
  const [body, setBody] = useState(draft.body || "");
  const [busy, setBusy] = useState<"send" | "save_draft" | "discard" | null>(null);
  const [error, setError] = useState("");
  const [needsReconnect, setNeedsReconnect] = useState(false);

  useEffect(() => {
    setTo(draft.to || "");
    setSubject(draft.subject || "");
    setBody(draft.body || "");
  }, [draft.id, draft.to, draft.subject, draft.body]);

  const editable = draft.status === "draft";

  async function act(action: "send" | "save_draft" | "discard") {
    if (busy) return;
    setBusy(action);
    setError("");
    setNeedsReconnect(false);
    try {
      const res = await fetch("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadId || undefined,
          messageId,
          action,
          to,
          subject,
          body,
          draft,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        emailDraft?: EmailDraftCardType;
        error?: string;
        needsReconnect?: boolean;
      } | null;
      if (!res.ok || !data?.ok || !data.emailDraft) {
        setError(data?.error || "Could not complete that action.");
        setNeedsReconnect(Boolean(data?.needsReconnect));
        return;
      }
      onUpdated(data.emailDraft);
    } catch {
      setError("Network error while updating the draft. Your text is still here.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="email-draft-card" role="region" aria-label="Email draft">
      <div className="email-draft-head">
        <strong>Email draft</strong>
        {draft.accountEmail ? <span className="email-draft-acct">via {draft.accountEmail}</span> : null}
      </div>
      <label className="email-draft-field">
        <span>To</span>
        <input
          type="text"
          value={to}
          disabled={!editable || Boolean(busy)}
          placeholder="recipient@example.com"
          onChange={(event) => setTo(event.target.value)}
        />
      </label>
      <label className="email-draft-field">
        <span>Subject</span>
        <input
          type="text"
          value={subject}
          disabled={!editable || Boolean(busy)}
          placeholder="Subject"
          onChange={(event) => setSubject(event.target.value)}
        />
      </label>
      <label className="email-draft-field">
        <span>Message</span>
        <textarea
          rows={6}
          value={body}
          disabled={!editable || Boolean(busy)}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      {error ? (
        <p className="email-draft-error" role="alert">
          {error}
          {needsReconnect ? " (Open Settings → Connect apps → Google to grant send/draft access.)" : ""}
        </p>
      ) : null}
      {editable ? (
        <div className="email-draft-actions">
          <button type="button" disabled={Boolean(busy) || !to.trim() || !body.trim()} onClick={() => void act("send")}>
            {busy === "send" ? "Sending…" : "Send"}
          </button>
          <button type="button" className="ghost" disabled={Boolean(busy) || !body.trim()} onClick={() => void act("save_draft")}>
            {busy === "save_draft" ? "Saving…" : "Save as Gmail draft"}
          </button>
          <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void act("discard")}>
            {busy === "discard" ? "Discarding…" : "Discard"}
          </button>
        </div>
      ) : (
        <p className="email-draft-status">
          {draft.statusNote || (draft.status === "sent" ? "Email sent." : draft.status === "saved" ? "Saved to Gmail drafts." : "Draft discarded.")}
        </p>
      )}
    </div>
  );
}
