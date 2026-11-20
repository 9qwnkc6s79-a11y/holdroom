"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHatch } from "@/components/AppProvider";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { IconArrowUp, IconPaperclip } from "@/components/os/Icons";
import { OsShell } from "@/components/os/OsShell";
import { actionTitle } from "@/lib/action-cards";
import { agentById } from "@/lib/agents";
import { FINANCE, HQ_OPS, LEGAL, LITTLE_ELM, PROSPER } from "@/lib/departments";
import { ACCEPT_ATTR } from "@/lib/files";
import type { ApprovalCard, ChatMessage, ChatThread, ToolEvent } from "@/lib/types";

interface StatusShape {
  demoMode?: boolean;
  modelState?: "demo" | "offline" | "ready";
}

interface LivePayload {
  phase?: "wait" | "done";
  state?: unknown;
  note?: string;
  text?: string;
  tools?: ToolEvent[];
  approval?: ApprovalCard;
  messageId?: string;
  modelOffline?: boolean;
}

export function ChatScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { session } = useHatch();
  const agent = agentById(params.get("agent"));
  const threadId = params.get("thread");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(threadId);
  const [streaming, setStreaming] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ fileId: string; name: string; kind: "PDF" | "Office" | "Markdown" | "Image" }[]>([]);
  const [status, setStatus] = useState<StatusShape>({});
  const [attachNote, setAttachNote] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      const [threadRes, statusRes] = await Promise.all([
        fetch("/api/threads", { cache: "no-store" }),
        fetch("/api/status", { cache: "no-store" }),
      ]);
      if (stop) return;
      if (threadRes.ok) {
        const data = (await threadRes.json()) as { threads?: ChatThread[] };
        setThreads(data.threads || []);
      }
      if (statusRes.ok) setStatus((await statusRes.json()) as StatusShape);
    }
    void load().catch(() => setStatus({ modelState: "offline" }));
    return () => {
      stop = true;
    };
  }, [agent.id]);

  useEffect(() => {
    setActiveThread(threadId);
    if (streaming) return;
    if (!threadId) {
      setMessages([]);
      return;
    }
    const found = threads.find((thread) => thread.id === threadId);
    if (found) setMessages(found.messages);
  }, [threadId, threads, streaming]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  const actor = session ? `${session.role} · ${session.deviceName}` : "signed-in";
  const accessible = session?.enterprise
    ? Array.from(new Set([...(session.departments || []), HQ_OPS, LEGAL, FINANCE, LITTLE_ELM, PROSPER]))
    : session?.departments || [];

  async function attach(file?: File | null) {
    if (!file || streaming) return;
    setAttachNote("Adding to the file room…");
    const form = new FormData();
    form.set("file", file);
    form.set("departmentId", agent.writeDepartmentId);
    form.set("inLibrary", "1");
    form.set("accessibleDepartments", accessible.join(","));
    const res = await fetch("/api/ingest", { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as { file?: { id: string; name: string; kind: "PDF" | "Office" | "Markdown" | "Image" }; error?: string };
    if (!res.ok || !data?.file) {
      setAttachNote(data?.error || "Could not add that file.");
      return;
    }
    setPendingFiles((prev) => [...prev, { fileId: data.file!.id, name: data.file!.name, kind: data.file!.kind }]);
    setAttachNote(`${data.file.name} is in the file room.`);
  }

  async function send(text: string) {
    const query = text.trim();
    if (!query || streaming || !session) return;
    setStreaming(true);
    setAttachNote("");
    let thread = activeThread;
    if (!thread) {
      const created = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: agent.departmentId,
          agentId: agent.id,
          title: query.slice(0, 42),
        }),
      });
      const data = (await created.json()) as { thread?: ChatThread };
      thread = data.thread?.id || null;
      if (thread) {
        setActiveThread(thread);
        router.replace(`/chat?agent=${agent.id}&thread=${thread}`);
      }
    }
    if (!thread) {
      setStreaming(false);
      return;
    }
    const attachments = pendingFiles;
    setPendingFiles([]);
    const user: ChatMessage = {
      id: `local-u-${Date.now()}`,
      role: "user",
      text: query,
      done: true,
      sources: [],
      attachments,
    };
    const assistant: ChatMessage = { id: `local-a-${Date.now()}`, role: "assistant", text: "", done: false, sources: [] };
    setMessages((prev) => [...prev, user, assistant]);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: agent.departmentId,
          defaultDepartmentId: agent.writeDepartmentId,
          threadId: thread,
          query,
          agentId: agent.id,
          actor,
          agent: true,
          failFast: true,
          approvals: "wait",
          accessibleDepartments: accessible,
          enterprise: session.enterprise,
          attachments,
        }),
      });
      if (!res.ok) throw new Error("offline");
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        let payload = (await res.json()) as LivePayload;
        while (payload.phase === "wait") {
          const note = payload.note || "The firm model is waking up.";
          setMessages((prev) => prev.map((item) => (item.id === assistant.id ? { ...item, text: note } : item)));
          await new Promise((resolve) => setTimeout(resolve, 4000));
          const next = await fetch("/api/chat/step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: payload.state }),
          });
          payload = (await next.json()) as LivePayload;
        }
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistant.id
              ? {
                  ...item,
                  id: payload.messageId || assistant.id,
                  text: payload.text || "",
                  done: true,
                  tools: payload.tools,
                  approval: payload.approval,
                }
              : item,
          ),
        );
        if (payload.modelOffline) setStatus((prev) => ({ ...prev, modelState: "offline" }));
        window.dispatchEvent(new Event("hatch-refresh"));
        return;
      }
      if (!res.body) throw new Error("offline");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";
      let finalText = "";
      let tools: ToolEvent[] = [];
      let approval: ApprovalCard | undefined;
      let messageId = assistant.id;
      let modelOffline = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, "");
          if (!line) continue;
          const payload = JSON.parse(line) as {
            delta?: string;
            done?: boolean;
            text?: string;
            tools?: ToolEvent[];
            approval?: ApprovalCard;
            messageId?: string;
            modelOffline?: boolean;
          };
          if (payload.delta) {
            streamed += payload.delta;
            const shown = streamed;
            setMessages((prev) => prev.map((item) => (item.id === assistant.id ? { ...item, text: shown } : item)));
          }
          if (payload.done) {
            if (typeof payload.text === "string") finalText = payload.text;
            tools = payload.tools || [];
            approval = payload.approval;
            if (payload.messageId) messageId = payload.messageId;
            modelOffline = Boolean(payload.modelOffline);
          }
        }
      }
      const textOut = finalText || streamed;
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistant.id ? { ...item, id: messageId, text: textOut, done: true, tools, approval } : item,
        ),
      );
      if (modelOffline) setStatus((prev) => ({ ...prev, modelState: "offline" }));
      window.dispatchEvent(new Event("hatch-refresh"));
    } catch {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistant.id
            ? {
                ...item,
                done: true,
                text: "The model is offline. Hatch could not reach the firm’s model. Nothing was sent to an outside AI lab.",
              }
            : item,
        ),
      );
      setStatus({ modelState: "offline" });
    } finally {
      setStreaming(false);
    }
  }

  async function decide(message: ChatMessage, decision: "approved" | "cancelled") {
    if (!activeThread || !message.approval || message.approval.status !== "pending") return;
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: activeThread,
        messageId: message.id,
        decision,
        actor,
        accessibleDepartments: accessible,
        enterprise: session?.enterprise,
      }),
    });
    const data = (await res.json().catch(() => null)) as { message?: ChatMessage; error?: string };
    if (!res.ok || !data?.message) return;
    setMessages((prev) => prev.map((item) => (item.id === message.id ? data.message! : item)));
    window.dispatchEvent(new Event("hatch-refresh"));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(inputRef.current?.value || "");
  }

  const prompts =
    agent.id === "finance"
      ? [
          ["How does month-end close run?", "Month-end close"],
          ["Draft a close memo for the partners", "Draft a memo"],
        ]
      : agent.id === "legal"
        ? [
            ["What engagement notes do we keep?", "Engagement notes"],
            ["Draft a note for counsel", "Draft a note"],
          ]
        : agent.id === "operations"
          ? [
              ["What is in the operations file room?", "File room"],
              ["Draft an opening note for the team", "Draft a note"],
            ]
          : [
              ["What should I know from the file room?", "File room"],
              ["Draft a short memo for Operations", "Draft a memo"],
            ];

  const offline = status.modelState === "offline" && !status.demoMode;

  return (
    <OsShell title={agent.name} lede={agent.description}>
      <div className="os-chat">
        <div className="os-stream" aria-live="polite">
          {offline ? (
            <div className="os-banner" role="status">
              <strong>Model offline.</strong> The firm model is not responding. You can still look through Library, Vault, and the audit log.
            </div>
          ) : null}
          {!messages.length ? (
            <div className="os-empty">
              <h2>Ask {agent.name}.</h2>
              <p>{agent.description}</p>
              <div className="os-prompts">
                {prompts.map(([query, label]) => (
                  <button key={label} type="button" onClick={() => void send(query)} disabled={streaming}>
                    {label}
                  </button>
                ))}
                <button type="button" onClick={() => void send("Use the vault item for the payroll login")} disabled={streaming}>
                  Use vault
                </button>
              </div>
            </div>
          ) : (
            messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="os-msg os-msg-user">
                  <div className="os-user">{message.text}</div>
                  {message.attachments?.length ? (
                    <div className="os-chips">
                      {message.attachments.map((file) => (
                        <span key={file.fileId} className="os-chip">
                          {file.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div key={message.id} className="os-msg">
                  <div className="os-assistant">
                    {message.text ? <MarkdownPreview text={message.text} /> : null}
                    {!message.done ? <span className="os-caret" aria-hidden="true" /> : null}
                  </div>
                  {(message.tools || []).map((tool, index) => (
                    <details key={`${message.id}-${tool.name}-${index}`} className="os-action" open>
                      <summary>{actionTitle(tool.name)}</summary>
                      <div className="os-card-body">
                        <p className="os-card-label">Input</p>
                        <p>{tool.input || "—"}</p>
                        <p className="os-card-label">Output</p>
                        <p>{tool.detail}</p>
                      </div>
                    </details>
                  ))}
                  {message.approval ? (
                    <details className="os-approval" open={message.approval.status === "pending"}>
                      <summary>{message.approval.title}</summary>
                      <div className="os-card-body">
                        <p>{message.approval.summary}</p>
                        {message.approval.inputs.map((row) => (
                          <div key={row.label}>
                            <p className="os-card-label">{row.label}</p>
                            <p>{row.value}</p>
                          </div>
                        ))}
                        {message.approval.status === "pending" ? (
                          <div className="os-card-actions">
                            <button className="os-btn" type="button" onClick={() => void decide(message, "approved")}>
                              Approve
                            </button>
                            <button className="os-btn-ghost" type="button" onClick={() => void decide(message, "cancelled")}>
                              Deny
                            </button>
                          </div>
                        ) : (
                          <p className="os-decided">{message.approval.status === "approved" ? "Approved" : "Cancelled"}</p>
                        )}
                      </div>
                    </details>
                  ) : null}
                </div>
              ),
            )
          )}
          <div ref={endRef} />
        </div>
        <form className="os-compose" onSubmit={onSubmit}>
          {pendingFiles.length ? (
            <div className="os-pending">
              {pendingFiles.map((file) => (
                <span key={file.fileId}>{file.name}</span>
              ))}
            </div>
          ) : null}
          <div className="os-compose-row">
            <button className="os-icon-btn" type="button" aria-label="Attach a file" onClick={() => fileRef.current?.click()}>
              <IconPaperclip />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void attach(file);
              }}
            />
            <textarea
              ref={inputRef}
              name="q"
              rows={1}
              placeholder={`Message ${agent.name}`}
              aria-label={`Message ${agent.name}`}
              disabled={streaming}
              onInput={(event) => {
                const el = event.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(event.currentTarget.value);
                }
              }}
            />
            <button className="os-send" type="submit" aria-label="Send" disabled={streaming}>
              <IconArrowUp />
            </button>
          </div>
          <p className="os-fine">
            {attachNote ||
              (status.demoMode
                ? "Demo mode is on. Replies are simulated and the firm model is not called."
                : "Files you attach go to this agent’s file room. Sends, changes, and deletions wait for approval.")}
          </p>
        </form>
      </div>
    </OsShell>
  );
}

