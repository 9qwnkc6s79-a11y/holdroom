import { apiUrl } from "./config";
import { drainSse } from "./sse";
import type {
  Agent,
  ChatAttachment,
  ChatThread,
  HatchFile,
  HostStatus,
  LivePayload,
  LiveState,
  EthicsProfile,
  LibraryPassage,
  PairResponse,
  Routine,
  RoutineEdits,
  RoutinesPayload,
  TokenBalanceView,
  ToolEvent,
} from "./types";

let authToken = "";
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string) {
  authToken = token || "";
}

export function getAuthToken(): string {
  return authToken;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

function applyAuth(headers: Headers) {
  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  applyAuth(headers);
  const body = init?.body;
  if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...init, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new ApiError(message, 0);
  }
  const data = await readJson<T & { error?: string }>(res);
  if (!res.ok) {
    if (res.status === 401 && authToken && !path.startsWith("/api/auth/pair")) {
      unauthorizedHandler?.();
    }
    const message = typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data;
}

export function pair(invite: string, device: string): Promise<PairResponse> {
  return apiJson<PairResponse>("/api/auth/pair", {
    method: "POST",
    body: JSON.stringify({ invite, device, method: "totp" }),
  });
}

export async function listAgents(): Promise<Agent[]> {
  const data = await apiJson<{ agents?: Agent[] }>("/api/agents");
  return Array.isArray(data.agents) ? data.agents : [];
}

export async function listThreads(): Promise<ChatThread[]> {
  const data = await apiJson<{ threads?: ChatThread[] }>("/api/threads");
  return Array.isArray(data.threads) ? data.threads : [];
}

export async function deleteThread(threadId: string): Promise<void> {
  await apiJson<{ ok?: boolean }>(`/api/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" });
}

export async function renameThread(threadId: string, title: string): Promise<ChatThread> {
  const data = await apiJson<{ thread: ChatThread }>(`/api/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  return data.thread;
}

export async function createThread(input: { departmentId: string; agentId: string; title: string }): Promise<ChatThread> {
  const data = await apiJson<{ thread: ChatThread }>("/api/threads", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.thread;
}

export async function listFiles(departmentId: string): Promise<HatchFile[]> {
  const data = await apiJson<{ files?: HatchFile[] }>(`/api/files?department=${encodeURIComponent(departmentId)}`);
  return Array.isArray(data.files) ? data.files : [];
}

export function hostStatus(): Promise<HostStatus> {
  return apiJson<HostStatus>("/api/status");
}

export interface LocalUpload {
  uri: string;
  name: string;
  mimeType: string;
}

export async function uploadPart(file: LocalUpload): Promise<Blob | File | { uri: string; name: string; type: string }> {
  if (typeof window !== "undefined" && file.uri.startsWith("blob:")) {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    return new File([blob], file.name, { type: file.mimeType || blob.type || "application/octet-stream" });
  }
  if (typeof window !== "undefined" && file.uri.startsWith("data:")) {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    return new File([blob], file.name, { type: file.mimeType || blob.type || "application/octet-stream" });
  }
  return { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" };
}

export async function extractFile(file: LocalUpload): Promise<{ text: string; note: string }> {
  const form = new FormData();
  form.append("file", (await uploadPart(file)) as Blob);
  const data = await apiJson<{ text?: string; note?: string; error?: string }>("/api/extract", {
    method: "POST",
    body: form,
  });
  return { text: data.text || "", note: data.note || "" };
}

export async function ingestFile(
  file: LocalUpload,
  input: { departmentId: string; accessibleDepartments: string[] },
): Promise<{ id?: string; error?: string }> {
  const form = new FormData();
  form.append("file", (await uploadPart(file)) as Blob);
  form.append("departmentId", input.departmentId);
  form.append("inLibrary", "1");
  form.append("accessibleDepartments", input.accessibleDepartments.filter(Boolean).join(","));
  const data = await apiJson<{ file?: { id?: string }; error?: string }>("/api/ingest", {
    method: "POST",
    body: form,
  });
  return { id: data.file?.id, error: data.error };
}

export interface ChatRequest {
  departmentId: string;
  defaultDepartmentId: string;
  threadId?: string;
  query: string;
  context?: string;
  agentId: string;
  actor: string;
  agent?: boolean;
  failFast: true;
  approvals: "wait";
  accessibleDepartments: string[];
  enterprise: boolean;
  testerCode: string;
  attachments?: ChatAttachment[];
}

export async function readChatResponse(res: Response, onDelta: (text: string) => void): Promise<LivePayload> {
  if (!res.ok) {
    if (res.status === 401 && authToken) unauthorizedHandler?.();
    const data = await readJson<{ error?: string }>(res);
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    return readJson<LivePayload>(res);
  }
  const apply = (events: LivePayload[], streamed: string): { last: LivePayload; streamed: string } => {
    let last: LivePayload = {};
    let text = streamed;
    for (const event of events) {
      if (event.delta) {
        text += event.delta;
        onDelta(text);
      }
      last = { ...last, ...event, text: event.text || (event.done ? text : last.text) };
    }
    return { last, streamed: text };
  };
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamed = "";
    let last: LivePayload = {};
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = drainSse(buffer);
      buffer = parsed.rest;
      const next = apply(parsed.events, streamed);
      streamed = next.streamed;
      last = { ...last, ...next.last };
    }
    const tail = drainSse(`${buffer}\n\n`);
    const next = apply(tail.events, streamed);
    return { ...last, ...next.last, text: next.last.text || next.streamed, phase: "done" };
  }
  const parsed = drainSse(await res.text());
  const next = apply(parsed.events, "");
  return { ...next.last, text: next.last.text || next.streamed, phase: "done" };
}

export async function postChat(body: ChatRequest, onDelta: (text: string) => void): Promise<LivePayload> {
  let res: Response;
  try {
    const headers = new Headers({ "Content-Type": "application/json", Accept: "application/json, text/event-stream" });
    applyAuth(headers);
    res = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new ApiError(message, 0);
  }
  return readChatResponse(res, onDelta);
}

export function postStep(state: LiveState): Promise<LivePayload> {
  return apiJson<LivePayload>("/api/chat/step", {
    method: "POST",
    body: JSON.stringify({ state }),
  });
}

export function postApproval(body: {
  threadId: string;
  messageId: string;
  decision: "approved" | "cancelled";
  actor: string;
  accessibleDepartments: string[];
  enterprise: boolean;
  testerCode: string;
  edits?: RoutineEdits;
}): Promise<{ ok?: boolean; error?: string }> {
  return apiJson("/api/approvals", { method: "POST", body: JSON.stringify(body) });
}

export function listRoutines(): Promise<RoutinesPayload> {
  return apiJson<RoutinesPayload>("/api/routines");
}

export function saveRoutine(body: {
  id?: string;
  name?: string;
  prompt?: string;
  mode?: Routine["mode"];
  when?: string;
  triggerQuery?: string;
  cron?: string;
}): Promise<{ routine: Routine }> {
  return apiJson("/api/routines", { method: "POST", body: JSON.stringify(body) });
}

export function setRoutineEnabled(id: string, enabled: boolean): Promise<{ routine: Routine }> {
  return apiJson("/api/routines", { method: "PATCH", body: JSON.stringify({ id, enabled }) });
}

export function markRoutinesRead(input: { id?: string; runId?: string } = {}): Promise<RoutinesPayload> {
  return apiJson("/api/routines", { method: "PATCH", body: JSON.stringify({ action: "read", ...input }) });
}

export function deleteRoutine(id: string): Promise<{ ok: boolean }> {
  return apiJson(`/api/routines?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function runRoutine(id: string): Promise<RoutinesPayload> {
  return apiJson("/api/routines/run", { method: "POST", body: JSON.stringify({ id }) });
}

export function advanceRoutines(): Promise<RoutinesPayload> {
  return apiJson("/api/routines/advance", { method: "POST" });
}

export async function transcribeClip(file: LocalUpload): Promise<{ text: string; stub: boolean; note: string }> {
  const form = new FormData();
  form.append("audio", (await uploadPart(file)) as Blob);
  const data = await apiJson<{ text?: string; stub?: boolean; note?: string; error?: string }>("/api/transcribe", {
    method: "POST",
    body: form,
  });
  return { text: data.text || "", stub: Boolean(data.stub), note: data.note || "" };
}

export async function pollTurn(
  initial: LiveState,
  onWait: (note: string, tools?: ToolEvent[]) => void,
  shouldContinue: () => boolean,
): Promise<LivePayload> {
  let state = initial;
  let delay = 2000;
  const started = Date.now();
  while (shouldContinue()) {
    if (Date.now() - started > 8 * 60 * 1000) {
      return {
        phase: "done",
        error: true,
        threadId: state.threadId,
        messageId: typeof state.messageId === "string" ? state.messageId : undefined,
        text: "Your firm’s host is still warming up. Try again in a moment.",
      };
    }
    try {
      const payload = await postStep(state);
      if (payload.phase === "wait" && payload.state) {
        state = payload.state;
        onWait(payload.note || "", payload.tools);
        await sleep(2500, shouldContinue);
        delay = 2000;
        continue;
      }
      return payload;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw error;
      await sleep(delay, shouldContinue);
      delay = Math.min(delay * 2, 15000);
    }
  }
  return { phase: "done", error: true, text: "" };
}

function sleep(ms: number, shouldContinue: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (!shouldContinue() || Date.now() - started >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, 200);
  });
}

export function signOutServer(): Promise<{ ok?: boolean }> {
  return apiJson<{ ok?: boolean }>("/api/auth/pair", { method: "DELETE" });
}

export function deleteAccountServer(): Promise<{ ok?: boolean; deleted?: boolean }> {
  return apiJson<{ ok?: boolean; deleted?: boolean }>("/api/auth/account", { method: "DELETE" });
}

export function listLibrary(query = ""): Promise<{ files: HatchFile[]; passages: LibraryPassage[] }> {
  return apiJson<{ files?: HatchFile[]; passages?: LibraryPassage[] }>(
    `/api/library?department=enterprise&q=${encodeURIComponent(query)}`,
  ).then((data) => ({
    files: Array.isArray(data.files) ? data.files : [],
    passages: Array.isArray(data.passages) ? data.passages : [],
  }));
}

export async function readFileText(id: string): Promise<string> {
  const data = await apiJson<{ text?: string }>(`/api/files/${encodeURIComponent(id)}`);
  return data.text || "";
}

export function getEthics(agentId?: string): Promise<{ profile: EthicsProfile; defaults: EthicsProfile }> {
  const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
  return apiJson<{ profile: EthicsProfile; defaults: EthicsProfile }>(`/api/ethics${query}`);
}

export function saveEthics(profile: Partial<EthicsProfile>, agentId?: string): Promise<{ profile: EthicsProfile }> {
  return apiJson<{ profile: EthicsProfile }>("/api/ethics", {
    method: "PUT",
    body: JSON.stringify({ profile, agentId }),
  });
}

export function resetEthics(agentId?: string): Promise<{ profile: EthicsProfile }> {
  return apiJson<{ profile: EthicsProfile }>("/api/ethics", {
    method: "PUT",
    body: JSON.stringify({ reset: true, agentId }),
  });
}

export async function getTokenBalance(): Promise<TokenBalanceView | null> {
  try {
    return await apiJson<TokenBalanceView>("/api/tokens");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return null;
  }
}
