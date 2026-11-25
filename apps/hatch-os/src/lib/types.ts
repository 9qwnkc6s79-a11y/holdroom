export type DepartmentId = "north-desk" | "south-desk" | "hq-ops" | "legal" | "finance" | "enterprise" | string;

/** @deprecated use DepartmentId */
export type RoomId = DepartmentId;

export type WorkspaceKind = "department" | "enterprise";

export type FileKind = "PDF" | "Office" | "Markdown" | "Image";

export type IngestStatus = "queued" | "extracting" | "indexed" | "ready" | "failed";

export type AuthMethod = "totp" | "passkey";

export type FileOrigin = "upload" | "drive" | "seed" | "draft";

export interface HatchFile {
  id: string;
  name: string;
  kind: FileKind;
  status: IngestStatus;
  progress: number;
  error?: string;
  departmentId: DepartmentId;
  /** @deprecated use departmentId */
  roomId: RoomId;
  folderId?: string | null;
  inLibrary: boolean;
  demo?: boolean;
  origin?: FileOrigin;
  folderPath?: string;
}

/** @deprecated use HatchFile */
export type LibraryFile = HatchFile;

export interface FileFolder {
  id: string;
  name: string;
  departmentId: DepartmentId;
  parentId: string | null;
}

export interface Department {
  id: DepartmentId;
  name: string;
  kind: WorkspaceKind;
  isolation: string;
  files: HatchFile[];
  folders?: FileFolder[];
}

/** @deprecated use Department */
export type Room = Department;

export interface Source {
  file: string;
  room: string;
  page?: string;
  snippet: string;
  departmentId?: DepartmentId;
}

export interface ToolEvent {
  name: string;
  ok: boolean;
  detail: string;
  departmentId?: DepartmentId;
  fileId?: string;
  /** Non-secret input summary for an action card. */
  input?: string;
}

export interface ApprovalInput {
  label: string;
  value: string;
}

export interface ApprovalCard {
  id: string;
  tool: string;
  title: string;
  summary: string;
  inputs: ApprovalInput[];
  /** Arguments safe to persist and replay. Secret fields are removed. */
  call: { name: string; arguments: Record<string, string> };
  status: "pending" | "approved" | "cancelled";
  agentId?: string;
}

export interface Routine {
  id: string;
  agentId: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  createdAt: string;
}

export type VaultKind = "login" | "token" | "card";

export interface VaultPublicItem {
  id: string;
  kind: VaultKind;
  name: string;
  whenToUse: string;
  username?: string;
  last4?: string;
  brand?: string;
  updatedAt: string;
}

export interface ChatAttachment {
  fileId: string;
  name: string;
  kind: FileKind;
  /** Extracted text included in the turn. Omitted for images and other binaries. */
  text?: string;
  /** Why the file was not read, when text is empty. */
  note?: string;
  /** Resized JPEG data URL for this request only. Never stored or polled back. */
  image?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  done: boolean;
  sources: Source[];
  tools?: ToolEvent[];
  attachments?: ChatAttachment[];
  /** Set when this assistant turn failed and can be retried. */
  failed?: boolean;
  /** The user text to send again when Retry is tapped. */
  retryQuery?: string;
  approval?: ApprovalCard;
  reactions?: string[];
  replyTo?: { text: string };
}

export interface ChatThread {
  id: string;
  departmentId: DepartmentId;
  title: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** Last artifact opened in this thread — Files id, not a second store. */
  lastArtifactId?: string | null;
  /** Hatch OS agent that owns this thread. */
  agentId?: string;
}

export interface Handoff {
  id: string;
  fromDepartmentId: DepartmentId;
  toDepartmentId: DepartmentId;
  summary: string;
  facts: string;
  status: "queued" | "notified" | "learned";
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  tool: string;
  ok: boolean;
  detail: string;
  departmentId?: DepartmentId;
  at: string;
  actor?: string;
  agentId?: string;
  kind?: "ask" | "tool" | "approval" | "vault";
}

export interface Seat {
  id: string;
  name: string;
  role: "Partner" | "Associate" | "Admin" | "Seat reserved";
  departments: DepartmentId[];
  /** @deprecated use departments */
  rooms: RoomId[];
  enterprise: boolean;
  homeDepartment: DepartmentId;
  device: string;
  pending?: boolean;
}

export interface Device {
  id: string;
  name: string;
  lastSeen: string;
  current?: boolean;
}

export interface Session {
  deviceName: string;
  method: AuthMethod;
  role: "Partner" | "Associate";
  departments: DepartmentId[];
  /** @deprecated use departments */
  rooms: RoomId[];
  enterprise: boolean;
  homeDepartment: DepartmentId;
  pairedAt: string;
  inviteCode?: string;
  testerLabel?: string;
}

export type EgressResult = "FAIL=blocked" | "PASS=reachable" | null;

export interface EgressCheck {
  status: "checked" | "unknown";
  detail: string;
  openai: EgressResult;
  anthropic: EgressResult;
}

export interface BoxStatus {
  ok: boolean;
  version: string;
  egress_check: EgressCheck;
  label: string;
  stack: string;
  model?: string;
  disk_free?: string;
  last_backup?: string;
  last_egress_check?: string;
  source: "adapter" | "mock";
  llm?: {
    connected: boolean;
    reachable?: boolean;
    modelPulled?: boolean;
    model: string;
    preferredModel?: string;
    baseUrl: string;
    host?: string;
    kind?: "remote" | "ollama";
    provider?: string;
    hasKey?: boolean;
    fallback?: boolean;
    label?: string;
    lane?: "ask" | "agent";
    error?: string;
  };
  agentLlm?: {
    connected: boolean;
    reachable?: boolean;
    modelPulled?: boolean;
    model: string;
    preferredModel?: string;
    baseUrl: string;
    host?: string;
    kind?: "remote" | "ollama";
    provider?: string;
    hasKey?: boolean;
    fallback?: boolean;
    label?: string;
    lane?: "ask" | "agent";
    dedicated?: boolean;
    usingAskFallback?: boolean;
    error?: string;
  };
  dryRun?: boolean;
  demoMode?: boolean;
  modelState?: "demo" | "offline" | "ready";
}
