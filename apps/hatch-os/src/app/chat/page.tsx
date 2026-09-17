"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useHatch } from "@/components/AppProvider";
import { MicIcon, SendIcon } from "@/components/Icons";
import { Shell } from "@/components/Shell";
import { SourcesList } from "@/components/SourcesList";
import { HQ_OPS, LITTLE_ELM, PROSPER, workspaceLabel } from "@/lib/departments";

export default function ChatPage() {
  const {
    currentWorkspace,
    currentWorkspaceId,
    isEnterpriseView,
    visibleThreads,
    currentThread,
    currentThreadId,
    streaming,
    inboundHandoffs,
    session,
    ask,
    newThread,
    selectThread,
    renameThread,
    archiveThread,
    handoffToDepartment,
  } = useHatch();
  const [openSources, setOpenSources] = useState<string | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffTo, setHandoffTo] = useState(HQ_OPS);
  const [handoffSummary, setHandoffSummary] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = currentThread?.messages;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  function send(query: string) {
    const q = query.trim();
    if (!q || streaming) return;
    void ask(q);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(String(new FormData(event.currentTarget).get("q") || ""));
  }

  const prompts =
    currentWorkspaceId === LITTLE_ELM
      ? [
          ["What is the Little Elm open/close checklist?", "Open / close"],
          ["How does loyalty work — TapMango or text COFFEE?", "Loyalty"],
          ["What is the catering protocol?", "Catering"],
          ["Who is the GM at Little Elm?", "GM"],
          ["Who runs Prosper?", "Firm-wide (Prosper)"],
        ]
      : currentWorkspaceId === PROSPER
        ? [
            ["Who is the GM at Prosper?", "GM"],
            ["How does loyalty work — TapMango or text COFFEE?", "Loyalty"],
            ["What is the Prosper open/close checklist?", "Open / close"],
            ["Who runs Little Elm?", "Firm-wide (Little Elm)"],
          ]
        : currentWorkspaceId === HQ_OPS
          ? [
              ["Summarize the DEMO catering protocol.", "Catering"],
              ["What are the TapMango loyalty tiers?", "Loyalty tiers"],
              ["Who runs Little Elm and Prosper?", "GM roster"],
              ["Draft a note for Little Elm about catering.", "Write draft (ACL)"],
            ]
          : [
              ["How does loyalty work across stores?", "Loyalty (firm)"],
              ["Who runs Little Elm and Prosper?", "GM roster"],
              ["List files in HQ Ops.", "List HQ files"],
            ];

  const targets = [LITTLE_ELM, PROSPER, HQ_OPS].filter((id) => id !== currentWorkspaceId);

  return (
    <Shell stageClass="stage-ask stage-chat">
      <aside className="thread-rail" aria-label="Threads">
        <div className="thread-rail-head">
          <p className="screen-kicker">Threads</p>
          <button className="btn btn-dark btn-tiny" type="button" onClick={() => void newThread()}>
            New thread
          </button>
        </div>
        {!visibleThreads.length ? (
          <p className="fine">No threads yet. Send a message to start one.</p>
        ) : (
          <ul className="thread-list">
            {visibleThreads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  className={`thread-item${thread.id === currentThreadId ? " is-on" : ""}`}
                  onClick={() => selectThread(thread.id)}
                >
                  {thread.title}
                </button>
                <div className="thread-actions">
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      const title = window.prompt("Rename thread", thread.title);
                      if (title) renameThread(thread.id, title);
                    }}
                  >
                    Rename
                  </button>
                  <button type="button" className="linkish" onClick={() => archiveThread(thread.id)}>
                    Archive
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="panel chat-panel">
        {!messages?.length ? (
          <div className="empty-ask">
            <p className="screen-kicker">Chat · {currentWorkspace.name}</p>
            <h1>{isEnterpriseView ? "Ask the firm." : `Ask from ${currentWorkspace.name}.`}</h1>
            <p className="lede">
              This workspace is UX context. Answers may use the firm-wide Library. Writes stay in
              departments you can open{session ? ` (${session.departments.map(workspaceLabel).join(", ") || "none"})` : ""}.
            </p>
            <div className="tip">
              {currentWorkspace.isolation} Department Chat is not an LLM firewall.
            </div>
            {inboundHandoffs.length ? (
              <div className="card" style={{ marginTop: 16, textAlign: "left" }}>
                <h2>Inbound handoffs</h2>
                {inboundHandoffs.slice(0, 3).map((h) => (
                  <p className="fine" key={h.id}>
                    From {workspaceLabel(h.fromDepartmentId)} → {workspaceLabel(h.toDepartmentId)}: {h.summary}
                    {h.facts ? ` — ${h.facts}` : ""} ({h.status})
                  </p>
                ))}
              </div>
            ) : null}
            <div className="prompts">
              {prompts.map(([q, label]) => (
                <button key={label} className="prompt" type="button" onClick={() => send(q)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="thread" aria-live="polite">
            {(messages || []).map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="bubble bubble-user">
                  <p>{m.text}</p>
                </div>
              ) : (
                <div key={m.id} className="bubble bubble-ai">
                  <p className="bubble-text">
                    {m.text}
                    {!m.done ? <span className="cursor" /> : null}
                  </p>
                  {m.tools?.length ? (
                    <div className="tool-chips">
                      {m.tools.map((t, i) => (
                        <span key={`${t.name}-${i}`} className={`pill ${t.ok ? "pill-ok" : "pill-warn"}`}>
                          {t.name}
                          {t.departmentId ? ` · ${workspaceLabel(t.departmentId)}` : ""} — {t.detail}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {m.done ? (
                    <div className="bubble-meta">
                      <button
                        className="sources-toggle"
                        type="button"
                        onClick={() => setOpenSources((id) => (id === m.id ? null : m.id))}
                      >
                        Sources · {m.sources.length ? m.sources.length : "none retrieved"}
                      </button>
                      <span className="fine">
                        {m.sources.length ? "Firm-wide library" : "No library hit"}
                      </span>
                    </div>
                  ) : null}
                  {m.done && openSources === m.id ? <SourcesList sources={m.sources} /> : null}
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
        )}
        <div className="chat-toolbar">
          <button className="btn btn-ghost btn-tiny" type="button" onClick={() => void newThread()}>
            New thread
          </button>
          <button className="btn btn-ghost btn-tiny" type="button" onClick={() => setHandoffOpen((v) => !v)}>
            Handoff
          </button>
        </div>
        {handoffOpen ? (
          <form
            className="card handoff-card"
            onSubmit={(e) => {
              e.preventDefault();
              const summary = handoffSummary.trim();
              if (!summary) return;
              void handoffToDepartment(handoffTo, summary);
              setHandoffSummary("");
              setHandoffOpen(false);
            }}
          >
            <p className="screen-kicker">Handoff stub</p>
            <p className="fine">
              Notify a peer department. They learn the ask — no silent write into their Files.
            </p>
            <label htmlFor="handoff-to">To department</label>
            <select
              id="handoff-to"
              value={handoffTo}
              onChange={(e) => setHandoffTo(e.target.value)}
            >
              {targets.map((id) => (
                <option key={id} value={id}>
                  {workspaceLabel(id)}
                </option>
              ))}
            </select>
            <label htmlFor="handoff-summary">Summary</label>
            <input
              id="handoff-summary"
              value={handoffSummary}
              onChange={(e) => setHandoffSummary(e.target.value)}
              placeholder="Please review catering dates"
              required
            />
            <div className="btn-row">
              <button className="btn btn-dark" type="submit">
                Send handoff
              </button>
            </div>
          </form>
        ) : null}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <div className="composer-box">
          <textarea
            ref={inputRef}
            id="ask-input"
            name="q"
            rows={1}
            placeholder={`Message ${currentWorkspace.name}…`}
            disabled={streaming}
            required
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="icon-btn"
            type="button"
            disabled
            title="Voice in a later update"
            aria-label="Voice in a later update"
          >
            <MicIcon />
          </button>
          <button className="icon-btn primary" type="submit" disabled={streaming} aria-label="Send">
            <SendIcon />
          </button>
        </div>
      </form>
    </Shell>
  );
}
