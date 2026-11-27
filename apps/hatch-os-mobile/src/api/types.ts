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
  token?: string;
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
  call?: { name: string; arguments: Record<string, string> };
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
  /** Local preview. The host copy is /api/files/:id/raw after upload. */
  previewUri?: string;
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
  error?: string;
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
  token?: string;
}

export interface LibraryPassage {
  id: string;
  title: string;
  source: string;
  at: string;
  text: string;
}

export interface EthicsProfile {
  preset: "neutral" | "executive" | "compliance" | "custom";
  charter: string;
  redLines: string;
  posture: "strict" | "balanced" | "direct";
  tone: "concise" | "warm" | "blunt" | "formal";
  length: "short" | "balanced" | "detailed";
  leadWithAnswer: boolean;
  styleRules: string;
  model: "hermes" | "qwen";
  temperature: number;
  inherit: boolean;
}

export interface TokenBalanceView {
  code: string;
  label: string;
  unlimited: boolean;
  metered: boolean;
  balanceCents: number;
  lifetimeUsedCents: number;
  lifetimeUsedTokens: number;
  lifetimePurchasedCents: number;
  lifetimeGrantedCents: number;
  checkoutReady: boolean;
  message: string;
}

export interface RoutineRun {
  id: string;
  routineId: string;
  reason: "schedule" | "email" | "manual";
  status: "running" | "done" | "failed" | "skipped" | "needs_approval";
  startedAt: string;
  finishedAt?: string;
  text?: string;
  error?: string;
  read: boolean;
  threadId?: string;
  messageId?: string;
  approval?: { title: string; status: "pending" | "approved" | "cancelled" };
}

export interface Routine {
  id: string;
  agentId: string;
  name: string;
  prompt: string;
  mode: "agent" | "reminder" | "notify";
  schedule: string;
  cron?: string;
  runAt?: string;
  timezone: string;
  trigger?: { type: "email"; query: string; lastCheckedAt?: string };
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  threadId?: string;
  runs: RoutineRun[];
  unread: number;
  usesModel: boolean;
}

export interface RoutinesPayload {
  routines: Routine[];
  unread: number;
  running: number;
  limits?: { minIntervalMinutes: number; dailyModelRuns: number; maxRoutines: number };
  timezone?: string;
}

/** Edits from a routine proposal card. `when` is plain language. */
export interface RoutineEdits {
  name?: string;
  prompt?: string;
  when?: string;
}
