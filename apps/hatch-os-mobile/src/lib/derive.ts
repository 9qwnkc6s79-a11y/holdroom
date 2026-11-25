import type { Agent, ChatMessage, ChatThread, FileKind, HostStatus } from "@/api/types";
import type { SphereState } from "@/shader/sphereStates";

const KNOWN_ROOMS: Record<string, string> = {
  "little-elm": "North desk",
  prosper: "South desk",
  "hq-ops": "Operations",
  legal: "Legal",
  finance: "Finance",
  enterprise: "Enterprise",
};

const ENTERPRISE_ROOMS = ["hq-ops", "legal", "finance", "little-elm", "prosper"];

/** The product agent named Hatch reads as a second Hatch inside the app. */
export function agentLabel(agent: { id: string; name: string }): string {
  if (agent.id === "general" || agent.name.trim().toLowerCase() === "hatch") return "General assistant";
  return agent.name;
}

export function activityLine(note: string | undefined, tools?: { detail?: string }[]): string {
  const detail = [...(tools || [])].reverse().find((tool) => tool.detail)?.detail || "";
  if (/read/i.test(detail)) return "Reading the file room…";
  if (detail) return /…$/.test(detail) ? detail : `${detail.replace(/\.$/, "")}…`;
  const waited = waitCopy(note);
  return waited === "Thinking" ? "Thinking…" : waited;
}

export function normalizeInvite(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function snippet(text: string | undefined, max = 84): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function workspaceName(id: string | undefined): string {
  if (!id) return "";
  return KNOWN_ROOMS[id] || "";
}

export function accessibleDepartments(session: { departments: string[]; enterprise: boolean } | null, writeDepartmentId?: string): string[] {
  const base = session?.departments || [];
  const extra = session?.enterprise ? ENTERPRISE_ROOMS : [];
  return Array.from(new Set([...base, ...extra, writeDepartmentId || ""].filter(Boolean)));
}

export function kindFromFilename(name: string): FileKind {
  if (/\.(png|jpe?g|webp|gif|heic)$/i.test(name)) return "Image";
  if (/\.pdf$/i.test(name)) return "PDF";
  if (/\.(md|markdown|txt)$/i.test(name)) return "Markdown";
  return "Office";
}

export function acceptedFilename(name: string): boolean {
  return /\.(pdf|docx?|xlsx?|md|txt|png|jpe?g|webp|gif|heic|heif)$/i.test(name);
}

/** Photos are stored as JPEG so HEIC and large PNGs upload as a normal image. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  const clean = base.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "photo";
  return `${clean}.jpg`;
}

/** Live words replace the dictated span. Text already in the box stays put. */
export function composeDictation(base: string, partial: string): string {
  const prior = base.trim();
  const spoken = partial.trim();
  if (!spoken) return prior;
  if (!prior) return spoken;
  return `${prior} ${spoken}`;
}

/** Wait copy belongs on the status line. It is not the assistant's reply. */
export function isWaitStatus(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  if (/^thinking…?$/i.test(clean)) return true;
  return /warming up your firm/i.test(clean);
}

export function explainFailure(message: string, status?: number): string {
  if (status === 401 || status === 403) return "Your sign-in expired. Sign in again to keep chatting.";
  if (status === 429) return "You’ve hit today’s message cap for this code. Try again tomorrow.";
  if (/cap|messages today/i.test(message)) return message;
  if (/offline/i.test(message)) return "Hatch could not reach the firm model. Nothing was sent to an outside AI lab.";
  if (/network|failed to fetch|network request failed/i.test(message)) return "The network dropped. Check your connection, then try again.";
  if (/timed out|timeout/i.test(message)) return "The request timed out. Your firm’s host may still be warming up.";
  if (status && status >= 500) return `The server returned an error (${status}).`;
  return message || "The request failed before a reply came back.";
}

export function waitCopy(note: string | undefined): string {
  if (!note) return "Thinking";
  if (/warming|first message|2–5|2-5/i.test(note)) {
    return "Warming up your firm’s host. The first reply can take a few minutes.";
  }
  if (/running/i.test(note)) return "Thinking";
  return note.length > 160 ? "Thinking" : note;
}

export function hostLine(status: HostStatus | null): { detail: string; connected: boolean } {
  if (!status) return { detail: "Checking your firm’s host…", connected: false };
  const connected = status.ok === true && status.modelState !== "offline";
  const raw = status.label?.trim() || "";
  const namesAVendor = /https?:|runpod|openai|anthropic|vercel|qwen|hermes/i.test(raw);
  if (!raw || namesAVendor) {
    return { detail: connected ? "Your firm’s host is ready" : "Your firm’s host is offline", connected };
  }
  return { detail: raw, connected };
}

export function formatWhen(iso: string | undefined, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface TaskItem {
  id: string;
  title: string;
  agentId?: string;
  threadId: string;
  urgent: boolean;
  meta: string;
  updatedAt: string;
}

function pendingMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.approval?.status === "pending") return message;
  }
  return undefined;
}

export function tasksFromThreads(threads: ChatThread[], agents: Agent[]): TaskItem[] {
  return threads
    .filter((thread) => !thread.archived)
    .map((thread) => {
      const named = thread.agentId ? agents.find((agent) => agent.id === thread.agentId) : undefined;
      const name = named ? agentLabel(named) : "Assistant";
      const pending = pendingMessage(thread.messages || []);
      const last = [...(thread.messages || [])].reverse().find((message) => message.text.trim());
      return {
        id: thread.id,
        threadId: thread.id,
        title: thread.title || "Thread",
        agentId: thread.agentId,
        urgent: Boolean(pending),
        meta: pending ? `${name} · Needs your approval` : `${name} · ${snippet(last?.text) || "Ready for you"}`,
        updatedAt: thread.updatedAt,
      };
    })
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
}

export interface AgentRow {
  agent: Agent;
  index: number;
  preview: string;
  when: string;
  threadId?: string;
  status: { tone: "amber" | "blue"; label: string } | null;
}

export function agentRows(
  agents: Agent[],
  threads: ChatThread[],
  phases: Record<string, SphereState | undefined>,
): AgentRow[] {
  return agents.map((agent, index) => {
    const owned = threads
      .filter((thread) => thread.agentId === agent.id && !thread.archived)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const latest = owned[0];
    const pending = owned.some((thread) => pendingMessage(thread.messages || []));
    const phase = phases[agent.id];
    const working = phase === "thinking" || phase === "listening" || phase === "speaking";
    const last = latest ? [...(latest.messages || [])].reverse().find((message) => message.text.trim()) : undefined;
    const preview = snippet(last?.text) || agent.description || agent.title;
    let status: AgentRow["status"] = null;
    if (pending) status = { tone: "amber", label: "Needs approval" };
    else if (working) status = { tone: "blue", label: "Working" };
    return { agent, index, preview, when: latest?.updatedAt || "", threadId: latest?.id, status };
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "H";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function threadUnread(thread: ChatThread, seen: ReadonlySet<string>): boolean {
  if (seen.has(thread.id)) return false;
  if ((thread.messages || []).some((message) => message.approval?.status === "pending")) return true;
  const last = [...(thread.messages || [])].reverse().find((message) => message.text.trim());
  return last?.role === "assistant";
}

export function oneParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function presenceState(
  phases: (SphereState | undefined)[],
  threads: ChatThread[],
): SphereState {
  if (phases.includes("speaking")) return "speaking";
  if (phases.includes("listening") || phases.includes("thinking")) return "thinking";
  const waiting = threads.some((thread) => (thread.messages || []).some((message) => message.approval?.status === "pending"));
  return waiting ? "needsApproval" : "idle";
}
