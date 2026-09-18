/**
 * Hatch OS Telegram long-poll worker (Mac dogfood).
 *
 *   cd apps/hatch-os
 *   npm run telegram
 *
 * Uses getUpdates — no public webhook. Same Ask/agent pipeline as Chat.
 * Never logs HATCH_TELEGRAM_BOT_TOKEN.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runChatTurn } from "../src/lib/chat.ts";
import { ENTERPRISE, HQ_OPS, LITTLE_ELM, PROSPER } from "../src/lib/departments.ts";
import { applyEnvFile } from "../src/lib/env-file.ts";
import { llmConfig } from "../src/lib/llm.ts";
import { createThread, getThread } from "../src/lib/store.ts";
import {
  BOT_HANDLE,
  BOT_URL,
  TELEGRAM_TYPING_MS,
  createTelegramApi,
  formatTelegramReply,
  lockTelegramUser,
  parseTelegramAllowlist,
  planTelegramMessage,
  readTelegramStore,
  rememberTelegramOffset,
  rememberTelegramThread,
  sendTelegramChunks,
  telegramLog,
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
) {
  const threadId = threadForUser(incoming.userId, incoming.firstName);
  await api.sendChatAction(incoming.chatId, "typing").catch(() => undefined);
  const typing = setInterval(() => {
    void api.sendChatAction(incoming.chatId, "typing").catch(() => undefined);
  }, TELEGRAM_TYPING_MS);
  try {
    const result = await runChatTurn({
      query,
      threadId,
      departmentId: ENTERPRISE,
      accessibleDepartments: PARTNER_DEPARTMENTS,
      enterprise: true,
    });
    await sendTelegramChunks(api, incoming.chatId, formatTelegramReply(result));
  } finally {
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
    });

    if (plan.type === "ignore") return;

    if (plan.type === "reply") {
      if (plan.lock) lockTelegramUser(incoming.userId);
      if (plan.resetThread) threadForUser(incoming.userId, incoming.firstName, true);
      await sendTelegramChunks(api, incoming.chatId, plan.text);
      return;
    }

    telegramLog(`Chat turn from user ${incoming.userId} (${incoming.firstName})`);
    await replyToChat(incoming, plan.query, api);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Hatch failed";
    await sendTelegramChunks(api, incoming.chatId, msg).catch(() => undefined);
  }
}

async function main() {
  loadLocalEnv();
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
    telegramLog(`Store: ${telegramStoreFile()}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Telegram getMe failed.");
    process.exit(1);
  }

  let offset = readTelegramStore().lastUpdateId + 1;
  let running = true;

  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

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
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Telegram bridge failed.");
  process.exit(1);
});
