"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useHatch } from "@/components/AppProvider";
import { MicIcon, SendIcon } from "@/components/Icons";
import { Shell } from "@/components/Shell";
import { SourcesList } from "@/components/SourcesList";
import { MATTER_ALPHA, MATTER_BETA } from "@/lib/mock-data";

export default function AskPage() {
  const { currentRoom, currentRoomId, thread, streaming, ask } = useHatch();
  const [openSources, setOpenSources] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread, streaming]);

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
    currentRoomId === MATTER_ALPHA
      ? [
          ["What is the customer concentration in the Northshore CIM?", "Customer concentration"],
          ["Summarize the quality of earnings findings.", "Quality of earnings"],
          ["What is in the other matter?", "Other matter (isolation)"],
          ["What does the site photo show?", "Site photo"],
        ]
      : currentRoomId === MATTER_BETA
        ? [
            ["What does the Harbor CIM say about LTM revenue?", "Harbor CIM"],
            ["What does the Northshore CIM say?", "Other matter (isolation)"],
          ]
        : [["What is in this room?", "Ask without the library"]];

  return (
    <Shell stageClass="stage-ask">
      <div className="panel">
        {!thread.length ? (
          <div className="empty-ask">
            <p className="screen-kicker">Ask</p>
            <h1>Nothing in this room yet.</h1>
            <p className="lede">
              Ask, or open Library and drop a PDF. Answers stream from this box — you do not pick a
              public model.
            </p>
            <div className="tip">You are talking to the firm’s Hatch, not a public lab.</div>
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
            {thread.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="bubble bubble-user">
                  <p>{m.text}</p>
                </div>
              ) : (
                <div key={m.id} className="bubble bubble-ai">
                  <p>
                    {m.text}
                    {!m.done ? <span className="cursor" /> : null}
                  </p>
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
                        {m.sources.length ? currentRoom.name : "General model knowledge"}
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
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <div className="composer-box">
          <textarea
            ref={inputRef}
            id="ask-input"
            name="q"
            rows={1}
            placeholder="Ask this room…"
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
