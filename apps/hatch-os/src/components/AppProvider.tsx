"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isAcceptedFilename, kindFromFilename, REJECT_COPY } from "@/lib/files";
import {
  ENTERPRISE,
  ENTERPRISE_WORKSPACE,
  HQ_OPS,
  INITIAL_DEPARTMENTS,
  INITIAL_DEVICES,
  INITIAL_SEATS,
  LITTLE_ELM,
  SEAT_LINE,
} from "@/lib/mock-data";
import { isEnterprise, migrateWorkspaceId, uxIsolation, workspaceLabel } from "@/lib/departments";
import {
  clearSession,
  landingWorkspace,
  readSession,
  readThreadForWorkspace,
  writeSession,
  writeThreadForWorkspace,
  writeWorkspace,
} from "@/lib/storage";
import type {
  AuthMethod,
  ChatAttachment,
  ChatMessage,
  ChatThread,
  Department,
  DepartmentId,
  Device,
  FileFolder,
  Handoff,
  HatchFile,
  Seat,
  Session,
  Source,
  ToolEvent,
} from "@/lib/types";

interface HatchContextValue {
  ready: boolean;
  session: Session | null;
  currentWorkspaceId: DepartmentId;
  currentWorkspace: Department;
  isEnterpriseView: boolean;
  departments: Department[];
  visibleWorkspaces: Department[];
  folders: FileFolder[];
  currentFiles: HatchFile[];
  currentLibrary: HatchFile[];
  threads: ChatThread[];
  visibleThreads: ChatThread[];
  currentThreadId: string | null;
  currentThread: ChatThread | null;
  streaming: boolean;
  artifactOpen: boolean;
  activeArtifactId: string | null;
  lastSources: Source[] | null;
  lastUsedLibrary: boolean | null;
  handoffs: Handoff[];
  inboundHandoffs: Handoff[];
  seats: Seat[];
  devices: Device[];
  toast: string;
  pairError: string;
  generatedInvite: string;
  emptyDepartmentsDemo: boolean;
  emptySeatsDemo: boolean;
  setWorkspace: (id: DepartmentId) => void;
  newThread: () => Promise<ChatThread | null>;
  selectThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  archiveThread: (id: string) => void;
  pair: (input: { invite: string; totp?: string; device?: string; method: AuthMethod }) => Promise<boolean>;
  signOut: () => void;
  ask: (query: string, opts?: { attachments?: HatchFile[] }) => Promise<void>;
  ingest: (
    file: File,
    opts?: { toLibrary?: boolean; folderId?: string | null; departmentId?: DepartmentId },
  ) => Promise<HatchFile | null>;
  openArtifact: (fileId: string, threadId?: string) => void;
  closeArtifact: () => void;
  openArtifactBySource: (source: Source) => boolean;
  deleteFile: (fileId: string) => void;
  setInLibrary: (fileId: string, inLibrary: boolean) => void;
  importDrive: (departmentId?: DepartmentId) => Promise<void>;
  handoffToDepartment: (toDepartmentId: DepartmentId, summary: string, facts?: string) => Promise<void>;
  createFolder: (name: string) => void;
  mintInvite: () => void;
  revokeSeat: (id: string) => void;
  grantDepartments: (seatId: string, departments: DepartmentId[], enterprise?: boolean) => void;
  createDepartment: () => void;
  startBackup: () => void;
  importUpdate: () => void;
  resetTotp: () => void;
  setEmptyDepartmentsDemo: (v: boolean) => void;
  setEmptySeatsDemo: (v: boolean) => void;
  clearToast: () => void;
  /** @deprecated */
  currentRoomId: DepartmentId;
  /** @deprecated */
  currentRoom: Department;
  /** @deprecated */
  setRoom: (id: DepartmentId) => void;
}

const HatchContext = createContext<HatchContextValue | null>(null);

function cloneDepartments(): Department[] {
  return INITIAL_DEPARTMENTS.map((dept) => ({ ...dept, files: dept.files.map((f) => ({ ...f })) }));
}

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function asSession(data: {
  deviceName?: string;
  method?: AuthMethod;
  role?: "Partner" | "Associate";
  departments?: DepartmentId[];
  rooms?: DepartmentId[];
  enterprise?: boolean;
  homeDepartment?: DepartmentId;
}): Session {
  const departments = (data.departments || data.rooms || [LITTLE_ELM]).map(migrateWorkspaceId).filter((id) => !isEnterprise(id));
  const role = data.role || "Partner";
  return {
    deviceName: data.deviceName || "This browser",
    method: data.method || "totp",
    role,
    departments,
    rooms: departments,
    enterprise: data.enterprise ?? role === "Partner",
    homeDepartment: migrateWorkspaceId(data.homeDepartment || (role === "Partner" ? HQ_OPS : departments[0] || LITTLE_ELM)),
    pairedAt: new Date().toISOString(),
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<DepartmentId>(LITTLE_ELM);
  const [departments, setDepartments] = useState<Department[]>(cloneDepartments);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [lastSources, setLastSources] = useState<Source[] | null>(null);
  const [lastUsedLibrary, setLastUsedLibrary] = useState<boolean | null>(null);
  const [seats, setSeats] = useState<Seat[]>(INITIAL_SEATS);
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [toast, setToast] = useState("");
  const [pairError, setPairError] = useState("");
  const [generatedInvite, setGeneratedInvite] = useState("");
  const [emptyDepartmentsDemo, setEmptyDepartmentsDemo] = useState(false);
  const [emptySeatsDemo, setEmptySeatsDemo] = useState(false);
  const [inviteSeq, setInviteSeq] = useState(0);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [deptRes, threadRes] = await Promise.all([
        fetch("/api/departments", { cache: "no-store" }),
        fetch("/api/threads", { cache: "no-store" }),
      ]);
      if (deptRes.ok) {
        const data = (await deptRes.json()) as {
          departments?: Department[];
          enterprise?: Department;
          handoffs?: Handoff[];
        };
        if (data.departments?.length) setDepartments(data.departments);
        setFolders((data.departments || []).flatMap((d) => d.folders || []));
        if (data.handoffs) setHandoffs(data.handoffs);
      }
      if (threadRes.ok) {
        const data = (await threadRes.json()) as { threads?: ChatThread[] };
        if (data.threads) setThreads(data.threads);
      }
    } catch {
      /* keep stubs */
    }
  }, []);

  useEffect(() => {
    const stored = readSession();
    if (stored) {
      const next = asSession(stored);
      setSession(next);
      setDevices((prev) =>
        prev.map((d) => (d.current ? { ...d, name: stored.deviceName, lastSeen: "This session" } : d)),
      );
      const land = landingWorkspace(next);
      setCurrentWorkspaceId(land);
      const lastThread = readThreadForWorkspace(land);
      if (lastThread) setCurrentThreadId(lastThread);
    }
    void refresh();
    setReady(true);
  }, [refresh]);

  const visibleWorkspaces = useMemo(() => {
    const depts = session ? departments.filter((d) => session.departments.includes(d.id)) : departments;
    if (session?.enterprise) {
      const union: Department = {
        ...ENTERPRISE_WORKSPACE,
        files: departments.flatMap((d) => d.files),
        isolation: uxIsolation(ENTERPRISE),
      };
      return [union, ...depts];
    }
    return depts;
  }, [departments, session]);

  const currentWorkspace = useMemo(
    () => visibleWorkspaces.find((w) => w.id === currentWorkspaceId) || visibleWorkspaces[0] || ENTERPRISE_WORKSPACE,
    [visibleWorkspaces, currentWorkspaceId],
  );

  const isEnterpriseView = isEnterprise(currentWorkspaceId);

  const currentFiles = useMemo(() => {
    if (isEnterpriseView) {
      return departments.flatMap((d) =>
        d.files.map((f) => ({ ...f, folderPath: [workspaceLabel(f.departmentId), f.folderPath].filter(Boolean).join(" / ") })),
      );
    }
    return currentWorkspace.files || [];
  }, [isEnterpriseView, departments, currentWorkspace]);

  const currentLibrary = useMemo(() => currentFiles.filter((f) => f.inLibrary), [currentFiles]);

  const visibleThreads = useMemo(
    () => threads.filter((t) => t.departmentId === currentWorkspaceId && !t.archived),
    [threads, currentWorkspaceId],
  );

  const currentThread = useMemo(
    () => visibleThreads.find((t) => t.id === currentThreadId) || visibleThreads[0] || null,
    [visibleThreads, currentThreadId],
  );

  useEffect(() => {
    if (!ready || !currentThread?.lastArtifactId) return;
    setActiveArtifactId((prev) => prev || currentThread.lastArtifactId || null);
    setArtifactOpen(true);
  }, [ready, currentThread?.id, currentThread?.lastArtifactId]);

  const inboundHandoffs = useMemo(() => {
    if (isEnterpriseView) return handoffs;
    return handoffs.filter((h) => h.toDepartmentId === currentWorkspaceId);
  }, [handoffs, isEnterpriseView, currentWorkspaceId]);

  const setWorkspace = useCallback((id: DepartmentId) => {
    const next = migrateWorkspaceId(id);
    setCurrentWorkspaceId(next);
    writeWorkspace(next);
    const last = readThreadForWorkspace(next);
    setCurrentThreadId(last);
  }, []);

  const persistArtifact = useCallback((threadId: string | null | undefined, fileId: string | null) => {
    if (!threadId) return;
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, lastArtifactId: fileId } : t)));
    void fetch("/api/threads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: threadId, lastArtifactId: fileId }),
    }).catch(() => undefined);
  }, []);

  const openArtifact = useCallback(
    (fileId: string, threadId?: string) => {
      setActiveArtifactId(fileId);
      setArtifactOpen(true);
      persistArtifact(threadId || currentThread?.id || currentThreadId, fileId);
    },
    [currentThread?.id, currentThreadId, persistArtifact],
  );

  const closeArtifact = useCallback(() => {
    setArtifactOpen(false);
  }, []);

  const openArtifactBySource = useCallback(
    (source: Source) => {
      const all = departments.flatMap((d) => d.files);
      const hit =
        all.find((f) => f.name === source.file && (!source.departmentId || f.departmentId === source.departmentId)) ||
        all.find((f) => f.name === source.file);
      if (!hit) {
        setToast("That source isn’t in Files yet.");
        return false;
      }
      openArtifact(hit.id);
      return true;
    },
    [departments, openArtifact],
  );

  const selectThread = useCallback(
    (id: string) => {
      setCurrentThreadId(id);
      writeThreadForWorkspace(currentWorkspaceId, id);
      const thread = threads.find((t) => t.id === id);
      if (thread?.lastArtifactId) {
        setActiveArtifactId(thread.lastArtifactId);
        setArtifactOpen(true);
      } else {
        setArtifactOpen(false);
      }
    },
    [currentWorkspaceId, threads],
  );

  const newThread = useCallback(async () => {
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: currentWorkspaceId }),
      });
      const data = (await res.json()) as { thread?: ChatThread };
      if (data.thread) {
        setThreads((prev) => [data.thread!, ...prev.filter((t) => t.id !== data.thread!.id)]);
        setCurrentThreadId(data.thread.id);
        writeThreadForWorkspace(currentWorkspaceId, data.thread.id);
        setArtifactOpen(false);
        return data.thread;
      }
    } catch {
      setToast("Could not create a thread.");
    }
    return null;
  }, [currentWorkspaceId]);

  const renameThread = useCallback((id: string, title: string) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    void fetch("/api/threads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    }).catch(() => undefined);
  }, []);

  const archiveThread = useCallback((id: string) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, archived: true } : t)));
    if (currentThreadId === id) setCurrentThreadId(null);
    void fetch("/api/threads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, archived: true }),
    }).catch(() => undefined);
  }, [currentThreadId]);

  const pair = useCallback(
    async (input: { invite: string; totp?: string; device?: string; method: AuthMethod }) => {
      setPairError("");
      try {
        const res = await fetch("/api/auth/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as {
          error?: string;
          deviceName?: string;
          method?: AuthMethod;
          role?: "Partner" | "Associate";
          departments?: DepartmentId[];
          rooms?: DepartmentId[];
          enterprise?: boolean;
          homeDepartment?: DepartmentId;
        };
        if (!res.ok) {
          setPairError(data.error || "Pairing failed.");
          return false;
        }
        const next = asSession({ ...data, deviceName: data.deviceName || input.device || "This browser", method: data.method || input.method });
        writeSession(next);
        setSession(next);
        setDevices((prev) =>
          prev.map((d) => (d.current ? { ...d, name: next.deviceName, lastSeen: "This session" } : d)),
        );
        const land = next.enterprise ? ENTERPRISE : next.homeDepartment || LITTLE_ELM;
        setCurrentWorkspaceId(land);
        writeWorkspace(land);
        return true;
      } catch {
        setPairError("Can’t reach Hatch. Join the office network or the firm VPN, then retry.");
        return false;
      }
    },
    [],
  );

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
    setPairError("");
    setToast("");
  }, []);

  const ask = useCallback(
    async (query: string, opts?: { attachments?: HatchFile[] }) => {
      if (streaming || !session) return;
      let threadId: string | undefined = currentThread?.id;
      if (!threadId) {
        const created = await newThread();
        threadId = created?.id;
      }
      if (!threadId) return;

      const attachments: ChatAttachment[] | undefined = opts?.attachments?.map((f) => ({
        fileId: f.id,
        name: f.name,
        kind: f.kind,
      }));
      const user: ChatMessage = {
        id: newId("u"),
        role: "user",
        text: query,
        done: true,
        sources: [],
        attachments,
      };
      const assistant: ChatMessage = { id: newId("a"), role: "assistant", text: "", done: false, sources: [] };
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, messages: [...t.messages, user, assistant] } : t)),
      );
      setCurrentThreadId(threadId);
      writeThreadForWorkspace(currentWorkspaceId, threadId);
      setStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            departmentId: currentWorkspaceId,
            threadId,
            query,
            accessibleDepartments: session.departments,
            enterprise: session.enterprise,
            attachments,
          }),
        });
        if (!res.ok || !res.body) throw new Error("offline");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        let sources: Source[] = [];
        let tools: ToolEvent[] = [];
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
              sources?: Source[];
              tools?: ToolEvent[];
              title?: string;
            };
            if (payload.delta) {
              text += payload.delta;
              setThreads((prev) =>
                prev.map((t) =>
                  t.id === threadId
                    ? { ...t, messages: t.messages.map((m) => (m.id === assistant.id ? { ...m, text } : m)) }
                    : t,
                ),
              );
            }
            if (payload.done) {
              if (typeof payload.text === "string") text = payload.text;
              sources = payload.sources || [];
              tools = payload.tools || [];
              if (payload.title) {
                setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title: payload.title || t.title } : t)));
              }
            }
          }
        }
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) => (m.id === assistant.id ? { ...m, text, done: true, sources, tools } : m)),
                }
              : t,
          ),
        );
        setLastSources(sources);
        setLastUsedLibrary(sources.length > 0);
        const created = tools.find(
          (t) => t.ok && t.fileId && (t.name === "write_draft" || t.name === "drive_import"),
        );
        if (tools.some((t) => t.name === "write_draft" || t.name === "handoff_to_department" || t.name === "drive_import")) {
          await refresh();
        }
        if (created?.fileId) openArtifact(created.fileId, threadId);
      } catch {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === assistant.id
                      ? {
                          ...m,
                          text: "Can’t reach Hatch. Join the office network or the firm VPN, then retry.",
                          done: true,
                          sources: [],
                        }
                      : m,
                  ),
                }
              : t,
          ),
        );
        setLastSources([]);
        setLastUsedLibrary(false);
      } finally {
        setStreaming(false);
      }
    },
    [streaming, session, currentThread, newThread, currentWorkspaceId, refresh, openArtifact],
  );

  const writeTarget = useCallback(
    (override?: DepartmentId) => {
      if (override && !isEnterprise(override)) return override;
      if (!isEnterprise(currentWorkspaceId)) return currentWorkspaceId;
      return session?.departments.includes(HQ_OPS) ? HQ_OPS : session?.departments[0] || LITTLE_ELM;
    },
    [currentWorkspaceId, session],
  );

  const ingest = useCallback(
    async (file: File, opts?: { toLibrary?: boolean; folderId?: string | null; departmentId?: DepartmentId }) => {
      const departmentId = writeTarget(opts?.departmentId);
      const ok = isAcceptedFilename(file.name);
      const rec: HatchFile = {
        id: newId("up"),
        name: file.name,
        kind: kindFromFilename(file.name),
        status: ok ? "queued" : "failed",
        progress: ok ? 20 : 0,
        error: ok ? undefined : REJECT_COPY,
        departmentId,
        roomId: departmentId,
        folderId: opts?.folderId ?? null,
        inLibrary: Boolean(opts?.toLibrary),
        origin: "upload",
      };
      setDepartments((prev) =>
        prev.map((dept) => (dept.id === departmentId ? { ...dept, files: [rec, ...dept.files] } : dept)),
      );
      if (!ok) return null;
      const form = new FormData();
      form.append("file", file);
      form.append("departmentId", departmentId);
      form.append("inLibrary", rec.inLibrary ? "1" : "0");
      if (opts?.folderId) form.append("folderId", opts.folderId);
      form.append("accessibleDepartments", (session?.departments || []).join(","));
      try {
        const res = await fetch("/api/ingest", { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as { file?: HatchFile; error?: string } | null;
        const next = data?.file || { ...rec, status: "failed" as const, error: data?.error || "Upload failed." };
        setDepartments((prev) =>
          prev.map((dept) =>
            dept.id === departmentId
              ? { ...dept, files: dept.files.map((f) => (f.id === rec.id ? next : f)) }
              : dept,
          ),
        );
        return data?.file || null;
      } catch {
        setDepartments((prev) =>
          prev.map((dept) => ({
            ...dept,
            files: dept.files.map((f) =>
              f.id === rec.id ? { ...f, status: "failed", error: "Could not persist this file on the box." } : f,
            ),
          })),
        );
        return null;
      }
    },
    [writeTarget, session],
  );

  const deleteFile = useCallback(
    (fileId: string) => {
      const file = currentFiles.find((f) => f.id === fileId);
      const departmentId = file?.departmentId || writeTarget();
      setDepartments((prev) =>
        prev.map((dept) => ({ ...dept, files: dept.files.filter((f) => f.id !== fileId) })),
      );
      void fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", fileId, departmentId }),
      }).catch(() => undefined);
      setToast("File and chunks removed.");
    },
    [currentFiles, writeTarget],
  );

  const setInLibrary = useCallback(
    (fileId: string, inLibrary: boolean) => {
      setDepartments((prev) =>
        prev.map((dept) => ({
          ...dept,
          files: dept.files.map((f) => (f.id === fileId ? { ...f, inLibrary } : f)),
        })),
      );
      const file = currentFiles.find((f) => f.id === fileId);
      void fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: inLibrary ? "promote" : "unlibrary",
          fileId,
          departmentId: file?.departmentId || writeTarget(),
          inLibrary,
        }),
      }).catch(() => undefined);
      setToast(inLibrary ? "Added to Library — Ask can cite this file." : "Removed from Library. File stays in Files.");
    },
    [currentFiles, writeTarget],
  );

  const importDrive = useCallback(
    async (departmentId?: DepartmentId) => {
      const target = writeTarget(departmentId);
      try {
        const res = await fetch("/api/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "import",
            departmentId: target,
            accessibleDepartments: session?.departments || [],
          }),
        });
        const data = (await res.json()) as { error?: string; note?: string; files?: HatchFile[] };
        if (data.files?.length) {
          setDepartments((prev) =>
            prev.map((dept) =>
              dept.id === target
                ? { ...dept, files: [...(data.files || []), ...dept.files.filter((f) => !data.files?.some((n) => n.id === f.id))] }
                : dept,
            ),
          );
        }
        setToast(data.error || data.note || "Drive stub imported.");
      } catch {
        setToast("Drive import stub failed.");
      }
    },
    [writeTarget, session],
  );

  const handoffToDepartment = useCallback(
    async (toDepartmentId: DepartmentId, summary: string, facts?: string) => {
      try {
        const res = await fetch("/api/handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromDepartmentId: currentWorkspaceId,
            toDepartmentId,
            summary,
            facts,
          }),
        });
        const data = (await res.json()) as { handoff?: Handoff; event?: { detail?: string }; error?: string };
        if (data.handoff) setHandoffs((prev) => [data.handoff!, ...prev]);
        setToast(data.event?.detail || data.error || "Handoff recorded.");
      } catch {
        setToast("Handoff failed.");
      }
    },
    [currentWorkspaceId],
  );

  const createFolder = useCallback(
    (name: string) => {
      const departmentId = writeTarget();
      void fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "folder", departmentId, name }),
      })
        .then((r) => r.json())
        .then((data: { folder?: FileFolder; error?: string }) => {
          if (data.folder) setFolders((prev) => [...prev, data.folder!]);
          setToast(data.error || `Folder “${name}” created in ${workspaceLabel(departmentId)}.`);
        })
        .catch(() => setToast("Could not create folder."));
    },
    [writeTarget],
  );

  const mintInvite = useCallback(() => {
    setInviteSeq((n) => n + 1);
    const next = inviteSeq + 1;
    const code = emptySeatsDemo && next === 1 ? "HATCH-BETA" : `HATCH-${6 + next}K2M`;
    setGeneratedInvite(code);
    setSeats((prev) => [
      {
        id: newId("seat"),
        name: "Pending invite",
        role: "Seat reserved",
        departments: [],
        rooms: [],
        enterprise: false,
        homeDepartment: LITTLE_ELM,
        device: code,
        pending: true,
      },
      ...prev,
    ]);
    setToast(`Invite ${code} created. Share it in person. Issued by this box — not emailed from outside the firm.`);
  }, [emptySeatsDemo, inviteSeq]);

  const revokeSeat = useCallback((id: string) => {
    setSeats((prev) => prev.filter((s) => s.id !== id));
    setToast("Seat revoked. The next request from that device will die on this box.");
  }, []);

  const grantDepartments = useCallback((seatId: string, nextDepartments: DepartmentId[], enterprise?: boolean) => {
    setSeats((prev) =>
      prev.map((s) =>
        s.id === seatId
          ? {
              ...s,
              departments: nextDepartments,
              rooms: nextDepartments,
              enterprise: enterprise ?? s.enterprise,
            }
          : s,
      ),
    );
    setToast("Department grants updated. UX spaces follow membership; Ask stays firm-capable.");
  }, []);

  const createDepartment = useCallback(() => {
    const id = newId("dept");
    setDepartments((prev) => [
      ...prev,
      {
        id,
        name: "New department",
        kind: "department",
        isolation: uxIsolation(id),
        files: [],
      },
    ]);
    if (session) {
      const departmentsNext = [...session.departments, id];
      const next = { ...session, departments: departmentsNext, rooms: departmentsNext };
      setSession(next);
      writeSession(next);
    }
    setWorkspace(id);
    setToast("Empty department created. Chat, Files, and Library start empty.");
  }, [session, setWorkspace]);

  const startBackup = useCallback(() => {
    setToast("Backup is a stub. No appliance is connected — do not treat this as a live backup.");
  }, []);

  const importUpdate = useCallback(() => {
    setToast("Waiting for a signed offline bundle. There is no live Hatch remote push.");
  }, []);

  const resetTotp = useCallback(() => {
    setToast("TOTP reset is a stub. On a live box, Admin re-issues the authenticator from this device list.");
  }, []);

  const value = useMemo<HatchContextValue>(
    () => ({
      ready,
      session,
      currentWorkspaceId,
      currentWorkspace,
      isEnterpriseView,
      departments,
      visibleWorkspaces,
      folders,
      currentFiles,
      currentLibrary,
      threads,
      visibleThreads,
      currentThreadId: currentThread?.id || currentThreadId,
      currentThread,
      streaming,
      artifactOpen,
      activeArtifactId,
      lastSources,
      lastUsedLibrary,
      handoffs,
      inboundHandoffs,
      seats,
      devices,
      toast,
      pairError,
      generatedInvite,
      emptyDepartmentsDemo,
      emptySeatsDemo,
      setWorkspace,
      newThread,
      selectThread,
      renameThread,
      archiveThread,
      pair,
      signOut,
      ask,
      ingest,
      openArtifact,
      closeArtifact,
      openArtifactBySource,
      deleteFile,
      setInLibrary,
      importDrive,
      handoffToDepartment,
      createFolder,
      mintInvite,
      revokeSeat,
      grantDepartments,
      createDepartment,
      startBackup,
      importUpdate,
      resetTotp,
      setEmptyDepartmentsDemo,
      setEmptySeatsDemo,
      clearToast: () => setToast(""),
      currentRoomId: currentWorkspaceId,
      currentRoom: currentWorkspace,
      setRoom: setWorkspace,
    }),
    [
      ready,
      session,
      currentWorkspaceId,
      currentWorkspace,
      isEnterpriseView,
      departments,
      visibleWorkspaces,
      folders,
      currentFiles,
      currentLibrary,
      threads,
      visibleThreads,
      currentThreadId,
      currentThread,
      streaming,
      artifactOpen,
      activeArtifactId,
      lastSources,
      lastUsedLibrary,
      handoffs,
      inboundHandoffs,
      seats,
      devices,
      toast,
      pairError,
      generatedInvite,
      emptyDepartmentsDemo,
      emptySeatsDemo,
      setWorkspace,
      newThread,
      selectThread,
      renameThread,
      archiveThread,
      pair,
      signOut,
      ask,
      ingest,
      openArtifact,
      closeArtifact,
      openArtifactBySource,
      deleteFile,
      setInLibrary,
      importDrive,
      handoffToDepartment,
      createFolder,
      mintInvite,
      revokeSeat,
      grantDepartments,
      createDepartment,
      startBackup,
      importUpdate,
      resetTotp,
    ],
  );

  return <HatchContext.Provider value={value}>{children}</HatchContext.Provider>;
}

export function useHatch() {
  const ctx = useContext(HatchContext);
  if (!ctx) throw new Error("useHatch must be used within AppProvider");
  return ctx;
}

export const seatLine = SEAT_LINE;
