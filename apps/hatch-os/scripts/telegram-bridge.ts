/**
 * Hatch OS Telegram long-poll worker (Mac dogfood).
 *
 *   cd apps/hatch-os
 *   npm run telegram
 *   # or: bash scripts/keep-telegram.sh  (kills stale pid, waits, then starts)
 *
 * Uses getUpdates — no public webhook. Same Ask/agent pipeline as Chat.
 * Never logs HATCH_TELEGRAM_BOT_TOKEN.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { wantsAgentTurn } from "../src/lib/agent-intent.ts";
import { runChatTurn } from "../src/lib/chat.ts";
import { ENTERPRISE, HQ_OPS, LITTLE_ELM, PROSPER } from "../src/lib/departments.ts";
import { applyEnvFile } from "../src/lib/env-file.ts";
import { llmConfig } from "../src/lib/llm.ts";
import { createThread, getThread } from "../src/lib/store.ts";
import {
  BOT_HANDLE,
  BOT_URL,
  HISTORY_WINDOW_NOTICE,
  TELEGRAM_TYPING_MS,
  TELEGRAM_WORKING_MS,
  WORKING_AGENT,
  WORKING_ASK,
  claimTelegramPidfile,
  clearTelegramHistoryNotice,
  createTelegramApi,
  formatTelegramFailure,
  formatTelegramReply,
  lockTelegramUser,
  markTelegramHistoryNotice,
  parseTelegramAllowlist,
  planTelegramMessage,
  readTelegramStore,
  releaseTelegramPidfile,
  rememberTelegramOffset,
  rememberTelegramThread,
  sendTelegramChunks,
  setTelegramDepartment,
  setTelegramMode,
  telegramDefaultDepartment,
  telegramLaneForUser,
  telegramLog,
  telegramPollBackoffMs,
  telegramStoreFile,
  type IncomingTelegram,
  type TelegramMessage,
} from "../src/lib/telegram.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.cwd() !== ROOT) process.chdir(ROOT);

function loadLocalEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    applyEnvFile(readFileSync(file, "utf8"));
  }
}

function requireToken(): string {
  const token = (process.env.HATCH_TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    console.error(
      "HATCH_TELEGRAM_BOT_TOKEN is required. Copy .env.local.example → .env.local and paste the BotFather token. Do not commit it.",
    );
    process.exit(1);
  }
  return token;
}

const PARTNER_DEPARTMENTS = [LITTLE_ELM, PROSPER, HQ_OPS];

function incomingFromMessage(message: TelegramMessage): IncomingTelegram | null {
  const from = message.from;
  if (!from || from.is_bot) return null;
  return {
    chatType: message.chat.type,
    chatId: message.chat.id,
    userId: String(from.id),
    firstName: from.first_name || "Telegram",
    text: message.text || message.caption,
  };
}

function threadForUser(userId: string, firstName: string, reset = false): string {
  const store = readTelegramStore();
  const existing = reset ? null : store.threads[userId];
  if (existing) {
    const thread = getThread(existing);
    if (thread && !thread.archived) return thread.id;
  }
  const thread = createThread(ENTERPRISE, `Telegram · ${firstName}`);
  rememberTelegramThread(userId, thread.id);
  return thread.id;
}

async function replyToChat(
  incoming: IncomingTelegram,
  query: string,
  api: ReturnType<typeof createTelegramApi>,
  agent?: boolean,
) {
  const threadId = threadForUser(incoming.userId, incoming.firstName);
  const store = readTelegramStore();
  const defaultDepartmentId = telegramDefaultDepartment(store.defaultDepartments[incoming.userId]);
  const agentic = wantsAgentTurn(query, agent);
  await api.sendChatAction(incoming.chatId, "typing").catch(() => undefined);
  const typing = setInterval(() => {
    void api.sendChatAction(incoming.chatId, "typing").catch(() => undefined);
  }, TELEGRAM_TYPING_MS);
  const working = setTimeout(() => {
    void sendTelegramChunks(api, incoming.chatId, agentic ? WORKING_AGENT : WORKING_ASK).catch(() => undefined);
  }, TELEGRAM_WORKING_MS);
  try {
    const result = await runChatTurn({
      query,
      threadId,
      departmentId: ENTERPRISE,
      accessibleDepartments: PARTNER_DEPARTMENTS,
      enterprise: true,
      agent,
      defaultDepartmentId,
    });
    let text = formatTelegramReply({
      ...result,
      historyDropped: result.historyDropped && !store.historyNoticeShown[incoming.userId],
    });
    if (result.historyDropped && !store.historyNoticeShown[incoming.userId]) {
      markTelegramHistoryNotice(incoming.userId);
      if (!text.includes(HISTORY_WINDOW_NOTICE)) text = `${text}\n\n${HISTORY_WINDOW_NOTICE}`;
    }
    await sendTelegramChunks(api, incoming.chatId, text);
  } finally {
    clearTimeout(working);
    clearInterval(typing);
  }
}

async function handleMessage(
  incoming: IncomingTelegram,
  api: ReturnType<typeof createTelegramApi>,
  envAllowlist: string[],
) {
  try {
    const store = readTelegramStore();
    const plan = planTelegramMessage(incoming, {
      envAllowlist,
      lockedUserId: store.lockedUserId,
      defaultDepartmentId: telegramDefaultDepartment(store.defaultDepartments[incoming.userId]),
    });

    if (plan.type === "ignore") return;

    if (plan.type === "reply") {
      if (plan.lock) lockTelegramUser(incoming.userId);
      if (plan.resetThread) {
        threadForUser(incoming.userId, incoming.firstName, true);
        clearTelegramHistoryNotice(incoming.userId);
      }
      if (plan.setMode) setTelegramMode(incoming.userId, plan.setMode);
      if (plan.setDepartment) setTelegramDepartment(incoming.userId, plan.setDepartment);
      await sendTelegramChunks(api, incoming.chatId, plan.text);
      return;
    }

    const lane = telegramLaneForUser(store, incoming.userId);
    const agent = plan.agent ?? (lane === "agent" ? true : lane === "ask" ? false : undefined);
    telegramLog(`Chat turn from user ${incoming.userId} (${incoming.firstName})`);
    await replyToChat(incoming, plan.query, api, agent);
  } catch (err) {
    await sendTelegramChunks(api, incoming.chatId, formatTelegramFailure(err)).catch(() => undefined);
  }
}

async function main() {
  loadLocalEnv();
  const claimed = claimTelegramPidfile();
  if (!claimed.ok) {
    console.error(claimed.reason);
    process.exit(1);
  }
  const token = requireToken();
  const envAllowlist = parseTelegramAllowlist(process.env.HATCH_TELEGRAM_ALLOWLIST);
  const api = createTelegramApi(token);
  const { primary } = llmConfig();

  try {
    await api.deleteWebhook();
    const me = await api.getMe();
    const username = me.username ? `@${me.username}` : BOT_HANDLE;
    telegramLog(`Hatch Telegram bridge — long-poll getUpdates`);
    telegramLog(`Bot ${username} · ${BOT_URL}`);
    telegramLog(
      envAllowlist.length
        ? `Allowlist: env (${envAllowlist.length} id${envAllowlist.length === 1 ? "" : "s"})`
        : "Allowlist: empty — first /start locks and persists in data/telegram.json",
    );
    telegramLog(`Ask LLM: ${primary.label} · ${primary.host} · ${primary.model}`);
    telegramLog(`Default write dept: ${telegramDefaultDepartment()}`);
    telegramLog(`Store: ${telegramStoreFile()}`);
  } catch (err) {
    releaseTelegramPidfile();
    console.error(err instanceof Error ? err.message : "Telegram getMe failed.");
    process.exit(1);
  }

  let offset = readTelegramStore().lastUpdateId + 1;
  let running = true;

  const stop = () => {
    running = false;
    releaseTelegramPidfile();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("exit", () => releaseTelegramPidfile());

  while (running) {
    try {
      const updates = await api.getUpdates(offset, 25);
      for (const update of updates) {
        offset = update.update_id + 1;
        rememberTelegramOffset(update.update_id);
        const message = update.message;
        if (!message) continue;
        const incoming = incomingFromMessage(message);
        if (!incoming) continue;
        await handleMessage(incoming, api, envAllowlist);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "getUpdates failed";
      telegramLog(`Poll error: ${msg}`);
      await new Promise((resolve) => setTimeout(resolve, telegramPollBackoffMs(msg)));
    }
  }
}

main().catch((err) => {
  releaseTelegramPidfile();
  console.error(err instanceof Error ? err.message : "Telegram bridge failed.");
  process.exit(1);
});
