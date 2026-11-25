"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHatch } from "@/components/AppProvider";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { BlobAvatar, InitialAvatar } from "@/components/os/Avatar";
import { IconPicker } from "@/components/os/IconPicker";
import { IconArrowUp, IconCamera, IconChevronDown, IconChevronLeft, IconDots, IconFile, IconFlag, IconGrid, IconImage, IconPlus, IconScan, IconSettings, IconX } from "@/components/os/Icons";
import { ModelEthics } from "@/components/os/ModelEthics";
import { SettingsScreen } from "@/components/os/SettingsScreen";
import { actionTitle } from "@/lib/action-cards";
import { AGENT_COLORS, FIRM_MODEL, type HatchAgent } from "@/lib/agents";
import { FINANCE, HQ_OPS, LEGAL, NORTH_DESK, SOUTH_DESK } from "@/lib/departments";
import { ACCEPT_ATTR, kindFromFilename } from "@/lib/files";
import { browserImageDataUrl } from "@/lib/image-client";
import { forStorage, isRasterImage } from "@/lib/images";
import { dropPending, readPending, upsertPending, waitCopy, type PendingJob } from "@/lib/pending";
import { mergeThreads, readTranscripts, richerThread, writeTranscripts } from "@/lib/transcripts";
import type { ApprovalCard, ChatAttachment, ChatMessage, ChatThread, Routine, ToolEvent } from "@/lib/types";

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

function startersForAgent(agent: HatchAgent): string[] {
  if (agent.id === "legal") {
    return [
      "What’s in our engagement notes?",
      "Summarize key client confidentiality rules",
      "Draft an engagement letter checklist",
    ];
  }
  if (agent.id === "finance") {
    return [
      "Walk me through month-end close",
      "List items needed for the monthly close",
      "Draft a month-end sign-off memo",
    ];
  }
  if (agent.id === "operations" || agent.id === "hq-ops") {
    return [
      "What’s in the client onboarding checklist?",
      "Summarize the visitor protocol",
      "Who leads North desk and South desk?",
    ];
  }
  return [
    "What’s in our firm file room?",
    "Summarize the client onboarding checklist",
    "Draft a short internal status update",
  ];
}

interface DraftChip {
  id: string;
  name: string;
  text?: string;
  note?: string;
  fileId?: string;
  vision?: boolean;
  /** JPEG data URL kept only until the message is sent. */
  image?: string;
}

function attachmentBlock(file: DraftChip) {
  if (file.vision) return `Attached image ${file.name}`;
  if (file.text) return `Attached file ${file.name}\n${file.text.slice(0, 8000)}`;
  return `Attached file ${file.name}\n${file.note || "No text could be read from this file."}`;
}

function composeQuery(text: string, files: DraftChip[]) {
  const body = [text.trim(), ...files.filter((file) => !file.vision).map(attachmentBlock)].filter(Boolean).join("\n\n");
  if (body) return body;
  return files.map((file) => file.name).join(", ");
}

function explainFailure(err: unknown, status?: number) {
  if (status === 401 || status === 403) return "Your sign-in expired. Sign in again to keep chatting.";
  if (status === 429) return "You've hit today's message cap for this code. Try again tomorrow.";
  if (err instanceof TypeError) return "The network dropped. Check your connection, then retry.";
  const message = err instanceof Error ? err.message : "";
  if (/cap|messages today/i.test(message)) return message;
  if (/offline/i.test(message)) return "Hatch could not reach the firm model. Nothing was sent to an outside AI lab.";
  if (/timed out|timeout/i.test(message)) return "The request timed out. The server may still be warming up.";
  if (status && status >= 500) return `The server returned an error (${status}).`;
  return message || "The request failed before a reply came back.";
}

function failureStatus(err: unknown) {
  if (err && typeof err === "object" && "status" in err && typeof err.status === "number") return err.status;
  return undefined;
}

function clock(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function choicesOf(text: string) {
  const match = text.match(/\[\[choices:\s*([^\]]+)\]\]/i);
  if (!match) return { body: text, choices: [] as string[] };
  return {
    body: text.replace(match[0], "").trim(),
    choices: match[1].split("|").map((item) => item.trim()).filter(Boolean).slice(0, 3),
  };
}

function seenMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem("hatch-seen") || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function Messenger() {
  const params = useSearchParams();
  const router = useRouter();
  const { session } = useHatch();
  const agentId = params.get("agent");
  const [wide, setWide] = useState(false);
  const [agents, setAgents] = useState<HatchAgent[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [agentSettings, setAgentSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<"home" | "vault" | "audit">("home");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hold, setHold] = useState<string | null>(null);
  const [chatSearch, setChatSearch] = useState(false);
  const [find, setFind] = useState("");
  const [draft, setDraft] = useState("");
  const [chips, setChips] = useState<DraftChip[]>([]);
  const [apps, setApps] = useState(false);
  const [palette, setPalette] = useState(false);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [account, setAccount] = useState("Partner");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const heldRef = useRef(false);
  const shownAgent = useRef<string | null>(null);
  const busyRef = useRef(false);
  const pollsRef = useRef(new Set<string>());
  const followRef = useRef<(job: PendingJob) => Promise<void>>(async () => undefined);
  const queueRef = useRef<{ text: string; userId: string; agentId: string; context?: string; attachments?: ChatAttachment[] }[]>([]);
  const announcedRef = useRef(new Set<string>());
  const recentSend = useRef("");
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const endRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener("change", apply);
    setSeen(seenMap());
    setAccount(localStorage.getItem("hatch-account") || "Partner");
    return () => media.removeEventListener("change", apply);
  }, []);

  function extraAgents(): HatchAgent[] {
    try {
      return JSON.parse(localStorage.getItem("hatch-extra-agents") || "[]") as HatchAgent[];
    } catch {
      return [];
    }
  }

  function rememberAgent(agent: HatchAgent) {
    const next = [agent, ...extraAgents().filter((item) => item.id !== agent.id)].slice(0, 40);
    localStorage.setItem("hatch-extra-agents", JSON.stringify(next));
  }

  function rememberConversation(agentId: string, threadId: string, departmentId: string, messages: ChatMessage[], title?: string) {
    const now = new Date().toISOString();
    const prev = readTranscripts().find((item) => item.agentId === agentId);
    const thread: ChatThread = {
      id: threadId || prev?.id || `local-${agentId}`,
      agentId,
      departmentId: (departmentId || prev?.departmentId || "hq-ops") as ChatThread["departmentId"],
      title: title || prev?.title || messages.find((item) => item.role === "user")?.text.slice(0, 42) || "New thread",
      archived: false,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      messages,
    };
    const next = [thread, ...readTranscripts().filter((item) => item.agentId !== agentId)].slice(0, 30);
    writeTranscripts(next);
    setThreads((current) => [thread, ...current.filter((item) => item.agentId !== agentId)]);
    setActiveThread(thread.id);
    setMessages(messages);
  }

  async function load() {
    const [agentRes, threadRes] = await Promise.all([
      fetch("/api/agents", { cache: "no-store" }),
      fetch("/api/threads", { cache: "no-store" }),
    ]);
    if (agentRes.ok) {
      const data = (await agentRes.json()) as { agents?: HatchAgent[] };
      const server = data.agents || [];
      const ids = new Set(server.map((item) => item.id));
      setAgents([...server, ...extraAgents().filter((item) => !ids.has(item.id))]);
    }
    const serverThreads = threadRes.ok ? (((await threadRes.json()) as { threads?: ChatThread[] }).threads || []) : [];
    setThreads((current) => {
      const merged = mergeThreads(mergeThreads(readTranscripts(), current), serverThreads);
      writeTranscripts(merged);
      return merged;
    });
  }

  useEffect(() => {
    const local = readTranscripts();
    if (local.length) setThreads(local);
    void load().catch(() => undefined);
    const onRefresh = () => void load();
    window.addEventListener("hatch-refresh", onRefresh);
    return () => window.removeEventListener("hatch-refresh", onRefresh);
  }, []);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      for (const job of readPending()) void followRef.current(job);
    };
    resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [agentId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const agent = agents.find((item) => item.id === agentId) || null;
  const latest = useMemo(() => {
    const map = new Map<string, ChatThread>();
    for (const thread of threads) {
      if (!thread.agentId || thread.archived) continue;
      const prev = map.get(thread.agentId);
      if (!prev || thread.updatedAt > prev.updatedAt) map.set(thread.agentId, thread);
    }
    return map;
  }, [threads]);

  useEffect(() => {
    if (streaming) return;
    if (!agent) {
      setMessages([]);
      setActiveThread(null);
      return;
    }
    const saved = readTranscripts().find((item) => item.agentId === agent.id);
    const chosen = richerThread(saved, latest.get(agent.id));
    const switched = shownAgent.current !== agent.id;
    shownAgent.current = agent.id;
    setActiveThread(chosen?.id || null);
    setMessages((prev) => {
      const next = chosen?.messages || [];
      if (!switched && next.length < prev.length) return prev;
      return next;
    });
    const next = { ...seenMap(), [agent.id]: new Date().toISOString() };
    localStorage.setItem("hatch-seen", JSON.stringify(next));
    setSeen(next);
  }, [agent, latest, streaming]);

  useEffect(() => {
    if (!stickRef.current) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming, statusNote]);

  const actor = session ? `${session.role} · ${session.deviceName}` : "signed-in";
  const accessible = session?.enterprise
    ? Array.from(new Set([...(session.departments || []), HQ_OPS, LEGAL, FINANCE, NORTH_DESK, SOUTH_DESK, agent?.writeDepartmentId || ""]))
    : Array.from(new Set([...(session?.departments || []), agent?.writeDepartmentId || ""]));

  function unread(item: HatchAgent) {
    const thread = latest.get(item.id);
    const last = thread?.messages.at(-1);
    if (!thread || !last || last.role !== "assistant") return false;
    const seenAt = seen[item.id];
    return !seenAt || thread.updatedAt > seenAt;
  }

  const rows = agents.filter((item) => {
    const preview = latest.get(item.id)?.messages.at(-1)?.text || item.description;
    const hay = `${item.name} ${preview}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  const unreadCount = agents.filter(unread).length;

  function threadIdFor(agentId: string) {
    return readTranscripts().find((item) => item.agentId === agentId)?.id || `local-${agentId}`;
  }

  function writeMessages(agentId: string, departmentId: string, messages: ChatMessage[], title?: string) {
    rememberConversation(agentId, threadIdFor(agentId), departmentId, messages, title);
  }

  function mapMessages(agentId: string, departmentId: string, map: (messages: ChatMessage[]) => ChatMessage[]) {
    const current = readTranscripts().find((item) => item.agentId === agentId)?.messages || [];
    writeMessages(agentId, departmentId, map(current));
  }

  async function send(text: string, opts?: { voice?: boolean; plain?: boolean; files?: DraftChip[] }) {
    const files = opts?.plain ? [] : (opts?.files ?? chips);
    const modelQuery = opts?.plain ? text.trim() : composeQuery(text, files);
    const display = text.trim() || files.map((file) => file.name).join(", ");
    const context = opts?.plain ? "" : files.map(attachmentBlock).join("\n\n");
    const fingerprint = [modelQuery, ...files.map((file) => `${file.name}:${file.image?.length || file.id}`)].join("|");
    if (!modelQuery || !session || !agent) return;
    if (recentSend.current === fingerprint) return;
    recentSend.current = fingerprint;
    window.setTimeout(() => {
      if (recentSend.current === fingerprint) recentSend.current = "";
    }, 500);
    stickRef.current = true;
    setAttachOpen(false);
    if (!opts?.plain) {
      setDraft("");
      setChips([]);
    }
    const attachments: ChatAttachment[] = files.map((file) => ({
      fileId: file.fileId || file.id,
      name: file.name,
      kind: file.vision ? "Image" : kindFromFilename(file.name),
      text: file.vision ? undefined : file.text,
      note: file.vision ? undefined : file.note,
      image: file.image,
    }));
    const storedAttachments = attachments.map(forStorage);
    if (busyRef.current) {
      const user: ChatMessage = {
        id: `local-u-${Date.now()}`,
        role: "user",
        text: display,
        done: true,
        sources: [],
        attachments: storedAttachments,
        replyTo: reply ? { text: reply } : undefined,
      };
      mapMessages(agent.id, agent.departmentId, (current) => [...current, user]);
      queueRef.current.push({ text: display, userId: user.id, agentId: agent.id, context, attachments });
      setReply(null);
      return;
    }
    await runTurn(agent, modelQuery, undefined, { voice: opts?.voice, display, attachments, context });
  }

  function releaseTurn(target: HatchAgent) {
    const next = queueRef.current.shift();
    if (next) {
      const found = agentsRef.current.find((item) => item.id === next.agentId) || target;
      void runTurn(found, next.text, next.userId, { display: next.text, context: next.context, attachments: next.attachments });
      return;
    }
    busyRef.current = false;
    setStreaming(false);
    setStatusNote("");
  }

  async function followJob(job: PendingJob) {
    if (pollsRef.current.has(job.assistantId)) return;
    pollsRef.current.add(job.assistantId);
    busyRef.current = true;
    setStreaming(true);
    let state = job.state;
    let delay = 2000;
    let running = false;
    const paint = (patch: Partial<ChatMessage>) => {
      mapMessages(job.agentId, job.departmentId as ChatThread["departmentId"], (current) =>
        current.map((item) => (item.id === job.assistantId ? { ...item, ...patch } : item)),
      );
    };
    setStatusNote(waitCopy(job.startedAt, running));
    const timer = window.setInterval(() => {
      setStatusNote(waitCopy(job.startedAt, running));
    }, 1000);
    try {
      while (true) {
        let next: Response;
        try {
          next = await fetch("/api/chat/step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state }),
          });
        } catch {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * 2, 15000);
          continue;
        }
        if (!next.ok) {
          if (next.status === 401 || next.status === 403) {
            dropPending(job.assistantId);
            paint({ done: true, failed: true, retryQuery: job.query, text: explainFailure(null, next.status) });
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * 2, 15000);
          continue;
        }
        delay = 2000;
        const payload = (await next.json()) as LivePayload;
        if (payload.phase === "wait" && payload.state) {
          state = payload.state;
          running = /running/i.test(payload.note || "");
          upsertPending({ ...job, state });
          setStatusNote(waitCopy(job.startedAt, running));
          await new Promise((resolve) => setTimeout(resolve, 2500));
          continue;
        }
        dropPending(job.assistantId);
        const textOut = payload.text || (payload.modelOffline ? explainFailure(new Error("offline")) : "The model returned an empty reply.");
        const failed = !payload.text || Boolean(payload.modelOffline);
        paint({
          id: payload.messageId || job.assistantId,
          text: textOut,
          done: true,
          failed,
          retryQuery: failed ? job.query : undefined,
          tools: payload.tools || [],
          approval: payload.approval,
        });
        window.dispatchEvent(new Event("hatch-refresh"));
        break;
      }
    } finally {
      window.clearInterval(timer);
      pollsRef.current.delete(job.assistantId);
      const owner = agentsRef.current.find((item) => item.id === job.agentId);
      if (owner) releaseTurn(owner);
      else {
        busyRef.current = false;
        setStreaming(false);
      }
    }
  }
  followRef.current = followJob;

  async function runTurn(
    target: HatchAgent,
    q: string,
    existingUserId?: string,
    opts?: { voice?: boolean; display?: string; attachments?: ChatAttachment[]; context?: string },
  ) {
    if (!session) return;
    busyRef.current = true;
    setStreaming(true);
    const startedAt = Date.now();
    setStatusNote(waitCopy(startedAt, false));
    const quote = reply;
    setReply(null);
    const thread = threadIdFor(target.id);
    const assistant: ChatMessage = {
      id: `local-a-${Date.now()}`,
      role: "assistant",
      text: "",
      done: false,
      sources: [],
    };
    const display = opts?.display || q;
    if (!existingUserId) {
      const user: ChatMessage = {
        id: `local-u-${Date.now()}`,
        role: "user",
        text: display,
        done: true,
        sources: [],
        attachments: opts?.attachments?.map(forStorage),
        replyTo: quote ? { text: quote } : undefined,
      };
      mapMessages(target.id, target.departmentId, (current) => [...current, user, assistant]);
    } else {
      mapMessages(target.id, target.departmentId, (current) => [...current, assistant]);
    }
    if (!announcedRef.current.has(target.id)) {
      announcedRef.current.add(target.id);
      void fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: target.departmentId, agentId: target.id, title: display.slice(0, 42) }),
      }).catch(() => undefined);
    }
    const paint = (patch: Partial<ChatMessage>) => {
      mapMessages(target.id, target.departmentId, (current) =>
        current.map((item) => (item.id === assistant.id ? { ...item, ...patch } : item)),
      );
    };
    const fail = (err: unknown, status?: number) => {
      const textOut = explainFailure(err, status);
      paint({ done: true, failed: true, retryQuery: q, text: textOut });
      setStatusNote("");
    };
    let handed = false;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: target.departmentId,
          defaultDepartmentId: target.writeDepartmentId,
          threadId: thread,
          query: opts?.display || q,
          context: opts?.context || "",
          agentId: target.id,
          actor,
          failFast: true,
          approvals: "wait",
          accessibleDepartments: accessible.filter(Boolean),
          enterprise: session.enterprise,
          replyTo: quote ? { text: quote } : undefined,
          testerCode: session.inviteCode || "staff",
          attachments: opts?.attachments,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        const error = new Error(data?.error || `Request failed (${res.status})`) as Error & { status?: number };
        error.status = res.status;
        throw error;
      }
      const contentType = res.headers.get("content-type") || "";
      let finalText = "";
      let tools: ToolEvent[] = [];
      let approval: ApprovalCard | undefined;
      let messageId = assistant.id;
      let modelOffline = false;
      if (!contentType.includes("text/event-stream")) {
        const payload = JSON.parse(await res.text()) as LivePayload;
        if (payload.phase === "wait" && payload.state) {
          const job: PendingJob = {
            assistantId: assistant.id,
            agentId: target.id,
            departmentId: target.departmentId,
            query: q,
            startedAt,
            voice: opts?.voice,
            state: payload.state,
          };
          upsertPending(job);
          setStatusNote(waitCopy(startedAt, /running/i.test(payload.note || "")));
          handed = true;
          await followJob(job);
          return;
        }
        finalText = payload.text || "";
        tools = payload.tools || [];
        approval = payload.approval;
        messageId = payload.messageId || assistant.id;
        modelOffline = Boolean(payload.modelOffline);
      } else {
        if (!res.body) throw new Error("The reply stream closed before any text arrived.");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamed = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const line = part.replace(/^data:\s*/, "");
            if (!line) continue;
            const payload = JSON.parse(line) as LivePayload & { delta?: string; done?: boolean };
            if (payload.delta) {
              streamed += payload.delta;
              paint({ text: streamed });
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
        finalText = finalText || streamed;
      }
      const shown = finalText || (modelOffline ? explainFailure(new Error("offline")) : "The model returned an empty reply.");
      const failed = !finalText || modelOffline;
      paint({ id: messageId, text: shown, done: true, tools, approval, failed, retryQuery: failed ? q : undefined });
      if (!failed) setStatusNote("");
      window.dispatchEvent(new Event("hatch-refresh"));
    } catch (err) {
      fail(err, failureStatus(err));
    } finally {
      if (!handed) releaseTurn(target);
    }
  }

  async function attach(file?: File | null) {
    if (!file || !agent) return;
    setAttachOpen(false);
    const vision = isRasterImage(file.name, file.type || "");
    const chip: DraftChip = { id: `chip-${Date.now()}`, name: file.name, vision };
    if (vision) {
      chip.image = (await browserImageDataUrl(file)) || undefined;
    } else {
      try {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch("/api/extract", { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as { text?: string; note?: string; error?: string } | null;
        if (!res.ok) chip.note = data?.error || "Could not read this file. The model will only see the filename.";
        else {
          chip.text = data?.text || "";
          chip.note = data?.note || "";
        }
      } catch {
        chip.note = "Could not read this file. The model will only see the filename.";
      }
    }
    setChips((current) => [...current, chip]);
    if (!session) return;
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("departmentId", agent.writeDepartmentId);
      form.set("inLibrary", "1");
      form.set("accessibleDepartments", accessible.filter(Boolean).join(","));
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { file?: { id?: string; name: string }; error?: string };
      if (data?.file?.id) {
        const fileId = data.file.id;
        setChips((current) => current.map((item) => (item.id === chip.id ? { ...item, fileId } : item)));
      }
    } catch {
      /* The chip still goes with the next message even if the file room upload fails. */
    }
  }


  async function saveAgent(patch: Partial<HatchAgent> & { name: string }) {
    await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  const showList = wide || !agent;
  const showChat = wide || Boolean(agent);
  const visibleMessages = find
    ? messages.filter((message) => message.text.toLowerCase().includes(find.toLowerCase()))
    : messages;

  return (
    <div className={`msg${wide ? " is-wide" : ""}`}>
      {showList ? (
        <section className="inbox" aria-label="Agents">
          <header className="inbox-top">
            <button type="button" className="round" aria-label="Account and settings" onClick={() => { setSettingsPage("home"); setSettingsOpen(true); }}>
              <InitialAvatar label={account} size={40} />
            </button>
            <button type="button" className="round" aria-label="New agent" onClick={() => setCreating(true)}>
              <IconPlus />
            </button>
          </header>
          <div className="pins">
            {agents.filter((item) => item.pinned).map((item) => (
              <button key={item.id} type="button" className="pin" onClick={() => router.push(`/chat?agent=${item.id}`)}>
                <BlobAvatar color={item.color} icon={item.icon} size={72} label={item.name} badge={item.id === "general"} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <ul className="rows">
            {rows.map((item) => {
              const thread = latest.get(item.id);
              const preview = thread?.messages.at(-1)?.text || item.description;
              const on = item.id === agent?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`row${on ? " is-on" : ""}`}
                    onClick={() => {
                      if (heldRef.current) {
                        heldRef.current = false;
                        return;
                      }
                      setMenu(null);
                      router.push(`/chat?agent=${item.id}`);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenu({ id: item.id, x: event.clientX, y: event.clientY });
                    }}
                    onPointerDown={() => {
                      const hold = window.setTimeout(() => {
                        heldRef.current = true;
                        setMenu({ id: item.id, x: 24, y: 120 });
                      }, 480);
                      const clear = () => window.clearTimeout(hold);
                      window.addEventListener("pointerup", clear, { once: true });
                      window.addEventListener("pointercancel", clear, { once: true });
                    }}
                  >
                    <BlobAvatar color={item.color} icon={item.icon} size={52} label={item.name} />
                    <span className="row-copy">
                      <span className="row-name">{item.name}</span>
                      <span className="row-preview">{preview.replace(/\s+/g, " ").slice(0, 80)}</span>
                    </span>
                    <span className="row-side">
                      <span className="row-time">{clock(thread?.updatedAt)}</span>
                      {unread(item) ? <span className="unread" aria-label="Unread" /> : <span className="unread is-off" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="jump"
              onClick={() => {
                const first = agents.find(unread);
                if (first) router.push(`/chat?agent=${first.id}`);
              }}
            >
              {unreadCount} unread
              <IconChevronDown size={14} />
            </button>
          ) : null}
          <form className="dock" onSubmit={(event) => event.preventDefault()}>
            <button type="button" className="round" aria-label="Apps" onClick={() => setApps((value) => !value)}>
              <IconGrid />
            </button>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search agents"
            />
          </form>
          {apps ? (
            <div className="popover apps-pop">
              <button type="button" onClick={() => { setApps(false); setSettingsPage("home"); setSettingsOpen(true); }}>Settings</button>
              <button type="button" onClick={() => { setApps(false); setSettingsPage("vault"); setSettingsOpen(true); }}>Vault</button>
              <button type="button" onClick={() => { setApps(false); setSettingsPage("audit"); setSettingsOpen(true); }}>Audit</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {showChat ? (
        <section className="chat" aria-label={agent ? agent.name : "Chat"}>
          {agent ? (
            <>
              <header className="chat-top">
                <button type="button" className="round" aria-label="Back" onClick={() => router.push("/chat")}>
                  <IconChevronLeft />
                </button>
                <button type="button" className="who" onClick={() => setInfoOpen(true)}>
                  <BlobAvatar color={agent.color} icon={agent.icon} size={28} label={agent.name} />
                  <span>{agent.name}</span>
                </button>
                <button type="button" className="round" aria-label="Send feedback" onClick={() => window.dispatchEvent(new Event("hatch-feedback"))}>
                  <IconFlag />
                </button>
                <button type="button" className="round" aria-label="More" onClick={() => setMoreOpen(true)}>
                  <IconDots />
                </button>
              </header>
              {chatSearch ? (
                <input className="find" value={find} onChange={(event) => setFind(event.target.value)} placeholder="Search in chat" aria-label="Search in chat" />
              ) : null}
              <div
                className="stream"
                ref={streamRef}
                onScroll={(event) => {
                  const el = event.currentTarget;
                  stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
                }}
              >
                {!visibleMessages.length && !find ? (
                  <div className="empty-welcome">
                    <BlobAvatar color={agent.color} icon={agent.icon} size={56} label={agent.name} />
                    <h2>Hi{account && account !== "Partner" ? `, ${account}` : ""} — I’m {agent.name}</h2>
                    <p>{agent.description || "Ask a question, search firm files, or draft a memo."}</p>
                    <div className="starters" role="list" aria-label="Suggested prompts">
                      {startersForAgent(agent).map((starter) => (
                        <button key={starter} type="button" onClick={() => void send(starter)}>
                          {starter}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {visibleMessages.map((message) => {
                  const parsed = choicesOf(message.text);
                  const mine = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={`turn${mine ? " mine" : ""}`}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setHold(message.id);
                      }}
                    >
                      {!mine ? <BlobAvatar color={agent.color} icon={agent.icon} size={22} label={agent.name} /> : null}
                      <div>
                        {message.replyTo ? <span className="quote">{message.replyTo.text}</span> : null}
                        <div className={mine ? "bubble user" : "bubble agent"}>
                          {mine ? parsed.body : parsed.body ? <MarkdownPreview text={parsed.body} /> : null}
                          {(message.attachments || []).map((file) => (
                            <span key={`${message.id}-${file.name}`} className="file-chip">{file.name}</span>
                          ))}
                          {!message.done && !parsed.body ? <span className="os-caret" /> : null}
                        </div>
                        {message.failed ? (
                          <div className="retry">
                            {/sign-in expired/i.test(message.text) ? (
                              <button type="button" onClick={() => router.push("/signin")}>Sign in</button>
                            ) : (
                              <button type="button" onClick={() => void send(message.retryQuery || parsed.body, { plain: true })}>Retry</button>
                            )}
                          </div>
                        ) : null}
                        {(message.tools || []).map((tool, index) => (
                          <details key={`${message.id}-t-${index}`} className="tool-row">
                            <summary>{actionTitle(tool.name)}</summary>
                            <p>{tool.input || "—"}</p>
                            <p>{tool.detail}</p>
                          </details>
                        ))}
                        {message.approval ? (
                          <div className="approve">
                            <strong>{message.approval.title}</strong>
                            <p>{message.approval.summary}</p>
                            {message.approval.status === "pending" ? (
                              <div className="row-actions">
                                <button type="button" onClick={() => void decide(message, "approved")}>Approve</button>
                                <button type="button" className="ghost" onClick={() => void decide(message, "cancelled")}>Deny</button>
                              </div>
                            ) : (
                              <p>{message.approval.status === "approved" ? "Approved" : "Denied"}</p>
                            )}
                          </div>
                        ) : null}
                        {parsed.choices.length ? (
                          <div className="choices">
                            {parsed.choices.map((choice) => (
                              <button key={choice} type="button" onClick={() => void send(choice)}>{choice}</button>
                            ))}
                          </div>
                        ) : null}
                        {message.reactions?.length ? <span className="reacts">{message.reactions.join(" ")}</span> : null}
                        {hold === message.id ? (
                          <div className="hold">
                            {["👍", "👀", "✅"].map((emoji) => (
                              <button key={emoji} type="button" onClick={() => void react(message, emoji)}>{emoji}</button>
                            ))}
                            <button type="button" onClick={() => void navigator.clipboard.writeText(parsed.body)}>Copy</button>
                            <button type="button" onClick={() => { setReply(parsed.body.slice(0, 80)); setHold(null); }}>Reply</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {statusNote ? <p className="working" role="status">{statusNote}</p> : streaming ? <p className="working" role="status">Working…</p> : null}
                <div ref={endRef} />
              </div>
              {reply ? (
                <p className="replying">
                  {reply}
                  <button type="button" className="icon" onClick={() => setReply(null)} aria-label="Clear reply"><IconX size={14} /></button>
                </p>
              ) : null}
              <form className="composer" onSubmit={onSubmit}>
                {chips.length ? (
                  <div className="file-chips">
                    {chips.map((chip) => (
                      <span key={chip.id} className="file-chip">
                        <span>{chip.name}</span>
                        {chip.note ? <span>{chip.note}</span> : null}
                        <button type="button" aria-label={`Remove ${chip.name}`} onClick={() => setChips((current) => current.filter((item) => item.id !== chip.id))}>
                          <IconX size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="composer-row">
                  <button type="button" className="round" aria-label="Attach" onClick={() => setAttachOpen((value) => !value)}><IconPlus /></button>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    placeholder={`Ask ${agent.name}`}
                    aria-label={`Ask ${agent.name}`}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send(draft);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="send"
                    aria-label="Send"
                    disabled={!draft.trim() && !chips.length}
                  >
                    <IconArrowUp />
                  </button>
                </div>
              </form>
              {attachOpen ? (
                <div className="popover attach" role="menu">
                  <button type="button" onClick={() => photoRef.current?.click()}><span>Photo or Video</span><IconImage /></button>
                  <button type="button" onClick={() => cameraRef.current?.click()}><span>Take Photo</span><IconCamera /></button>
                  <button type="button" onClick={() => scanRef.current?.click()}><span>Scan Document</span><IconScan /></button>
                  <button type="button" onClick={() => fileRef.current?.click()}><span>Choose File</span><IconFile /></button>
                </div>
              ) : null}
              <input ref={photoRef} hidden type="file" accept="image/*,video/*,.heic,.heif" onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ""; void attach(picked); }} />
              <input ref={cameraRef} hidden type="file" accept="image/*,.heic,.heif" capture="environment" onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ""; void attach(picked); }} />
              <input ref={scanRef} hidden type="file" accept="image/*,.heic,.heif,application/pdf" capture="environment" onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ""; void attach(picked); }} />
              <input ref={fileRef} hidden type="file" accept={ACCEPT_ATTR} onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ""; void attach(picked); }} />
            </>
          ) : (
            <div className="chat-empty">
              <p>Choose an agent.</p>
            </div>
          )}
        </section>
      ) : null}

      {menu ? (
        <div className="agent-menu" role="menu">
          <button type="button" onClick={() => { const item = agents.find((entry) => entry.id === menu.id); if (item) void saveAgent({ ...item, pinned: !item.pinned }); setMenu(null); }}>{agents.find((entry) => entry.id === menu.id)?.pinned ? "Unpin" : "Pin"}</button>
          <button type="button" onClick={() => { const item = agents.find((entry) => entry.id === menu.id); const name = window.prompt("Rename", item?.name || ""); if (name && item) void saveAgent({ ...item, name }); setMenu(null); }}>Rename</button>
          <button type="button" onClick={() => { if (window.confirm("Remove this agent?")) void fetch(`/api/agents?id=${menu.id}`, { method: "DELETE" }).then(() => load()); setMenu(null); }}>Delete</button>
          <button type="button" onClick={() => setMenu(null)}>Close</button>
        </div>
      ) : null}

      {moreOpen && agent ? (
        <div className="sheet" role="dialog" aria-label="Agent menu">
          <button type="button" onClick={() => { setMoreOpen(false); setInfoOpen(true); }}>Agent info</button>
          <button type="button" onClick={() => { setMoreOpen(false); setAgentSettings(true); }}>Settings</button>
          <button type="button" onClick={() => { setMoreOpen(false); setChatSearch((value) => !value); }}>Search in chat</button>
          <button type="button" onClick={() => { void saveAgent({ ...agent, muted: !agent.muted }); setMoreOpen(false); }}>{agent.muted ? "Unmute" : "Mute"}</button>
          <button type="button" onClick={() => setMoreOpen(false)}>Close</button>
        </div>
      ) : null}

      {infoOpen && agent ? (
        <InfoPane
          agent={agent}
          onClose={() => setInfoOpen(false)}
          onSettings={() => { setInfoOpen(false); setAgentSettings(true); }}
        />
      ) : null}

      {agentSettings && agent ? (
        <AgentSettings
          agent={agent}
          scope={session?.inviteCode || "staff"}
          onClose={() => setAgentSettings(false)}
          onSave={async (patch) => {
            await saveAgent(patch);
            setAgentSettings(false);
          }}
        />
      ) : null}

      {creating ? (
        <NewAgent
          error={createError}
          onClose={() => {
            setCreateError("");
            setCreating(false);
          }}
          onCreate={async (input) => {
            setCreateError("");
            try {
              const res = await fetch("/api/agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
              });
              const data = (await res.json().catch(() => null)) as { agent?: HatchAgent; error?: string } | null;
              if (!res.ok || !data?.agent) {
                setCreateError(data?.error || "Could not create that agent.");
                return;
              }
              rememberAgent(data.agent);
              setAgents((prev) => [data.agent!, ...prev.filter((item) => item.id !== data.agent!.id)]);
              setCreating(false);
              router.push(`/chat?agent=${data.agent.id}`);
              void load();
            } catch {
              setCreateError("Could not create that agent. The request did not finish.");
            }
          }}
        />
      ) : null}

      {settingsOpen ? <SettingsScreen key={settingsPage} initialPage={settingsPage} onClose={() => setSettingsOpen(false)} /> : null}

      {palette ? (
        <div className="sheet" role="dialog" aria-label="Search">
          <input autoFocus placeholder="Jump to an agent" aria-label="Command" onChange={(event) => setQuery(event.target.value)} />
          {rows.slice(0, 6).map((item) => (
            <button key={item.id} type="button" onClick={() => { setPalette(false); router.push(`/chat?agent=${item.id}`); }}>{item.name}</button>
          ))}
          <button type="button" onClick={() => { setPalette(false); router.push("/settings"); }}>Settings</button>
          <button type="button" onClick={() => setPalette(false)}>Close</button>
        </div>
      ) : null}
    </div>
  );

  async function decide(message: ChatMessage, decision: "approved" | "cancelled") {
    if (!activeThread || !message.approval) return;
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: activeThread,
        messageId: message.id,
        decision,
        actor,
        accessibleDepartments: accessible.filter(Boolean),
        enterprise: session?.enterprise,
        testerCode: session?.inviteCode || "staff",
      }),
    });
    const data = (await res.json().catch(() => null)) as { message?: ChatMessage };
    if (data?.message && agent) {
      const next = (readTranscripts().find((item) => item.agentId === agent.id)?.messages || messages).map((item) =>
        item.id === message.id ? data.message! : item,
      );
      rememberConversation(agent.id, activeThread, agent.departmentId, next);
    }
  }

  async function react(message: ChatMessage, emoji: string) {
    if (!activeThread) return;
    const reactions = Array.from(new Set([...(message.reactions || []), emoji]));
    if (agent) {
      const next = (readTranscripts().find((item) => item.agentId === agent.id)?.messages || messages).map((item) =>
        item.id === message.id ? { ...item, reactions } : item,
      );
      rememberConversation(agent.id, activeThread, agent.departmentId, next);
    }
    setHold(null);
    await fetch("/api/threads/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: activeThread, messageId: message.id, reactions }),
    });
  }
}

function InfoPane({ agent, onClose, onSettings }: { agent: HatchAgent; onClose: () => void; onSettings: () => void }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void fetch("/api/routines", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { routines?: Routine[] }) => setRoutines((data.routines || []).filter((item) => item.agentId === agent.id)));
    void fetch("/api/departments", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { departments?: { id: string; files: { id: string; name: string }[] }[] }) => {
        const room = (data.departments || []).find((item) => item.id === agent.departmentId || item.id === agent.writeDepartmentId);
        setFiles(room?.files?.slice(0, 6) || []);
      });
  }, [agent]);
  return (
    <aside className="info" role="dialog" aria-label={`${agent.name} info`}>
      <header>
        <button type="button" className="round" onClick={onClose} aria-label="Close"><IconX /></button>
        <button type="button" className="round" onClick={onSettings} aria-label="Agent settings"><IconSettings /></button>
      </header>
      <BlobAvatar color={agent.color} icon={agent.icon} size={84} label={agent.name} />
      <h2>{agent.name}</h2>
      <p>{agent.description}</p>
      <h3>Routines</h3>
      {routines.map((routine) => (
        <p key={routine.id} className="info-row">
          <strong>{routine.name}</strong> · {routine.schedule} · {routine.enabled ? "On" : "Paused"}
          <button type="button" onClick={() => void fetch("/api/routines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...routine, enabled: !routine.enabled }) }).then(() => setRoutines((prev) => prev.map((item) => item.id === routine.id ? { ...item, enabled: !item.enabled } : item)))}>{routine.enabled ? "Pause" : "Resume"}</button>
        </p>
      ))}
      <button type="button" onClick={() => {
        const name = window.prompt("Routine name", "Afternoon check");
        const prompt = name ? window.prompt("Prompt", "What should be ready?") : null;
        if (!name || !prompt) return;
        void fetch("/api/routines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: agent.id, name, prompt, schedule: "weekdays 17:00" }) })
          .then((res) => res.json())
          .then((data: { routine?: Routine }) => { if (data.routine) setRoutines((prev) => [data.routine!, ...prev]); });
      }}>Add routine</button>
      <h3>Sources</h3>
      <p className="fine">File room on this system. Google Drive is not connected.</p>
      <h3>Files</h3>
      {files.length ? files.map((file) => <p key={file.id} className="info-row">{file.name}</p>) : <p className="fine">No files in this room yet.</p>}
    </aside>
  );
}

function AgentSettings({
  agent,
  scope,
  onClose,
  onSave,
}: {
  agent: HatchAgent;
  scope: string;
  onClose: () => void;
  onSave: (patch: HatchAgent) => Promise<void>;
}) {
  const [name, setName] = useState(agent.name);
  const [title, setTitle] = useState(agent.title);
  const [description, setDescription] = useState(agent.description);
  const [model, setModel] = useState(agent.model || FIRM_MODEL);
  const [notifications, setNotifications] = useState(agent.notifications);
  const [color] = useState(agent.color);
  const [icon, setIcon] = useState(agent.icon || "brackets");
  return (
    <div className="sheet settings-sheet" role="dialog" aria-label="Agent settings">
      <header>
        <button type="button" className="round" aria-label="Close" onClick={onClose}><IconX /></button>
        <strong>Settings</strong>
        <button type="button" onClick={() => void onSave({ ...agent, name, title, description, model, notifications, color, icon })}>Save</button>
      </header>
      <BlobAvatar color={color} icon={icon} size={72} label={name} />
      <p className="set-label">Bot icon</p>
      <IconPicker value={icon} onChange={setIcon} />
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Instructions<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Model
        <select value={model} onChange={(event) => setModel(event.target.value)}>
          <option>{FIRM_MODEL}</option>
          <option>Qwen</option>
          <option>Hermes</option>
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} /> Notifications</label>
      <ModelEthics scope={scope} agentId={agent.id} />
    </div>
  );
}

function NewAgent({
  error,
  onClose,
  onCreate,
}: {
  error?: string;
  onClose: () => void;
  onCreate: (input: { name: string; description: string; color: string; icon: string; model: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState(FIRM_MODEL);
  const [color] = useState<string>(AGENT_COLORS[0]);
  const [icon, setIcon] = useState("brackets");
  return (
    <div className="sheet settings-sheet" role="dialog" aria-label="New agent">
      <header>
        <button type="button" className="round" aria-label="Close" onClick={onClose}><IconX /></button>
        <strong>New agent</strong>
        <button type="button" disabled={!name.trim()} onClick={() => void onCreate({ name, description, color, icon, model })}>Create</button>
      </header>
      {error ? <p className="os-error" role="alert">{error}</p> : null}
      <BlobAvatar color={color} icon={icon} size={72} label={name || "Hatch"} />
      <p className="set-label">Bot icon</p>
      <IconPicker value={icon} onChange={setIcon} />
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Research" /></label>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this agent is for" /></label>
      <label>Model
        <select value={model} onChange={(event) => setModel(event.target.value)}>
          <option>{FIRM_MODEL}</option>
          <option>Qwen</option>
          <option>Hermes</option>
        </select>
      </label>
    </div>
  );
}

