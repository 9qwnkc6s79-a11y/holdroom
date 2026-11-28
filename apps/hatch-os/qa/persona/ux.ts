/**
 * UX sweep: every surface of the Hatch web app at phone (390x844) and desktop (1280x800), with a
 * screenshot and pass/fail per check. Runs against a real deployment (production or preview) with a
 * real invite-code sign-in, but every write is intercepted and answered by the test:
 *   - /api/email-draft (send / save_draft / discard) never reaches Gmail
 *   - /api/connectors POST/DELETE and OAuth /start never touch real connections
 *   - /api/routines writes go to an in-memory fake; /api/ethics saves are captured, not stored
 *   - /api/threads writes are swallowed so fake test messages never land in real threads
 * Chat replies for card/citation/error/loading states are mocked with fictional [QA] data, so the
 * sweep costs no GPU time. Tokens are never printed.
 *
 *   QA_BASE_URL=https://hatch-os.vercel.app QA_CODE=<invite> npm run qa:ux
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";

const BASE = (process.env.QA_BASE_URL || "").replace(/\/$/, "");
const CODE = process.env.QA_CODE || "";
const OUT = process.env.QA_OUT || path.join(import.meta.dirname, "results", `ux-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const VIEWPORTS = (process.env.QA_VIEWPORTS || "phone,desktop").split(",");
const ONLY = process.env.QA_ONLY?.split(",").filter(Boolean);
const VIEWPORT = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
} as const;

interface Check { surface: string; viewport: string; name: string; pass: boolean; note?: string; shot?: string }
const checks: Check[] = [];
let vpName = "phone";

function record(surface: string, name: string, pass: boolean, note?: string, shot?: string) {
  checks.push({ surface, viewport: vpName, name, pass, note, shot });
  console.log(`${pass ? "PASS" : "FAIL"} ${vpName.padEnd(7)} ${surface} · ${name}${note ? ` — ${note}` : ""}`);
}

async function shot(page: Page, surface: string) {
  const file = `${vpName}-${surface.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: false }).catch(() => undefined);
  return file;
}

async function layoutOk(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const doc = document.scrollingElement || document.documentElement;
    const over = Array.from(document.querySelectorAll("button, input, textarea, .bubble, .source-pills, .email-draft-card, .set-row, .rt-card"))
      .filter((el) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && (r.right > vw + 2 || r.left < -2); }).length;
    return { noHScroll: doc.scrollWidth <= vw + 1, noOverflow: over === 0, over };
  });
}

/** WCAG contrast of visible text against its effective background, worst sample. */
async function worstContrast(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim()); return [Number(r), Number(g), Number(b), Number(a)]; };
    const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el: Element | null): number[] => { while (el) { const c = parse(getComputedStyle(el).backgroundColor); if (c && c[3] > 0.5) return c; el = el.parentElement; } return [255, 255, 255, 1]; };
    let worst = 99; let where = "";
    for (const el of Array.from(document.querySelectorAll(sel)).slice(0, 60)) {
      const h = el as HTMLElement;
      if (!h.innerText?.trim() || h.getBoundingClientRect().width === 0) continue;
      const fg = parse(getComputedStyle(h).color); if (!fg) continue;
      const bg = bgOf(h); const a = lum(fg); const b = lum(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < worst) { worst = ratio; where = `${h.tagName.toLowerCase()}.${h.className || ""} "${h.innerText.trim().slice(0, 24)}"`; }
    }
    return { worst: Math.round(worst * 100) / 100, where };
  }, selector);
}

// ---------- mocks ----------
interface Captured { url: string; method: string; body: unknown }
const captured: Captured[] = [];

async function guardWrites(ctx: BrowserContext) {
  const capture = async (route: Route, reply: unknown, status = 200) => {
    const req = route.request();
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    captured.push({ url: req.url().replace(BASE, ""), method: req.method(), body });
    await route.fulfill({ status, json: reply });
  };
  await ctx.route("**/sw.js", (r) => r.abort());
  await ctx.route(/\/api\/threads(\/message)?(\?|$)/, (r) => (r.request().method() === "GET" ? r.fulfill({ json: { threads: [] } }) : capture(r, { ok: true })));
  await ctx.route(/\/api\/email-draft/, (r) => {
    const body = r.request().postDataJSON() as { action: string; to: string; subject: string; body: string; draft: Record<string, unknown> };
    const status = body.action === "send" ? "sent" : body.action === "save_draft" ? "saved" : "discarded";
    return capture(r, { ok: true, emailDraft: { ...body.draft, to: body.to, subject: body.subject, body: body.body, status } });
  });
  await ctx.route(/\/api\/connectors(\?|$)/, (r) => (r.request().method() === "GET" ? r.fallback() : capture(r, { ok: true })));
  await ctx.route(/\/api\/connectors\/[a-z]+\/start/, (r) => capture(r, { message: "[QA] OAuth start intercepted", configured: true }));
  await ctx.route(/\/api\/ethics/, (r) => (r.request().method() === "GET" ? r.fallback() : capture(r, { ok: true, profile: (r.request().postDataJSON() as { profile?: unknown }).profile || {} })));
  await ctx.route(/\/api\/routines(\/run|\/advance)?(\?|$)/, (r) => routinesFake(r));
  await ctx.route(/\/api\/approvals/, (r) => capture(r, { ok: true }));
  await ctx.route(/\/api\/auth\/account/, (r) => (r.request().method() === "DELETE" ? capture(r, { ok: true }) : r.fallback()));
}

// In-memory routines store.
let routines: Record<string, unknown>[] = [];
const LIMITS = { minIntervalMinutes: 15, dailyModelRuns: 12, maxRoutines: 3 };
async function routinesFake(route: Route) {
  const req = route.request();
  const method = req.method();
  const payload = () => ({ routines, unread: 0, running: 0, limits: LIMITS, timezone: "America/Chicago" });
  captured.push({ url: req.url().replace(BASE, ""), method, body: method === "GET" || method === "DELETE" ? null : req.postDataJSON() });
  if (method === "GET") return route.fulfill({ json: payload() });
  if (method === "DELETE") { const id = new URL(req.url()).searchParams.get("id"); routines = routines.filter((r) => r.id !== id); return route.fulfill({ json: payload() }); }
  const body = req.postDataJSON() as Record<string, unknown>;
  if (method === "PATCH") {
    routines = routines.map((r) => (r.id === body.id ? { ...r, ...("enabled" in body ? { enabled: body.enabled } : {}), ...(body.name ? { name: body.name } : {}), ...(body.prompt ? { prompt: body.prompt } : {}) } : r));
    return route.fulfill({ json: payload() });
  }
  if (req.url().includes("/run")) return route.fulfill({ json: payload() });
  if (body.id) { routines = routines.map((r) => (r.id === body.id ? { ...r, name: body.name, prompt: body.prompt } : r)); return route.fulfill({ json: payload() }); }
  if (routines.length >= LIMITS.maxRoutines) return route.fulfill({ status: 400, json: { error: `You can keep up to ${LIMITS.maxRoutines} routines. Delete one first.` } });
  routines.push({ id: `qa-${routines.length + 1}`, name: body.name || "[QA] routine", prompt: body.prompt, mode: body.mode || "agent", enabled: true, schedule: `${body.when || "weekdays at 7am"} CT`, nextRunAt: new Date(Date.now() + 3600e3).toISOString(), runs: [], usesModel: body.mode === "agent" });
  return route.fulfill({ json: payload() });
}

const SOURCES = [
  { room: "Gmail", file: "[QA] Patio heater PO #4471", url: "https://mail.google.com/mail/u/0/#all/qa-thread-1" },
  { room: "Drive", file: "[QA] Quote_rev3.pdf", url: "https://drive.google.com/file/d/qa-file/view" },
];
const DRAFT = { id: "draft-qa", to: "dana@example.com", subject: "Re: [QA] Patio heater PO", body: "Hi Dana,\nDec 5 works for install.\nDaniel", status: "draft", accountEmail: "qa@example.com", threadRef: "g0:qa" };

async function mockChat(page: Page, reply: Record<string, unknown> | ((n: number) => Promise<{ status?: number; json: unknown }>)) {
  let n = 0;
  await page.unroute(/\/api\/chat(\/step)?(\?|$)/).catch(() => undefined);
  await page.route(/\/api\/chat(\/step)?(\?|$)/, async (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    n++;
    if (typeof reply === "function") { const out = await reply(n); return r.fulfill({ status: out.status || 200, json: out.json }); }
    return r.fulfill({ json: { phase: "done", threadId: "qa-thread", messageId: `qa-msg-${n}`, harness: true, activity: [], ...reply } });
  });
}

async function signIn(page: Page) {
  await page.goto(`${BASE}/signin`);
  await page.locator('input[name="invite"]').fill(CODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/chat/, { timeout: 30_000 });
  await page.goto(`${BASE}/chat?agent=general`);
  for (let i = 0; i < 2; i++) { const got = page.getByRole("button", { name: "Got it" }); if (await got.isVisible().catch(() => false)) await got.click(); }
  await page.getByLabel("Ask Hatch").waitFor({ timeout: 30_000 });
}

async function send(page: Page, text: string) {
  await page.getByLabel("Ask Hatch").fill(text);
  await page.locator('button.send[aria-label="Send"]').click();
}

async function step(surface: string, fn: () => Promise<void>) {
  if (ONLY && !ONLY.some((o) => surface.includes(o))) return;
  try { await fn(); } catch (err) { record(surface, "ran without error", false, String(err).split("\n")[0].slice(0, 200)); }
}

async function sweep(browser: Browser) {
  const ctx = await browser.newContext({ ...VIEWPORT[vpName as keyof typeof VIEWPORT], serviceWorkers: "block" });
  await guardWrites(ctx);
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept());

  await step("sign-in", async () => {
    await page.goto(`${BASE}/signin`);
    await page.locator('input[name="invite"]').fill("HATCH-NOT-A-REAL-CODE");
    await page.getByRole("button", { name: "Sign in" }).click();
    const err = page.locator(".os-error");
    await err.waitFor({ timeout: 10_000 }).catch(() => undefined);
    record("sign-in", "bad code shows an error", await err.isVisible(), (await err.textContent().catch(() => ""))?.slice(0, 80) || "", await shot(page, "sign-in-error"));
    await signIn(page);
    record("sign-in", "invite code signs in to chat", page.url().includes("/chat"), undefined, await shot(page, "chat-empty"));
    const welcome = await page.locator(".empty-welcome").isVisible().catch(() => false);
    const starters = await page.locator('[aria-label="Suggested prompts"] button').count();
    record("chat-empty", "empty state shows welcome + starters", welcome && starters > 0, `${starters} starters`);
    const l = await layoutOk(page);
    record("chat-empty", "layout fits viewport", l.noHScroll && l.noOverflow, l.over ? `${l.over} overflowing` : "");
  });

  await step("chat-loading", async () => {
    await mockChat(page, async (n) => {
      if (n === 1) return { json: { phase: "wait", note: "Searching Gmail for “[QA] patio heaters”", state: { job: { id: "qa-job" } }, threadId: "qa-thread" } };
      await new Promise((r) => setTimeout(r, 1500));
      return { json: { phase: "done", text: "Bottom line: [QA] heaters ship Dec 3 ([Patio heater PO](https://mail.google.com/mail/u/0/#all/qa-thread-1)).", sources: SOURCES, threadId: "qa-thread", messageId: "qa-msg-load", activity: [{ kind: "searching", label: "Searching Gmail", status: "done" }] } };
    });
    await send(page, "[QA] whats up w the patio heaters");
    const status = page.locator(".bubble.agent").last();
    await page.waitForTimeout(700);
    const loadingShown = /Searching|Working|Warming|…/.test((await status.innerText().catch(() => "")) || "") || (await page.locator(".os-caret").count()) > 0;
    record("chat-loading", "loading/status line shows while waiting", loadingShown, undefined, await shot(page, "chat-loading"));
    await page.locator(".source-pills a").first().waitFor({ timeout: 20_000 });
    const pills = page.locator(".source-pills a.source-pill");
    const hrefs = await pills.evaluateAll((els) => els.map((e) => ({ href: (e as HTMLAnchorElement).href, target: (e as HTMLAnchorElement).target })));
    record("citations", "source pills link out (https, new tab)", hrefs.length === 2 && hrefs.every((h) => h.href.startsWith("https://") && h.target === "_blank"), `${hrefs.length} pills`, await shot(page, "chat-citations"));
    const inline = await page.locator(".bubble.agent a[href^='https://mail.google.com']").count();
    record("citations", "inline citation link rendered", inline > 0);
    const text = await page.locator("main").innerText().catch(() => "");
    record("citations", "no raw tool rows / tool names", !/<tool_call>|email_search|cloud_files_|Used a tool/.test(text));
    const l = await layoutOk(page);
    record("citations", "layout fits viewport", l.noHScroll && l.noOverflow, l.over ? `${l.over} overflowing` : "");
  });

  await step("email-draft", async () => {
    await mockChat(page, { text: "", emailDraft: DRAFT, sources: SOURCES.slice(0, 1) });
    const before = captured.filter((c) => c.url.includes("email-draft")).length;
    await send(page, "[QA] draft dana a reply saying dec 5 works");
    const card = page.locator(".email-draft-card").last();
    await card.waitFor({ timeout: 20_000 });
    record("email-draft", "draft card appears", await card.isVisible(), undefined, await shot(page, "email-draft-card"));
    record("email-draft", "nothing sent before a button press", captured.filter((c) => c.url.includes("email-draft")).length === before);
    const bodyField = card.locator("textarea").first();
    await bodyField.fill("Hi Dana,\nDec 5 works. Edited by QA.\nDaniel");
    record("email-draft", "body is editable", (await bodyField.inputValue()).includes("Edited by QA"));
    await card.getByRole("button", { name: "Save as Gmail draft" }).click();
    await page.waitForTimeout(800);
    const saved = captured.filter((c) => c.url.includes("email-draft")).pop() as Captured | undefined;
    const sb = saved?.body as { action?: string; body?: string } | undefined;
    record("email-draft", "Save as Gmail draft sends action=save_draft with the edit", sb?.action === "save_draft" && Boolean(sb.body?.includes("Edited by QA")));
    record("email-draft", "saved status shown", /Saved to Gmail drafts/i.test(await card.innerText()), undefined, await shot(page, "email-draft-saved"));
    // Fresh card for Send and Discard.
    await send(page, "[QA] another draft");
    const card2 = page.locator(".email-draft-card").last();
    await card2.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForTimeout(800);
    const sent = (captured.filter((c) => c.url.includes("email-draft")).pop()?.body || {}) as { action?: string };
    record("email-draft", "Send fires only on press (action=send, intercepted)", sent.action === "send" && /Email sent/i.test(await card2.innerText()));
    await send(page, "[QA] third draft");
    const card3 = page.locator(".email-draft-card").last();
    await card3.getByRole("button", { name: "Discard" }).click();
    await page.waitForTimeout(800);
    const disc = (captured.filter((c) => c.url.includes("email-draft")).pop()?.body || {}) as { action?: string };
    record("email-draft", "Discard sends action=discard", disc.action === "discard" && /discarded/i.test(await card3.innerText()), undefined, await shot(page, "email-draft-discarded"));
    // Missing gmail.compose → reconnect hint.
    await page.unroute(/\/api\/email-draft/);
    await page.route(/\/api\/email-draft/, (r) => r.fulfill({ status: 403, json: { error: "Google needs draft permission.", needsReconnect: true } }));
    await send(page, "[QA] fourth draft");
    const card4 = page.locator(".email-draft-card").last();
    await card4.getByRole("button", { name: "Save as Gmail draft" }).click();
    await page.waitForTimeout(800);
    const t4 = await card4.innerText();
    const link = await card4.locator("a[href*='tab=connect']").count();
    record("email-draft", "missing scope → reconnect guidance", /reconnect|Connect apps/i.test(t4), link ? "has Reconnect link" : "text only, no link", await shot(page, "email-draft-reconnect"));
    record("email-draft", "missing scope → one-tap Reconnect link", link > 0);
    await page.unroute(/\/api\/email-draft/);
  });

  await step("chat-errors", async () => {
    await mockChat(page, async () => ({ status: 500, json: { error: "[QA] server error" } }));
    await send(page, "[QA] trigger a server error");
    const retry = page.locator(".retry button").last();
    await retry.waitFor({ timeout: 15_000 }).catch(() => undefined);
    record("chat-errors", "server error shows Retry", await retry.isVisible().catch(() => false), undefined, await shot(page, "chat-error"));
    await mockChat(page, async () => ({ status: 401, json: { error: "Your sign-in expired." } }));
    await send(page, "[QA] trigger session expiry");
    const signInBtn = page.locator(".retry button", { hasText: "Sign in" }).last();
    await signInBtn.waitFor({ timeout: 15_000 }).catch(() => undefined);
    record("session", "expired session offers Sign in", await signInBtn.isVisible().catch(() => false), undefined, await shot(page, "session-expired"));
    await page.unroute(/\/api\/chat(\/step)?(\?|$)/);
  });

  await step("scroll-jump", async () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({ id: `qa-${i}`, role: i % 2 ? "assistant" : "user", text: i % 2 ? `[QA] answer ${i}\n\n- detail one\n- detail two\n- detail three` : `[QA] question ${i}`, createdAt: new Date(Date.now() - (40 - i) * 60e3).toISOString(), done: true }));
    const ctx2 = await browser.newContext({ ...VIEWPORT[vpName as keyof typeof VIEWPORT], serviceWorkers: "block" });
    await guardWrites(ctx2);
    await ctx2.unroute(/\/api\/threads(\/message)?(\?|$)/);
    await ctx2.route(/\/api\/threads(\/message)?(\?|$)/, (r) => (r.request().method() === "GET" ? r.fulfill({ json: { threads: [{ id: "qa-long", agentId: "general", departmentId: "north-desk", title: "[QA] long", messages: msgs, updatedAt: new Date().toISOString() }] } }) : r.fulfill({ json: { ok: true } })));
    const p2 = await ctx2.newPage();
    await signIn(p2);
    await p2.waitForTimeout(1500);
    const turns = await p2.locator(".turn").count();
    const atBottom = await p2.evaluate(() => { const el = Array.from(document.querySelectorAll(".turn")).pop() as HTMLElement | undefined; if (!el) return false; const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; });
    record("scroll-jump", "long thread opens at the newest message", turns >= 30 && atBottom, `${turns} turns`, await shot(p2, "scroll-bottom"));
    await p2.locator(".turn").first().scrollIntoViewIfNeeded();
    await p2.waitForTimeout(600);
    const jump = p2.locator(".chat-jump");
    const jumpVisible = await jump.isVisible().catch(() => false);
    record("scroll-jump", "jump pill appears when scrolled up", jumpVisible, undefined, await shot(p2, "scroll-jump-pill"));
    if (jumpVisible) {
      await jump.click();
      await p2.waitForTimeout(900);
      const back = await p2.evaluate(() => { const el = Array.from(document.querySelectorAll(".turn")).pop() as HTMLElement | undefined; if (!el) return false; const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; });
      record("scroll-jump", "jump pill returns to the newest message", back);
    }
    const l = await layoutOk(p2);
    record("scroll-jump", "layout fits viewport", l.noHScroll && l.noOverflow, l.over ? `${l.over} overflowing` : "");
    await ctx2.close();
  });

  await step("settings", async () => {
    await page.goto(`${BASE}/settings`);
    await page.locator(".set-row").first().waitFor({ timeout: 15_000 });
    record("settings", "settings home renders", (await page.locator(".set-row").count()) > 5, undefined, await shot(page, "settings-home"));
    const l = await layoutOk(page);
    record("settings", "layout fits viewport", l.noHScroll && l.noOverflow, l.over ? `${l.over} overflowing` : "");
  });

  await step("theme", async () => {
    for (const theme of ["Light", "Dark"]) {
      await page.goto(`${BASE}/settings?tab=appearance`);
      const btn = page.locator(".set-row", { hasText: new RegExp(`^\\s*${theme}`, "i") }).first();
      if (await btn.isVisible().catch(() => false)) await btn.click();
      await page.waitForTimeout(400);
      const c1 = await worstContrast(page, ".set-row strong, .set-row span, h1, h2, p, label");
      const s1 = await shot(page, `theme-${theme.toLowerCase()}-settings`);
      record("theme", `${theme}: settings text contrast ≥ 4.5`, c1.worst >= 4.5, `worst ${c1.worst} at ${c1.where}`, s1);
      await page.goto(`${BASE}/chat?agent=general`);
      await page.getByLabel("Ask Hatch").waitFor();
      await page.waitForTimeout(500);
      const c2 = await worstContrast(page, ".empty-welcome h2, .empty-welcome p, .starters button, textarea, .bubble");
      record("theme", `${theme}: chat text contrast ≥ 4.5`, c2.worst >= 4.5, `worst ${c2.worst} at ${c2.where}`, await shot(page, `theme-${theme.toLowerCase()}-chat`));
    }
  });

  await step("ethics", async () => {
    await page.goto(`${BASE}/settings?tab=ethics`);
    const save = page.getByRole("button", { name: "Save", exact: true });
    await save.waitFor({ timeout: 15_000 });
    record("ethics", "Model & Ethics renders model + presets", (await page.locator('[aria-label="Default model"] button').count()) >= 2, undefined, await shot(page, "model-ethics"));
    const before = captured.filter((c) => c.url.includes("/api/ethics")).length;
    await save.click();
    await page.waitForTimeout(800);
    const after = captured.filter((c) => c.url.includes("/api/ethics")).length;
    const status = await page.locator('[role="status"], .os-error').first().innerText().catch(() => "");
    record("ethics", "Save posts settings (intercepted) and confirms", after > before && /Saved/.test(status), status.slice(0, 60), await shot(page, "model-ethics-saved"));
  });

  await step("connect-apps", async () => {
    const variants: { name: string; connected: unknown[]; status?: number }[] = [
      { name: "healthy", connected: [{ id: "google:qa", kind: "google", label: "qa@example.com", detail: "Gmail, Drive, Calendar", connectedAt: new Date().toISOString(), status: "ok" }] },
      { name: "missing-compose", connected: [{ id: "google:qa", kind: "google", label: "qa@example.com", detail: "Gmail, Drive, Calendar", connectedAt: new Date().toISOString(), status: "missing_scope", missing: ["save drafts", "send email"] }] },
      { name: "expired", connected: [{ id: "microsoft:qa", kind: "microsoft", label: "qa@outlook.example", detail: "Outlook", connectedAt: new Date().toISOString(), status: "expired" }] },
      { name: "server-error", connected: [], status: 500 },
    ];
    for (const v of variants) {
      await page.unroute(/\/api\/connectors(\?|$)/).catch(() => undefined);
      await page.route(/\/api\/connectors(\?|$)/, async (r) => {
        if (r.request().method() !== "GET") { captured.push({ url: r.request().url().replace(BASE, ""), method: r.request().method(), body: null }); return r.fulfill({ json: { ok: true } }); }
        if (v.status) return r.fulfill({ status: v.status, json: { error: "[QA] connectors down" } });
        return r.fulfill({ json: { catalog: [{ kind: "google", name: "Google", blurb: "Gmail, Drive, Calendar", auth: "oauth" }, { kind: "microsoft", name: "Microsoft", blurb: "Outlook, OneDrive", auth: "oauth" }, { kind: "email", name: "Email (IMAP)", blurb: "Any mailbox", auth: "password" }], connected: v.connected, setup: [{ kind: "google", configured: true, callbackUrl: "" }, { kind: "microsoft", configured: true, callbackUrl: "" }] } });
      });
      await page.goto(`${BASE}/settings?tab=connect`);
      await page.waitForTimeout(1200);
      const listShot = await shot(page, `connect-${v.name}`);
      if (v.name === "server-error") {
        const err = await page.locator('.os-error, [role="alert"]').count();
        const rows = await page.locator(".connect .set-row").count();
        record("connect-apps", "connectors API error shows an error state", err > 0, `${rows} rows, ${err} alerts`, listShot);
        continue;
      }
      const kind = v.name === "expired" ? "Microsoft" : "Google";
      if (v.name !== "healthy") {
        const badge = await page.locator(".connect .set-row", { hasText: kind }).locator(".set-badge").count();
        record("connect-apps", `${v.name}: list flags the connection`, badge > 0, undefined, listShot);
      }
      await page.locator(".connect .set-row", { hasText: kind }).first().click();
      await page.waitForTimeout(500);
      const detail = await page.locator(".connect").innerText();
      const detailShot = await shot(page, `connect-${v.name}-detail`);
      if (v.name === "healthy") {
        record("connect-apps", "connected Google shows Test + Disconnect", /Disconnect/.test(detail) && /Test/.test(detail), undefined, detailShot);
        record("connect-apps", "connected Google offers Reconnect (not Connect)", /Reconnect Google/.test(detail));
        await page.getByRole("button", { name: "Disconnect" }).click();
        await page.waitForTimeout(600);
        const del = captured.filter((c) => c.method === "DELETE" && c.url.includes("/api/connectors")).length;
        record("connect-apps", "Disconnect calls DELETE (intercepted) and confirms", del > 0 && /Disconnected/i.test(await page.locator(".connect").innerText()), undefined, await shot(page, "connect-disconnected"));
        await page.getByRole("button", { name: "Back to connectors" }).click();
        await page.locator(".connect .set-row", { hasText: "Microsoft" }).first().click();
        await page.getByRole("button", { name: /Connect Microsoft/ }).click();
        await page.waitForTimeout(600);
        const started = captured.some((c) => /\/api\/connectors\/microsoft\/start/.test(c.url));
        record("connect-apps", "Connect Microsoft starts OAuth (intercepted)", started, undefined, await shot(page, "connect-microsoft"));
      } else {
        record("connect-apps", `${v.name}: detail explains and offers Reconnect`, /Reconnect/.test(detail) && /(save drafts|expired|sign in again)/i.test(detail), undefined, detailShot);
      }
      const l = await layoutOk(page);
      record("connect-apps", `${v.name}: layout fits viewport`, l.noHScroll && l.noOverflow, l.over ? `${l.over} overflowing` : "");
    }
    await page.unroute(/\/api\/connectors(\?|$)/);
  });

  await step("routines", async () => {
    routines = [];
    await page.goto(`${BASE}/routines`);
    await page.locator(".rt-empty").waitFor({ timeout: 15_000 }).catch(() => undefined);
    record("routines", "empty state explains how to start", /No routines yet/.test(await page.locator("main, body").first().innerText()), undefined, await shot(page, "routines-empty"));
    const limits = await page.getByText(/Up to 12 firm-model runs a day/).count();
    record("routines", "limits copy shown", limits > 0);
    for (let i = 1; i <= 4; i++) {
      await page.getByRole("button", { name: /New routine/ }).first().click();
      const dlg = page.getByRole("dialog");
      await dlg.locator("input").first().fill(`[QA] routine ${i}`);
      await dlg.locator("textarea").first().fill("[QA] brief me on open vendor threads");
      await dlg.locator('button[type="submit"]').click();
      await page.waitForTimeout(700);
      if (i === 1) record("routines", "create adds a card", (await page.locator(".rt-card, [class*='rt-item'], article").count()) >= 1 || /\[QA\] routine 1/.test(await page.content()), undefined, await shot(page, "routines-created"));
      if (i === 4) {
        const err = await page.locator(".rt-error").innerText().catch(() => "");
        record("routines", "cap message when the limit is reached", /up to 3 routines/i.test(err), err.slice(0, 80), await shot(page, "routines-cap"));
        const cancel = page.getByRole("dialog").getByRole("button", { name: /Cancel/ });
        if (await cancel.isVisible().catch(() => false)) await cancel.click();
      }
    }
    const pause = page.getByRole("switch", { name: /Pause \[QA\] routine 1/ });
    await pause.click();
    await page.waitForTimeout(600);
    record("routines", "pause shows Paused", (await page.getByText("Paused").count()) > 0, undefined, await shot(page, "routines-paused"));
    await page.getByRole("button", { name: "Edit" }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input").first().fill("[QA] routine 1 edited");
    await dlg.locator('button[type="submit"]').click();
    await page.waitForTimeout(700);
    record("routines", "edit renames the routine", /routine 1 edited/.test(await page.content()));
    const n = routines.length;
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.waitForTimeout(700);
    record("routines", "delete (after confirm) removes it", routines.length === n - 1, undefined, await shot(page, "routines-deleted"));
    const l = await layoutOk(page);
    record("routines", "layout fits viewport", l.noHScroll && l.noOverflow, l.over ? `${l.over} overflowing` : "");
  });

  await step("sign-out", async () => {
    await page.goto(`${BASE}/settings`);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/signin/, { timeout: 15_000 }).catch(() => undefined);
    record("sign-out", "Sign out returns to sign-in", page.url().includes("/signin"), undefined, await shot(page, "signed-out"));
    const res = await page.request.get(`${BASE}/api/connectors`);
    record("sign-out", "API rejects the old cookie after sign-out", res.status() === 401, `HTTP ${res.status()}`);
  });
  await ctx.close();
}

async function bearerFlow() {
  if (ONLY && !ONLY.includes("bearer")) return;
  vpName = "api";
  const pair = await fetch(`${BASE}/api/auth/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invite: CODE, device: "QA bearer check", method: "totp" }) });
  const data = (await pair.json().catch(() => ({}))) as { token?: string };
  record("bearer", "pair returns a session token", Boolean(data.token), data.token ? `token length ${data.token.length}` : `HTTP ${pair.status}`);
  if (!data.token) return;
  const ok = await fetch(`${BASE}/api/connectors`, { headers: { Authorization: `Bearer ${data.token}` } });
  record("bearer", "Bearer token authorizes API calls", ok.status === 200, `HTTP ${ok.status}`);
  const bad = await fetch(`${BASE}/api/connectors`, { headers: { Authorization: `Bearer ${data.token.slice(0, -4)}AAAA` } });
  record("bearer", "tampered Bearer token is rejected", bad.status === 401, `HTTP ${bad.status}`);
  const none = await fetch(`${BASE}/api/connectors`);
  record("bearer", "no credentials is rejected", none.status === 401, `HTTP ${none.status}`);
}

async function main() {
  if (!BASE || !CODE) throw new Error("Set QA_BASE_URL and QA_CODE.");
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const v of VIEWPORTS) {
    vpName = v;
    await sweep(browser);
  }
  await browser.close();
  await bearerFlow();
  const passed = checks.filter((c) => c.pass).length;
  const lines = [
    `# Hatch UX sweep — ${BASE.replace(/https?:\/\//, "")} (${new Date().toISOString()})`,
    "",
    `${passed}/${checks.length} checks passed. Writes (send, save draft, disconnect, OAuth, routines, ethics) were intercepted; nothing real changed.`,
    "",
    "| viewport | surface | check | result | note | screenshot |",
    "| --- | --- | --- | --- | --- | --- |",
    ...checks.map((c) => `| ${c.viewport} | ${c.surface} | ${c.name} | ${c.pass ? "pass" : "**FAIL**"} | ${(c.note || "").replace(/\|/g, "/")} | ${c.shot ? `![](${c.shot})` : ""} |`),
  ];
  writeFileSync(path.join(OUT, "report.md"), lines.join("\n"));
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, passed, total: checks.length, checks, captured: captured.map((c) => ({ url: c.url, method: c.method })) }, null, 2));
  console.log(`\n${passed}/${checks.length} checks passed\nReport: ${path.join(OUT, "report.md")}`);
  if (passed < checks.length) process.exitCode = 1;
}

await main();
