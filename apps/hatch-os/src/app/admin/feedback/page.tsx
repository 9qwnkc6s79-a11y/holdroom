"use client";

import { FormEvent, useState } from "react";

interface FeedbackItem {
  id?: string;
  text?: string;
  at?: string;
  testerLabel?: string;
  inviteCode?: string;
  page?: string;
  agent?: string;
  version?: string;
  ua?: string;
  errors?: string[];
  screenshot?: string;
}

interface Usage {
  sessions: number;
  messages: number;
  errors: number;
  replies: number;
  latencyMs: number | null;
}

export default function FeedbackAdminPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/admin/feedback", { headers: { "x-hatch-admin": code } });
    const data = (await res.json().catch(() => null)) as { error?: string; feedback?: FeedbackItem[]; usage?: Usage } | null;
    if (!res.ok) {
      setItems(null);
      setUsage(null);
      setError(data?.error || "Could not open feedback.");
      return;
    }
    setItems(data?.feedback || []);
    setUsage(data?.usage || null);
  }

  return (
    <main className="os-gate">
      <div className="os-gate-card" style={{ maxWidth: 720, textAlign: "left" }}>
        <h1>Tester feedback</h1>
        <form className="os-form" onSubmit={onSubmit}>
          <label>Admin code<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" /></label>
          <button className="os-btn" type="submit">Open</button>
        </form>
        {error ? <p className="os-error">{error}</p> : null}
        {usage ? (
          <section className="set-card">
            <p>Sessions {usage.sessions}</p>
            <p>Messages {usage.messages}</p>
            <p>Replies timed {usage.replies}{usage.latencyMs != null ? ` · average ${usage.latencyMs} ms` : ""}</p>
            <p>Errors {usage.errors}</p>
          </section>
        ) : null}
        {items ? items.map((item) => (
          <article key={item.id || item.at} className="set-card">
            <p><strong>{item.testerLabel || item.inviteCode || "Unknown"}</strong> · {item.at}</p>
            <p>{item.text}</p>
            <p className="fine">{item.page} {item.agent ? `· ${item.agent}` : ""} · {item.version}</p>
            {item.errors?.length ? <p className="fine">{item.errors.join(" · ")}</p> : null}
            <p className="fine">{item.ua}</p>
            {item.screenshot ? (
              // Tester uploads are data URLs. next/image does not render those.
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Tester screenshot" src={item.screenshot} style={{ maxWidth: "100%" }} />
            ) : null}
          </article>
        )) : null}
        {items && items.length === 0 ? <p>No feedback yet.</p> : null}
      </div>
    </main>
  );
}
