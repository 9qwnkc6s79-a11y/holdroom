import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { atomicWriteFile, withFileLock } from "./atomic-json.ts";
import { parseMentionedDepartment } from "./agent-draft.ts";
import { DEPARTMENT_IDS, LITTLE_ELM, migrateWorkspaceId, workspaceLabel } from "./departments.ts";
import { connectHelp } from "./llm.ts";
import { stripThinkBlocks } from "./think.ts";

export const BOT_USERNAME = "Hatchboundariesbot";
export const BOT_HANDLE = `@${BOT_USERNAME}`;
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;

export const TELEGRAM_TEXT_LIMIT = 4096;
export const TELEGRAM_CHUNK = 3900;
export const TELEGRAM_TYPING_MS = 4000;
export const TELEGRAM_WORKING_MS = 8000;
export const TELEGRAM_POLL_BACKOFF_MS = 2000;
export const TELEGRAM_CONFLICT_BACKOFF_MS_MIN = 10_000;
export const TELEGRAM_CONFLICT_BACKOFF_MS_MAX = 30_000;

export const WELCOME_TEXT = `Hatch OS — Boundaries dogfood.

This is the same Ask / agent stack as Chat: Qwen for Ask, Hermes when a tool is needed. Department ACL and write rules stay as they are.

Pair the OS UI with invite BOUNDARIES + any six digits.

Send a text question here. /help for commands.`;

export const LOCKED_HINT = "This phone is now the locked dogfood user.";

export const HELP_TEXT = `Hatch Telegram (${BOT_HANDLE})

/start — welcome and BOUNDARIES pair hint
/help — this list
/new — start a fresh Chat thread
/ask — sticky Ask (Qwen). /ask <text> is one-shot Ask
/agent — sticky Agent (Hermes + tools). /agent <text> is one-shot Agent
/auto — heuristic (default)
/dept — show or set sticky write department (little-elm, prosper, hq-ops)

Auto routes to Agent for: draft/write/save a note, use tools, search the library, read file, list files, handoff, or snake_case tool names. Plain chat stays on Ask.

Enterprise is a view — drafts write via write_draft to the sticky department (default Little Elm unless you /dept or name a store). Voice notes and group chats are not on yet.`;

export const ASK_MODE_TEXT = "Ask mode on (Qwen). /agent or /auto to change.";
export const AGENT_MODE_TEXT = "Agent mode on (Hermes + tools). /ask or /auto to change.";
export const AUTO_MODE_TEXT = "Auto mode on — Ask for chat, Agent for drafts / tools / library search.";
export const DEPT_HELP_TEXT = "Write department: /dept little-elm | prosper | hq-ops";
export const WORKING_ASK = "Working (Ask)…";
export const WORKING_AGENT = "Working (Agent)…";
export const HISTORY_WINDOW_NOTICE =
  "Older turns in this thread are outside the model window (last 12 messages / ~8k chars). /new starts a fresh thread.";

export const REJECT_TEXT = "This Hatch bot is locked to an allowlisted phone. Ask Daniel if you need access.";

export const NEED_START_TEXT =
  "Send /start to pair this phone with Hatch. The first /start locks the bot until HATCH_TELEGRAM_ALLOWLIST is set.";

export const GROUP_TEXT = `Hatch v0 is private chat only — message ${BOT_HANDLE} in a DM.`;

export const TEXT_ONLY_TEXT = "Hatch v0 reads text only. Voice notes are not on yet.";

export const NEW_THREAD_TEXT = "New thread started. Send a question.";

export type TelegramLane = "ask" | "agent" | "auto";

export interface TelegramStore {
  lockedUserId: string | null;
  lastUpdateId: number;
  threads: Record<string, string>;
  modes: Record<string, TelegramLane>;
  defaultDepartments: Record<string, string>;
  historyNoticeShown: Record<string, boolean>;
}

const EMPTY_STORE: TelegramStore = {
  lockedUserId: null,
  lastUpdateId: 0,
  threads: {},
  modes: {},
  defaultDepartments: {},
  historyNoticeShown: {},
};

function emptyMaps(raw: Partial<TelegramStore> | undefined, key: "threads" | "modes" | "defaultDepartments" | "historyNoticeShown") {
  const value = raw?.[key];
  return value && typeof value === "object" ? { ...value } : {};
}

export function telegramStoreFile(cwd = process.cwd()) {
  return process.env.HATCH_TELEGRAM_STORE || path.join(cwd, "data", "telegram.json");
}

export function readTelegramStore(file = telegramStoreFile()): TelegramStore {
  try {
    if (!existsSync(file)) return { ...EMPTY_STORE, threads: {}, modes: {}, defaultDepartments: {}, historyNoticeShown: {} };
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<TelegramStore>;
    return {
      lockedUserId: raw.lockedUserId != null && raw.lockedUserId !== "" ? String(raw.lockedUserId) : null,
      lastUpdateId: Number(raw.lastUpdateId) || 0,
      threads: emptyMaps(raw, "threads") as Record<string, string>,
      modes: emptyMaps(raw, "modes") as Record<string, TelegramLane>,
      defaultDepartments: emptyMaps(raw, "defaultDepartments") as Record<string, string>,
      historyNoticeShown: emptyMaps(raw, "historyNoticeShown") as Record<string, boolean>,
    };
  } catch {
    return { ...EMPTY_STORE, threads: {}, modes: {}, defaultDepartments: {}, historyNoticeShown: {} };
  }
}

export function writeTelegramStore(store: TelegramStore, file = telegramStoreFile()) {
  withFileLock(file, () => {
    mkdirSync(path.dirname(file), { recursive: true });
    atomicWriteFile(file, `${JSON.stringify(store, null, 2)}\n`);
  });
}

function updateTelegramStore(mutator: (store: TelegramStore) => void, file = telegramStoreFile()): TelegramStore {
  return withFileLock(file, () => {
    const store = readTelegramStore(file);
    mutator(store);
    mkdirSync(path.dirname(file), { recursive: true });
    atomicWriteFile(file, `${JSON.stringify(store, null, 2)}\n`);
    return store;
  });
}

export function lockTelegramUser(userId: string, file = telegramStoreFile()) {
  return updateTelegramStore((store) => {
    if (!store.lockedUserId) store.lockedUserId = String(userId);
  }, file);
}

export function rememberTelegramThread(userId: string, threadId: string, file = telegramStoreFile()) {
  return updateTelegramStore((store) => {
    store.threads[String(userId)] = threadId;
  }, file);
}

export function rememberTelegramOffset(updateId: number, file = telegramStoreFile()) {
  return updateTelegramStore((store) => {
    if (updateId > store.lastUpdateId) store.lastUpdateId = updateId;
  }, file);
}

export function setTelegramMode(userId: string, mode: TelegramLane, file = telegramStoreFile()) {
  return updateTelegramStore((store) => {
    store.modes[String(userId)] = mode;
  }, file);
}

export function setTelegramDepartment(userId: string, departmentId: string, file = telegramStoreFile()) {
  return updateTelegramStore((store) => {
    store.defaultDepartments[String(userId)] = departmentId;
  }, file);
}

export function markTelegramHistoryNotice(userId: string, file = telegramStoreFile()) {
  return updateTelegramStore((store) => {
    store.historyNoticeShown[String(userId)] = true;
  }, file);
}

export function clearTelegramHistoryNotice(userId: string, file = telegramStoreFile()) {
  return updateTelegramStore((store) => {
    delete store.historyNoticeShown[String(userId)];
  }, file);
}

export function telegramDefaultDepartment(storeDept?: string | null): string {
  const raw = (storeDept || process.env.HATCH_TELEGRAM_DEFAULT_DEPT || LITTLE_ELM).trim().toLowerCase();
  const id = migrateWorkspaceId(raw);
  return (DEPARTMENT_IDS as readonly string[]).includes(id) ? id : LITTLE_ELM;
}

export function telegramLaneForUser(store: TelegramStore, userId: string): TelegramLane {
  return store.modes[String(userId)] || "auto";
}

export function parseTelegramAllowlist(raw: string | undefined | null): string[] {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseTelegramCommand(text: string): string | null {
  const match = text.trim().match(/^\/([a-zA-Z0-9_]+)(?:@[\w]+)?(?:\s|$)/);
  return match ? match[1].toLowerCase() : null;
}

export function telegramCommandRest(text: string): string {
  return text.trim().replace(/^\/[a-zA-Z0-9_]+(?:@[\w]+)?\s*/, "").trim();
}

export function isTelegramConflict(error: string): boolean {
  return /conflict|terminated by other getUpdates/i.test(error);
}

export function telegramPollBackoffMs(error: string, random = Math.random): number {
  if (!isTelegramConflict(error)) return TELEGRAM_POLL_BACKOFF_MS;
  const span = TELEGRAM_CONFLICT_BACKOFF_MS_MAX - TELEGRAM_CONFLICT_BACKOFF_MS_MIN;
  return TELEGRAM_CONFLICT_BACKOFF_MS_MIN + Math.floor(random() * (span + 1));
}

export function telegramPidfile(cwd = process.cwd()) {
  return process.env.HATCH_TELEGRAM_PIDFILE || path.join(cwd, "data", "telegram.pid");
}

function pidIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function claimTelegramPidfile(
  file = telegramPidfile(),
  pid = process.pid,
): { ok: true } | { ok: false; reason: string } {
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) {
    const existing = Number(readFileSync(file, "utf8").trim());
    if (existing && existing !== pid && pidIsAlive(existing)) {
      return {
        ok: false,
        reason: `Telegram bridge already running (pid ${existing}). Stop it or wait — overlapping getUpdates causes Conflict.`,
      };
    }
  }
  writeFileSync(file, `${pid}\n`);
  return { ok: true };
}

export function releaseTelegramPidfile(file = telegramPidfile(), pid = process.pid) {
  try {
    if (existsSync(file) && Number(readFileSync(file, "utf8").trim()) === pid) unlinkSync(file);
  } catch {
    /* ignore */
  }
}

export function formatTelegramFailure(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Hatch failed";
  if (/No model is ready/i.test(msg)) return msg;
  return `${msg}\n\n${connectHelp({
    connected: false,
    reachable: false,
    modelPulled: false,
    model: "",
    preferredModel: "",
    baseUrl: "",
    host: "",
    kind: "remote",
    provider: "openai-compatible",
    hasKey: false,
    fallback: false,
    models: [],
    error: msg,
  })}`;
}

export type TelegramGateAction = "allow" | "reject" | "need-start" | "lock-and-allow";

export function telegramGate(opts: {
  userId: string | number;
  command: string | null;
  envAllowlist: string[];
  lockedUserId: string | null;
}): TelegramGateAction {
  const id = String(opts.userId);
  if (opts.envAllowlist.length) {
    return opts.envAllowlist.includes(id) ? "allow" : "reject";
  }
  if (!opts.lockedUserId) {
    return opts.command === "start" ? "lock-and-allow" : "need-start";
  }
  return opts.lockedUserId === id ? "allow" : "reject";
}

export interface IncomingTelegram {
  chatType: string;
  chatId: number;
  userId: string;
  firstName: string;
  text?: string;
}

export type TelegramPlan =
  | { type: "ignore" }
  | {
      type: "reply";
      text: string;
      lock?: boolean;
      resetThread?: boolean;
      setMode?: TelegramLane;
      setDepartment?: string;
    }
  | { type: "chat"; query: string; agent?: boolean };

export function planTelegramMessage(
  incoming: IncomingTelegram,
  ctx: { envAllowlist: string[]; lockedUserId: string | null; defaultDepartmentId?: string },
): TelegramPlan {
  if (incoming.chatType && incoming.chatType !== "private") {
    return { type: "reply", text: GROUP_TEXT };
  }

  const command = incoming.text ? parseTelegramCommand(incoming.text) : null;
  const gate = telegramGate({
    userId: incoming.userId,
    command,
    envAllowlist: ctx.envAllowlist,
    lockedUserId: ctx.lockedUserId,
  });

  if (gate === "reject") return { type: "reply", text: REJECT_TEXT };
  if (gate === "need-start") return { type: "reply", text: NEED_START_TEXT };

  if (!incoming.text?.trim()) {
    return { type: "reply", text: TEXT_ONLY_TEXT };
  }

  if (command === "start") {
    return {
      type: "reply",
      text: gate === "lock-and-allow" ? `${WELCOME_TEXT}\n\n${LOCKED_HINT}` : WELCOME_TEXT,
      lock: gate === "lock-and-allow",
    };
  }
  if (command === "help") return { type: "reply", text: HELP_TEXT };
  if (command === "new") return { type: "reply", text: NEW_THREAD_TEXT, resetThread: true };
  if (command === "ask" || command === "agent" || command === "auto") {
    const rest = telegramCommandRest(incoming.text);
    if (rest && command !== "auto") {
      return { type: "chat", query: rest, agent: command === "agent" };
    }
    const text = command === "ask" ? ASK_MODE_TEXT : command === "agent" ? AGENT_MODE_TEXT : AUTO_MODE_TEXT;
    return { type: "reply", text, setMode: command };
  }
  if (command === "dept") {
    const rest = telegramCommandRest(incoming.text);
    if (!rest) {
      const current = telegramDefaultDepartment(ctx.defaultDepartmentId);
      return {
        type: "reply",
        text: `Write department: ${workspaceLabel(current)} (${current}). ${DEPT_HELP_TEXT}`,
      };
    }
    const parsed = parseMentionedDepartment(rest);
    if (!parsed) return { type: "reply", text: DEPT_HELP_TEXT };
    return {
      type: "reply",
      text: `Write department set to ${workspaceLabel(parsed)}. Drafts use write_draft here unless you name another store.`,
      setDepartment: parsed,
    };
  }
  if (command) return { type: "reply", text: HELP_TEXT };

  return { type: "chat", query: incoming.text.trim() };
}

export function chunkTelegramText(text: string, max = TELEGRAM_CHUNK): string[] {
  const clean = (text || "").replace(/\s+$/u, "");
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    let cut = slice.lastIndexOf("\n\n");
    if (cut < max * 0.4) cut = slice.lastIndexOf("\n");
    if (cut < max * 0.4) cut = slice.lastIndexOf(" ");
    if (cut < max * 0.4) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function formatTelegramReply(result: {
  text: string;
  sources?: { file: string }[];
  tools?: { name: string; ok: boolean; detail: string }[];
  historyDropped?: boolean;
}): string {
  const parts = [stripThinkBlocks(result.text || "").trim() || "(empty reply)"];
  const files = [...new Set((result.sources || []).map((s) => s.file).filter(Boolean))];
  if (files.length) parts.push(`Sources: ${files.join(", ")}`);
  const wrote = (result.tools || []).filter((t) => t.ok && t.name === "write_draft");
  if (wrote.length) parts.push(wrote.map((t) => t.detail).join("\n"));
  const denied = (result.tools || []).filter((t) => !t.ok);
  if (denied.length) {
    parts.push(denied.map((t) => `${t.name} denied — ${t.detail}`).join("\n"));
  }
  if (result.historyDropped) parts.push(HISTORY_WINDOW_NOTICE);
  return parts.join("\n\n");
}

/** Strip bot token from logs and thrown messages. Never print HATCH_TELEGRAM_BOT_TOKEN. */
export function redactTelegramSecrets(text: string, token?: string): string {
  let out = String(text || "");
  const secrets = [token, process.env.HATCH_TELEGRAM_BOT_TOKEN].filter((s): s is string => Boolean(s && s.length > 3));
  for (const secret of secrets) {
    out = out.split(secret).join("[redacted]");
  }
  out = out.replace(/https?:\/\/api\.telegram\.org\/bot[^/\s]+/gi, "https://api.telegram.org/bot[redacted]");
  out = out.replace(/\/bot[^/\s]+/gi, "/bot[redacted]");
  return out;
}

export function telegramLog(message: string, token?: string) {
  console.log(redactTelegramSecrets(message, token));
}

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramApi {
  getMe(): Promise<TelegramUser>;
  deleteWebhook(): Promise<unknown>;
  getUpdates(offset: number, timeout: number): Promise<TelegramUpdate[]>;
  sendMessage(chatId: number, text: string): Promise<unknown>;
  sendChatAction(chatId: number, action?: string): Promise<unknown>;
}

export function telegramApiRoot() {
  return (process.env.HATCH_TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");
}

export function createTelegramApi(token: string, fetchImpl: typeof fetch = fetch): TelegramApi {
  async function call<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
    const url = `${telegramApiRoot()}/bot${token}/${method}`;
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(redactTelegramSecrets(err instanceof Error ? err.message : "Telegram network error", token));
    }
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: T }
      | null;
    if (!json?.ok) {
      throw new Error(redactTelegramSecrets(json?.description || `Telegram ${method} failed (${res.status})`, token));
    }
    return json.result as T;
  }

  return {
    getMe: () => call<TelegramUser>("getMe"),
    deleteWebhook: () => call("deleteWebhook", { drop_pending_updates: false }),
    getUpdates: (offset, timeout) =>
      call<TelegramUpdate[]>("getUpdates", {
        offset,
        timeout,
        allowed_updates: ["message"],
      }),
    sendMessage: (chatId, text) =>
      call("sendMessage", {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    sendChatAction: (chatId, action = "typing") =>
      call("sendChatAction", {
        chat_id: chatId,
        action,
      }),
  };
}

export async function sendTelegramChunks(api: TelegramApi, chatId: number, text: string) {
  for (const chunk of chunkTelegramText(text)) {
    await api.sendMessage(chatId, chunk);
  }
}
