import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import { applyEnvFile, parseEnvFile } from "./env-file.ts";
import {
  BOT_HANDLE,
  HELP_TEXT,
  LOCKED_HINT,
  NEED_START_TEXT,
  NEW_THREAD_TEXT,
  REJECT_TEXT,
  TEXT_ONLY_TEXT,
  WELCOME_TEXT,
  chunkTelegramText,
  createTelegramApi,
  formatTelegramReply,
  sendTelegramChunks,
  lockTelegramUser,
  parseTelegramAllowlist,
  parseTelegramCommand,
  planTelegramMessage,
  readTelegramStore,
  redactTelegramSecrets,
  telegramGate,
  telegramStoreFile,
} from "./telegram.ts";

const SNAP = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in SNAP)) delete process.env[key];
  }
  Object.assign(process.env, SNAP);
});

describe("parseTelegramAllowlist", () => {
  it("splits comma-separated ids and drops empties", () => {
    assert.deepEqual(parseTelegramAllowlist("123, 456,,789"), ["123", "456", "789"]);
    assert.deepEqual(parseTelegramAllowlist("  "), []);
    assert.deepEqual(parseTelegramAllowlist(undefined), []);
  });
});

describe("parseTelegramCommand", () => {
  it("reads /start and /help including bot mention", () => {
    assert.equal(parseTelegramCommand("/start"), "start");
    assert.equal(parseTelegramCommand("/START@Hatchboundariesbot"), "start");
    assert.equal(parseTelegramCommand("/help please"), "help");
    assert.equal(parseTelegramCommand("how does loyalty work?"), null);
  });
});

describe("telegramGate", () => {
  it("honors env allowlist over first-/start lock", () => {
    assert.equal(
      telegramGate({ userId: "1", command: "start", envAllowlist: ["1", "2"], lockedUserId: null }),
      "allow",
    );
    assert.equal(
      telegramGate({ userId: "9", command: "start", envAllowlist: ["1"], lockedUserId: null }),
      "reject",
    );
  });

  it("locks to the first /start when allowlist is empty", () => {
    assert.equal(
      telegramGate({ userId: "42", command: "start", envAllowlist: [], lockedUserId: null }),
      "lock-and-allow",
    );
    assert.equal(
      telegramGate({ userId: "42", command: null, envAllowlist: [], lockedUserId: null }),
      "need-start",
    );
    assert.equal(
      telegramGate({ userId: "42", command: null, envAllowlist: [], lockedUserId: "42" }),
      "allow",
    );
    assert.equal(
      telegramGate({ userId: "99", command: "start", envAllowlist: [], lockedUserId: "42" }),
      "reject",
    );
  });
});

describe("planTelegramMessage", () => {
  const daniel = {
    chatType: "private",
    chatId: 1,
    userId: "42",
    firstName: "Daniel",
  };

  it("welcomes /start and pairs the first phone", () => {
    const plan = planTelegramMessage(
      { ...daniel, text: "/start" },
      { envAllowlist: [], lockedUserId: null },
    );
    assert.equal(plan.type, "reply");
    if (plan.type !== "reply") return;
    assert.equal(plan.lock, true);
    assert.match(plan.text, /BOUNDARIES/);
    assert.match(plan.text, new RegExp(LOCKED_HINT));
    assert.match(WELCOME_TEXT, /BOUNDARIES/);
  });

  it("rejects strangers politely and asks unpaired users to /start", () => {
    const reject = planTelegramMessage(
      { ...daniel, userId: "99", text: "hi" },
      { envAllowlist: ["42"], lockedUserId: null },
    );
    assert.deepEqual(reject, { type: "reply", text: REJECT_TEXT });

    const need = planTelegramMessage({ ...daniel, text: "hi" }, { envAllowlist: [], lockedUserId: null });
    assert.deepEqual(need, { type: "reply", text: NEED_START_TEXT });
  });

  it("routes text to Chat and supports /help /new", () => {
    const chat = planTelegramMessage(
      { ...daniel, text: "How does loyalty work?" },
      { envAllowlist: ["42"], lockedUserId: null },
    );
    assert.deepEqual(chat, { type: "chat", query: "How does loyalty work?" });

    const help = planTelegramMessage(
      { ...daniel, text: "/help" },
      { envAllowlist: ["42"], lockedUserId: null },
    );
    assert.deepEqual(help, { type: "reply", text: HELP_TEXT });
    assert.match(HELP_TEXT, new RegExp(BOT_HANDLE.replace("@", "@")));

    const fresh = planTelegramMessage(
      { ...daniel, text: "/new" },
      { envAllowlist: ["42"], lockedUserId: null },
    );
    assert.deepEqual(fresh, { type: "reply", text: NEW_THREAD_TEXT, resetThread: true });
  });

  it("blocks groups and non-text", () => {
    const group = planTelegramMessage(
      { ...daniel, chatType: "group", text: "/start" },
      { envAllowlist: ["42"], lockedUserId: null },
    );
    assert.equal(group.type, "reply");
    if (group.type === "reply") assert.match(group.text, /private chat only/);

    const voice = planTelegramMessage({ ...daniel, text: undefined }, { envAllowlist: ["42"], lockedUserId: null });
    assert.deepEqual(voice, { type: "reply", text: TEXT_ONLY_TEXT });
  });
});

describe("chunkTelegramText", () => {
  it("splits long replies on paragraph boundaries under the Telegram cap", () => {
    assert.deepEqual(chunkTelegramText(""), []);
    assert.deepEqual(chunkTelegramText("short"), ["short"]);
    const para = `${"a".repeat(200)}\n\n${"b".repeat(200)}`;
    assert.deepEqual(chunkTelegramText(para, 220), ["a".repeat(200), "b".repeat(200)]);
    const hard = "x".repeat(5000);
    const chunks = chunkTelegramText(hard, 3900);
    assert.ok(chunks.every((c) => c.length <= 3900));
    assert.equal(chunks.join("").length, 5000);
  });
});

describe("formatTelegramReply", () => {
  it("appends sources and denied tools", () => {
    const text = formatTelegramReply({
      text: "TapMango or text COFFEE.",
      sources: [{ file: "DEMO_loyalty.md" }, { file: "DEMO_loyalty.md" }],
      tools: [{ name: "write_draft", ok: false, detail: "no write" }],
    });
    assert.match(text, /TapMango/);
    assert.match(text, /Sources: DEMO_loyalty.md/);
    assert.match(text, /write_draft denied/);
  });
});

describe("redactTelegramSecrets", () => {
  it("never leaves the bot token in a URL or message", () => {
    const token = "123456:FAKESECRET_c3d4e5f6g7h8i9j0k1l2";
    process.env.HATCH_TELEGRAM_BOT_TOKEN = token;
    const leaked = `GET https://api.telegram.org/bot${token}/getUpdates failed for ${token}`;
    const clean = redactTelegramSecrets(leaked, token);
    assert.equal(clean.includes(token), false);
    assert.match(clean, /bot\[redacted\]/);
    assert.equal(clean.includes("AAH"), false);
  });
});

describe("telegram local store", () => {
  it("persists the first /start user id", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hatch-tg-"));
    const file = path.join(dir, "telegram.json");
    process.env.HATCH_TELEGRAM_STORE = file;
    try {
      assert.equal(telegramStoreFile(), file);
      assert.equal(readTelegramStore().lockedUserId, null);
      lockTelegramUser("42");
      assert.equal(readTelegramStore(file).lockedUserId, "42");
      lockTelegramUser("99");
      assert.equal(readTelegramStore(file).lockedUserId, "42");
      const raw = readFileSync(file, "utf8");
      assert.match(raw, /"lockedUserId": "42"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("sendTelegramChunks", () => {
  it("sends one Telegram message per chunk", async () => {
    const sent: string[] = [];
    const api = {
      getMe: async () => ({ id: 1 }),
      deleteWebhook: async () => true,
      getUpdates: async () => [],
      sendMessage: async (_chatId: number, text: string) => {
        sent.push(text);
      },
      sendChatAction: async () => true,
    };
    await sendTelegramChunks(api, 1, "short reply");
    assert.deepEqual(sent, ["short reply"]);
    const long = `${"p".repeat(2000)}\n\n${"q".repeat(2000)}`;
    const longSent: string[] = [];
    await sendTelegramChunks(
      { ...api, sendMessage: async (_c, text) => longSent.push(text) },
      9,
      long,
    );
    assert.ok(longSent.length >= 2);
    assert.ok(longSent.every((c) => c.length <= 3900));
    assert.equal(longSent.join("\n\n"), long);
  });
});

describe("createTelegramApi", () => {
  it("calls Bot API without exposing the token in thrown errors", async () => {
    const token = "999:FAKESECRET_s1t2u3v4w5x6y7z8a9b0";
    const urls: string[] = [];
    const api = createTelegramApi(token, async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ ok: false, description: `bad ${token}` }), { status: 401 });
    });
    await assert.rejects(() => api.getMe(), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message.includes(token), false);
      assert.match(err.message, /bad \[redacted\]/);
      return true;
    });
    assert.equal(urls.length, 1);
    assert.match(urls[0], /getMe/);
  });
});

describe("env file loader", () => {
  it("parses placeholders without requiring a real token", () => {
    const parsed = parseEnvFile(`# comment\nHATCH_TELEGRAM_BOT_TOKEN=\nHATCH_TELEGRAM_ALLOWLIST=1,2\n`);
    assert.equal(parsed.HATCH_TELEGRAM_BOT_TOKEN, "");
    assert.equal(parsed.HATCH_TELEGRAM_ALLOWLIST, "1,2");
  });

  it("keeps env example tokens as empty placeholders", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    for (const name of [".env.local.example", ".env.example"]) {
      const text = readFileSync(path.join(root, name), "utf8");
      assert.match(text, /HATCH_TELEGRAM_BOT_TOKEN=/);
      assert.equal(parseEnvFile(text).HATCH_TELEGRAM_BOT_TOKEN, "");
      assert.doesNotMatch(text, /HATCH_TELEGRAM_BOT_TOKEN=\S/);
    }
  });

  it("does not overwrite an existing env value", () => {
    const env: NodeJS.ProcessEnv = { HATCH_TELEGRAM_BOT_TOKEN: "already" };
    applyEnvFile("HATCH_TELEGRAM_BOT_TOKEN=other\nHATCH_TELEGRAM_ALLOWLIST=9\n", env);
    assert.equal(env.HATCH_TELEGRAM_BOT_TOKEN, "already");
    assert.equal(env.HATCH_TELEGRAM_ALLOWLIST, "9");
  });
});
