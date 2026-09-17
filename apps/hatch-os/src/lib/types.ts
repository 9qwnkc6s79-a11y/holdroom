export type RoomId = "matter-alpha" | "matter-beta" | string;

export type FileKind = "PDF" | "Office" | "Markdown" | "Image";

export type IngestStatus = "queued" | "extracting" | "indexed" | "ready" | "failed";

export type AuthMethod = "totp" | "passkey";

export interface LibraryFile {
  id: string;
  name: string;
  kind: FileKind;
  status: IngestStatus;
  progress: number;
  error?: string;
  roomId: RoomId;
}

export interface Room {
  id: RoomId;
  name: string;
  isolation: string;
  files: LibraryFile[];
}

export interface Source {
  file: string;
  room: string;
  page?: string;
  snippet: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  done: boolean;
  sources: Source[];
}

export interface Seat {
  id: string;
  name: string;
  role: "Partner" | "Associate" | "Admin" | "Seat reserved";
  rooms: RoomId[];
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
  rooms: RoomId[];
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
}
