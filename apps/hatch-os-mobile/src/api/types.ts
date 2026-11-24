export type FileKind = "PDF" | "Office" | "Markdown" | "Image";

export interface Session {
  deviceName: string;
  method: "totp" | "passkey";
  role: "Partner" | "Associate";
  departments: string[];
  enterprise: boolean;
  homeDepartment: string;
  pairedAt: string;
  inviteCode: string;
  testerLabel: string;
}

export interface Agent {
  id: string;
  name: string;
  title: string;
  description: string;
  departmentId: string;
  writeDepartmentId: string;
  icon?: string;
  muted?: boolean;
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
  status: "pending" | "approved" | "cancelled";
}

export interface ToolEvent {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ChatAttachment {
  fileId: string;
  name: string;
  kind: FileKind;
  text?: string;
  note?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  done: boolean;
  tools?: ToolEvent[];
  attachments?: ChatAttachment[];
  failed?: boolean;
  retryQuery?: string;
  approval?: ApprovalCard;
}

export interface ChatThread {
  id: string;
  departmentId: string;
  title: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  agentId?: string;
}

export interface HatchFile {
  id: string;
  name: string;
  kind: FileKind;
  status: string;
  departmentId: string;
}

export interface HostStatus {
  ok?: boolean;
  label?: string;
  modelState?: string;
  model?: string;
}

export interface LiveState {
  version: 1;
  threadId: string;
  messageId?: string;
  [key: string]: unknown;
}

export interface LivePayload {
  phase?: "wait" | "done";
  state?: LiveState;
  note?: string;
  threadId?: string;
  messageId?: string;
  text?: string;
  tools?: ToolEvent[];
  approval?: ApprovalCard;
  title?: string;
  error?: boolean | string;
  modelOffline?: boolean;
  delta?: string;
  done?: boolean;
}

export interface DraftFile {
  id: string;
  name: string;
  kind: FileKind;
  uri: string;
  mimeType: string;
  text?: string;
  note?: string;
  fileId?: string;
  reading?: boolean;
}

export interface PairResponse {
  ok?: boolean;
  error?: string;
  method?: "totp" | "passkey";
  deviceName?: string;
  role?: "Partner" | "Associate";
  departments?: string[];
  rooms?: string[];
  enterprise?: boolean;
  homeDepartment?: string;
  inviteCode?: string;
  testerLabel?: string;
}
