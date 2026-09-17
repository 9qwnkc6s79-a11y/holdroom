export type DepartmentId = "little-elm" | "prosper" | "hq-ops" | "enterprise" | string;

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
}

export interface ChatAttachment {
  fileId: string;
  name: string;
  kind: FileKind;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  done: boolean;
  sources: Source[];
  tools?: ToolEvent[];
  attachments?: ChatAttachment[];
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
    error?: string;
  };
  dryRun?: boolean;
}
