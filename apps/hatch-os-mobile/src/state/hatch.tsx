import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ApiError,
  createThread as createThreadRequest,
  deleteThread as deleteThreadRequest,
  extractFile,
  hostStatus,
  ingestFile,
  listAgents,
  listFiles,
  listThreads,
  pollTurn,
  postApproval,
  postChat,
  postEmailDraft,
  type ChatRequest,
  type LocalUpload,
} from "@/api/client";
import type { Agent, ChatAttachment, ChatMessage, ChatThread, DraftFile, EmailDraftCard as EmailDraftCardType, HatchFile, HostStatus } from "@/api/types";
import { DEMO_AGENTS, demoThreads } from "@/demo/seed";
import { demoMode } from "@/demo/mode";
import { accessibleDepartments, acceptedFilename, activityLine, explainFailure, isWaitStatus, kindFromFilename, presenceState } from "@/lib/derive";
import { isPhoto, keepImage, preparePhoto } from "@/lib/photos";
import { hapticWarning } from "@/lib/haptics";
import type { SphereState } from "@/shader/sphereStates";
import { useSession } from "./session";

interface Turn {
  agentId: string;
  threadId?: string;
  messages: ChatMessage[];
  phase: SphereState;
  status: string;
}

interface SendInput {
  agentId: string;
  threadId?: string;
  text: string;
  attachments?: DraftFile[];
  voice?: boolean;
}

interface QueueItem extends SendInput {
  resolve: (result: { text: string; failed: boolean }) => void;
}

interface HatchValue {
  agents: Agent[];
  threads: ChatThread[];
  files: HatchFile[];
  status: HostStatus | null;
  hostError: string;
  refreshing: boolean;
  turns: Record<string, Turn>;
  sphere: SphereState;
  refresh: () => Promise<void>;
  send: (input: SendInput) => Promise<{ text: string; failed: boolean }>;
  decide: (input: { threadId: string; messageId: string; decision: "approved" | "cancelled" }) => Promise<string | null>;
  actOnEmailDraft: (input: { threadId?: string; messageId: string; action: "send" | "save_draft" | "discard"; to: string; subject: string; body: string; draft?: Partial<EmailDraftCardType> }) => Promise<string | null>;
  prepareAttachment: (file: LocalUpload & { id?: string }, departmentId: string, onUpdate?: (patch: Partial<DraftFile>) => void) => Promise<DraftFile>;
  startThread: (agentId: string) => Promise<string | null>;
  archiveThread: (threadId: string) => Promise<void>;
  messagesFor: (agentId: string, threadId?: string) => ChatMessage[];
  phaseFor: (agentId: string) => SphereState;
}

const HatchContext = createContext<HatchValue | null>(null);

function latestThread(threads: ChatThread[], agentId: string, threadId?: string): ChatThread | undefined {
  if (threadId) return threads.find((thread) => thread.id === threadId);
  return threads
    .filter((thread) => thread.agentId === agentId && !thread.archived)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return explainFailure(error.message, error.status);
  if (error instanceof Error) return explainFailure(error.message);
  return explainFailure("");
}

export function HatchProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [files, setFiles] = useState<HatchFile[]>([]);
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [hostError, setHostError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [turns, setTurns] = useState<Record<string, Turn>>({});
  const turnsRef = useRef(turns);
  const threadsRef = useRef(threads);
  const agentsRef = useRef(agents);
  const sessionRef = useRef(session);
  const queues = useRef<Record<string, QueueItem[]>>({});
  const pumping = useRef<Set<string>>(new Set());
  const generation = useRef(0);
  const seenApprovals = useRef<Set<string>>(new Set());
  const sawApprovals = useRef(false);

  turnsRef.current = turns;
  threadsRef.current = threads;
  agentsRef.current = agents;
  sessionRef.current = session;

  const writeTurn = useCallback((agentId: string, recipe: (current: Turn | undefined) => Turn | undefined) => {
    const nextTurn = recipe(turnsRef.current[agentId]);
    const next = { ...turnsRef.current };
    if (nextTurn) next[agentId] = nextTurn;
    else delete next[agentId];
    turnsRef.current = next;
    setTurns(next);
  }, []);

  const refresh = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    if (demoMode()) {
      setAgents(DEMO_AGENTS);
      setThreads((existing) => (existing.length ? existing : demoThreads()));
      setFiles([]);
      setStatus({ ok: true, label: "Demo seed on this phone", modelState: "demo" });
      setHostError("");
      return;
    }
    setRefreshing(true);
    try {
      const departments = Array.from(new Set([current.homeDepartment, ...current.departments].filter(Boolean)));
      const [agentsResult, threadsResult, statusResult, ...fileResults] = await Promise.allSettled([
        listAgents(),
        listThreads(),
        hostStatus(),
        ...departments.map((id) => listFiles(id)),
      ]);
      if (agentsResult.status === "fulfilled") setAgents(agentsResult.value);
      if (threadsResult.status === "fulfilled") {
        threadsRef.current = threadsResult.value;
        setThreads(threadsResult.value);
      }
      if (statusResult.status === "fulfilled") setStatus(statusResult.value);
      setFiles(fileResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
      const failed = [agentsResult, threadsResult].find((result) => result.status === "rejected");
      setHostError(failed && failed.status === "rejected" ? messageOf(failed.reason) : "");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      generation.current += 1;
      setAgents([]);
      setThreads([]);
      setFiles([]);
      setStatus(null);
      setTurns({});
      turnsRef.current = {};
      queues.current = {};
      return;
    }
    void refresh();
  }, [refresh, session]);

  useEffect(() => {
    const ids = new Set<string>();
    for (const thread of threads) {
      for (const message of thread.messages || []) {
        if (message.approval?.status === "pending") ids.add(message.approval.id || message.id);
      }
    }
    if (sawApprovals.current) {
      for (const id of ids) {
        if (!seenApprovals.current.has(id)) void hapticWarning();
      }
    }
    sawApprovals.current = true;
    seenApprovals.current = ids;
  }, [threads]);

  const prepareAttachment = useCallback(async (file: LocalUpload & { id?: string }, departmentId: string, onUpdate?: (patch: Partial<DraftFile>) => void) => {
    const id = file.id || `file-${Date.now()}`;
    let current: LocalUpload = file;
    const draft: DraftFile = {
      id,
      name: file.name,
      kind: kindFromFilename(file.name),
      uri: file.uri,
      mimeType: file.mimeType,
      reading: true,
      note: "Preparing…",
    };
    if (isPhoto(file.name, file.mimeType)) {
      try {
        current = await preparePhoto(file);
        draft.name = current.name;
        draft.uri = current.uri;
        draft.mimeType = current.mimeType;
        draft.kind = "Image";
        draft.note = "Uploading…";
        onUpdate?.({ name: draft.name, uri: draft.uri, mimeType: draft.mimeType, kind: "Image", note: "Uploading…" });
      } catch (error) {
        draft.reading = false;
        draft.error = error instanceof Error ? error.message : "Could not prepare this photo.";
        draft.note = draft.error;
        return draft;
      }
    }
    if (!acceptedFilename(draft.name)) {
      draft.reading = false;
      draft.error = "Could not read this file. Try a PDF, Office file, markdown, or a photo.";
      draft.note = draft.error;
      return draft;
    }
    draft.note = "Uploading…";
    onUpdate?.({ note: "Uploading…" });
    try {
      const extracted = await extractFile(current);
      draft.text = extracted.text;
      draft.note = extracted.note || "Uploading…";
    } catch (error) {
      draft.note = error instanceof Error ? error.message : "Could not read this file. The model will only see the filename.";
    }
    try {
      const saved = await ingestFile(current, {
        departmentId,
        accessibleDepartments: accessibleDepartments(sessionRef.current, departmentId),
      });
      if (saved.id) {
        draft.fileId = saved.id;
        if (draft.kind === "Image") {
          try {
            draft.uri = await keepImage(saved.id, draft.uri);
          } catch {
            /* The preview still uses the uri from this session. */
          }
        }
        draft.note = draft.text ? "On your firm’s host" : draft.note || "On your firm’s host";
        draft.error = undefined;
      } else {
        draft.error = saved.error || "The upload did not reach your firm’s host.";
        draft.note = draft.error;
      }
    } catch (error) {
      draft.error = error instanceof Error ? error.message : "The upload did not reach your firm’s host.";
      draft.note = draft.error;
    }
    draft.reading = false;
    return draft;
  }, []);

  const runItem = useCallback(
    async (item: QueueItem, gen: number) => {
      const agent = agentsRef.current.find((entry) => entry.id === item.agentId) || agentsRef.current[0];
      const currentSession = sessionRef.current;
      const assistantId = `local-a-${Date.now()}`;
      if (!agent || !currentSession) {
        item.resolve({ text: "", failed: true });
        return;
      }
      writeTurn(item.agentId, (current) => ({
        agentId: item.agentId,
        threadId: item.threadId || current?.threadId,
        phase: "thinking",
        status: "Thinking…",
          messages: [
            ...(current?.messages || []),
            { id: assistantId, role: "assistant", text: "", done: false },
          ],
      }));
      const patchAssistant = (patch: Partial<ChatMessage>, phase: SphereState, status: string) => {
        writeTurn(item.agentId, (current) => {
          if (!current) return current;
          return {
            ...current,
            phase,
            status,
            messages: current.messages.map((message) => (message.id === assistantId || message.id === patch.id ? { ...message, ...patch } : message)),
          };
        });
      };
      const display = item.text.trim() || (item.attachments || []).map((file) => file.name).join(", ");
      const context = (item.attachments || [])
        .map((file) =>
          file.text
            ? `Attached file ${file.name}\n${file.text.slice(0, 8000)}`
            : `Attached file ${file.name}\n${file.note || "No text could be read from this file."}`,
        )
        .join("\n\n");
      const attachments: ChatAttachment[] = (item.attachments || [])
        .filter((file) => file.fileId && !file.error)
        .map((file) => ({
          fileId: file.fileId || file.id,
          name: file.name,
          kind: file.kind,
          text: file.text,
          note: file.note,
          previewUri: file.kind === "Image" ? file.uri : undefined,
        }));
      const threadId = item.threadId || turnsRef.current[item.agentId]?.threadId;
      const body: ChatRequest = {
        departmentId: agent.departmentId,
        defaultDepartmentId: agent.writeDepartmentId,
        threadId,
        query: display,
        context,
        agentId: agent.id,
        actor: `${currentSession.role} · ${currentSession.deviceName}`,
        failFast: true,
        approvals: "wait",
        accessibleDepartments: accessibleDepartments(currentSession, agent.writeDepartmentId),
        enterprise: currentSession.enterprise,
        testerCode: currentSession.inviteCode || "staff",
        attachments: attachments.length ? attachments : undefined,
      };
      const shouldContinue = () => generation.current === gen;
      try {
        let payload = await postChat(body, (text) => {
          if (!isWaitStatus(text)) patchAssistant({ text, done: false }, "thinking", "Thinking…");
        });
        if (payload.phase === "wait" && payload.state && shouldContinue()) {
          const note = activityLine(payload.note, payload.tools);
          patchAssistant({ done: false }, "thinking", note);
          if (payload.threadId) writeTurn(item.agentId, (current) => (current ? { ...current, threadId: payload.threadId } : current));
          payload = await pollTurn(payload.state, (note, tools) => {
            const line = activityLine(note, tools);
            patchAssistant({ done: false }, "thinking", line);
          }, shouldContinue);
        }
        if (!shouldContinue()) {
          item.resolve({ text: "", failed: true });
          return;
        }
        const text = payload.text || "";
        const waiting = isWaitStatus(text);
        const hasDraft = Boolean(payload.emailDraft);
        const failed = (!text && !waiting && !hasDraft) || Boolean(payload.error) || Boolean(payload.modelOffline);
        const shown = waiting ? "" : hasDraft ? text : text || (payload.modelOffline ? explainFailure("offline") : "The model returned an empty reply.");
        const approval = payload.approval;
        patchAssistant(
          {
            id: payload.messageId || assistantId,
            text: shown,
            done: true,
            failed,
            retryQuery: failed ? display : undefined,
            tools: [],
            sources: payload.sources || [],
            approval,
            emailDraft: payload.emailDraft,
          },
          approval?.status === "pending" ? "needsApproval" : "idle",
          approval?.status === "pending" ? "Needs your approval" : "",
        );
        if (payload.threadId) {
          writeTurn(item.agentId, (current) => (current ? { ...current, threadId: payload.threadId } : current));
        }
        await refresh();
        const serverThread = threadsRef.current.find((thread) => thread.id === (payload.threadId || threadId));
        const localCount = turnsRef.current[item.agentId]?.messages.length || 0;
        if (serverThread && serverThread.messages.length >= localCount) {
          writeTurn(item.agentId, () => undefined);
        }
        item.resolve({ text: failed ? "" : shown, failed });
      } catch (error) {
        const text = messageOf(error);
        patchAssistant({ text, done: true, failed: true, retryQuery: display }, "idle", "");
        item.resolve({ text: "", failed: true });
      }
    },
    [refresh, writeTurn],
  );

  const pump = useCallback(
    async (agentId: string) => {
      if (pumping.current.has(agentId)) return;
      pumping.current.add(agentId);
      const gen = generation.current;
      try {
        while (generation.current === gen) {
          const item = queues.current[agentId]?.shift();
          if (!item) break;
          await runItem(item, gen);
        }
      } finally {
        pumping.current.delete(agentId);
        if ((queues.current[agentId]?.length || 0) > 0 && generation.current === gen) void pump(agentId);
      }
    },
    [runItem],
  );

  const send = useCallback(
    (input: SendInput) =>
      new Promise<{ text: string; failed: boolean }>((resolve) => {
        const text = input.text.trim();
        const files = input.attachments || [];
        if (!text && files.length === 0) {
          resolve({ text: "", failed: true });
          return;
        }
        const user: ChatMessage = {
          id: `local-u-${Date.now()}`,
          role: "user",
          text: text || files.map((file) => file.name).join(", "),
          done: true,
          attachments: files.map((file) => ({
            fileId: file.fileId || file.id,
            name: file.name,
            kind: file.kind,
            text: file.text,
            note: file.note,
            previewUri: file.kind === "Image" ? file.uri : undefined,
          })),
        };
        const existing = turnsRef.current[input.agentId];
        const base = existing?.messages || latestThread(threadsRef.current, input.agentId, input.threadId)?.messages || [];
        writeTurn(input.agentId, () => ({
          agentId: input.agentId,
          threadId: input.threadId || existing?.threadId,
          phase: existing?.phase || "thinking",
          status: existing?.status || "Thinking…",
          messages: [...base, user],
        }));
        const queue = queues.current[input.agentId] || [];
        queue.push({ ...input, text, resolve });
        queues.current[input.agentId] = queue;
        void pump(input.agentId);
      }),
    [pump, writeTurn],
  );

  const decide = useCallback(
    async (input: { threadId: string; messageId: string; decision: "approved" | "cancelled" }) => {
      const current = sessionRef.current;
      if (!current) return "Sign in again to keep chatting.";
      const apply = (status: "pending" | "approved" | "cancelled") => {
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id !== input.threadId
              ? thread
              : {
                  ...thread,
                  messages: thread.messages.map((message) =>
                    message.id === input.messageId && message.approval ? { ...message, approval: { ...message.approval, status } } : message,
                  ),
                },
          ),
        );
      };
      apply(input.decision);
      try {
        await postApproval({
          ...input,
          actor: `${current.role} · ${current.deviceName}`,
          accessibleDepartments: accessibleDepartments(current),
          enterprise: current.enterprise,
          testerCode: current.inviteCode || "staff",
        });
        await refresh();
        return null;
      } catch (error) {
        apply("pending");
        return messageOf(error);
      }
    },
    [refresh],
  );

  const actOnEmailDraft = useCallback(
    async (input: {
      threadId?: string;
      messageId: string;
      action: "send" | "save_draft" | "discard";
      to: string;
      subject: string;
      body: string;
      draft?: Partial<EmailDraftCardType>;
    }) => {
      try {
        const res = await postEmailDraft(input);
        if (!res.ok || !res.emailDraft) return res.error || "Could not complete that action.";
        const nextDraft = res.emailDraft;
        setThreads((prev) =>
          prev.map((thread) =>
            input.threadId && thread.id !== input.threadId
              ? thread
              : {
                  ...thread,
                  messages: thread.messages.map((message) =>
                    message.id === input.messageId ? { ...message, emailDraft: nextDraft } : message,
                  ),
                },
          ),
        );
        for (const [aid, turn] of Object.entries(turnsRef.current)) {
          if (turn.messages.some((m) => m.id === input.messageId)) {
            writeTurn(aid, (current) =>
              current
                ? {
                    ...current,
                    messages: current.messages.map((m) =>
                      m.id === input.messageId ? { ...m, emailDraft: nextDraft } : m,
                    ),
                  }
                : current,
            );
          }
        }
        await refresh();
        return null;
      } catch (error) {
        return messageOf(error);
      }
    },
    [refresh, writeTurn],
  );

  const startThread = useCallback(async (agentId: string) => {
    const agent = agentsRef.current.find((entry) => entry.id === agentId);
    if (!agent) return null;
    if (demoMode()) {
      const now = new Date().toISOString();
      const thread = { id: `local-${Date.now()}`, title: "New thread", departmentId: agent.departmentId, agentId: agent.id, createdAt: now, updatedAt: now, messages: [] };
      setThreads((prev) => [thread, ...prev]);
      threadsRef.current = [thread, ...threadsRef.current];
      return thread.id;
    }
    const thread = await createThreadRequest({
      departmentId: agent.departmentId,
      agentId: agent.id,
      title: "New thread",
    });
    setThreads((prev) => [thread, ...prev.filter((item) => item.id !== thread.id)]);
    threadsRef.current = [thread, ...threadsRef.current.filter((item) => item.id !== thread.id)];
    return thread.id;
  }, []);

  const archiveThread = useCallback(async (threadId: string) => {
    setThreads((prev) => prev.filter((item) => item.id !== threadId));
    threadsRef.current = threadsRef.current.filter((item) => item.id !== threadId);
    for (const [agentId, turn] of Object.entries(turnsRef.current)) {
      if (turn.threadId === threadId) {
        writeTurn(agentId, () => undefined);
      }
    }
    if (!demoMode()) {
      await deleteThreadRequest(threadId).catch(() => undefined);
    }
  }, [writeTurn]);

  const messagesFor = useCallback(
    (agentId: string, threadId?: string) => {
      const turn = turns[agentId];
      if (turn && (!threadId || !turn.threadId || turn.threadId === threadId)) return turn.messages;
      return latestThread(threads, agentId, threadId)?.messages || [];
    },
    [threads, turns],
  );

  const phaseFor = useCallback(
    (agentId: string): SphereState => turns[agentId]?.phase || "idle",
    [turns],
  );

  const sphere = presenceState(
    Object.values(turns).map((turn) => turn.phase),
    threads,
  );

  const value = useMemo<HatchValue>(
    () => ({
      agents,
      threads,
      files,
      status,
      hostError,
      refreshing,
      turns,
      sphere,
      refresh,
      send,
      decide,
      actOnEmailDraft,
      prepareAttachment,
      startThread,
      archiveThread,
      messagesFor,
      phaseFor,
    }),
    [actOnEmailDraft, agents, decide, files, hostError, messagesFor, phaseFor, prepareAttachment, refresh, refreshing, send, sphere, archiveThread, startThread, status, threads, turns],
  );

  return <HatchContext.Provider value={value}>{children}</HatchContext.Provider>;
}

export function useHatch(): HatchValue {
  const value = useContext(HatchContext);
  if (!value) throw new Error("useHatch must be used inside HatchProvider");
  return value;
}
