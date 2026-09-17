"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useHatch } from "@/components/AppProvider";
import { MicIcon, SendIcon } from "@/components/Icons";
import { Shell } from "@/components/Shell";
import { SourcesList } from "@/components/SourcesList";
import { HQ_OPS, LITTLE_ELM, PROSPER } from "@/lib/mock-data";

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
    currentRoomId === LITTLE_ELM
      ? [
          ["What is the Little Elm open/close checklist?", "Open / close"],
          ["How does loyalty work — TapMango or text COFFEE?", "Loyalty"],
          ["What is the catering protocol?", "Catering"],
          ["Who is the GM at Little Elm?", "GM"],
          ["What is in the Prosper room?", "Other store (isolation)"],
        ]
      : currentRoomId === PROSPER
        ? [
            ["Who is the GM at Prosper?", "GM"],
            ["How does loyalty work — TapMango or text COFFEE?", "Loyalty"],
            ["What is the Prosper open/close checklist?", "Open / close"],
            ["What is the Little Elm checklist?", "Other store (isolation)"],
          ]
        : currentRoomId === HQ_OPS
          ? [
              ["Summarize the DEMO catering protocol.", "Catering"],
              ["What are the TapMango loyalty tiers?", "Loyalty tiers"],
              ["Who runs Little Elm and Prosper?", "GM roster"],
            ]
          : [["What is in this room?", "Ask this room"]];

  return (
    <Shell stageClass="stage-ask">
      <div className="panel">
        {!thread.length ? (
          <div className="empty-ask">
            <p className="screen-kicker">Ask · {currentRoom.name}</p>
            <h1>Ask this store’s library.</h1>
            <p className="lede">
              Answers come from the DEMO files in {currentRoom.name}, via local Qwen on this
              machine. If Ollama is down you will see install commands — nothing is invented
              silently.
            </p>
            <div className="tip">Boundaries Coffee dry-run. Retrieval stays in this room.</div>
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
                  <p className="bubble-text">
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
                        {m.sources.length ? currentRoom.name : "No library hit in this room"}
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
            placeholder={`Ask ${currentRoom.name}…`}
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
