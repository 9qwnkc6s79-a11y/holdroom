/**
 * Simulated-user QA: a scripted persona types realistic, sloppy asks into the real
 * Hatch web UI (Playwright, phone 390x844 and desktop 1280x800) against a deployed
 * Hatch with real connected data, and grades every reply with deterministic checks.
 * No model grades anything, so no firm content leaves the firm.
 *
 *   QA_BASE_URL=https://<preview>.vercel.app QA_CODE=<invite> QA_CASES=/private/persona.json npm run qa:persona
 *
 * Options (env): QA_PROFILE=<preview profile>  QA_VIEWPORTS=phone,desktop  QA_ONLY=id1,id2  QA_OUT=dir  QA_BROWSER=chromium|webkit
 *                QA_MIN_PASS=0.9 (exit 1 below this)  QA_REPORT_TEXT=1 (include answers in the md report)
 * Answers and sources are written only to QA_OUT (default qa/persona/results, git-ignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, webkit, type Browser, type Page, type Response } from "@playwright/test";
import type { PersonaFile, PersonaTurn } from "./types.ts";

const BASE = (process.env.QA_BASE_URL || "").replace(/\/$/, "");
const CODE = process.env.QA_CODE || "";
const CASES = process.env.QA_CASES || path.join(import.meta.dirname, "cases.example.json");
const OUT = process.env.QA_OUT || path.join(import.meta.dirname, "results");
const ONLY = process.env.QA_ONLY?.split(",").filter(Boolean);
const VIEWPORTS = (process.env.QA_VIEWPORTS || "phone,desktop").split(",");
const MIN_PASS = Number(process.env.QA_MIN_PASS || 0.9);
const LABEL = process.env.QA_LABEL || process.env.QA_PROFILE || "";
/** Preview-only server profile (model/protocol/flags), sent as x-hatch-qa-profile. */
const PROFILE = process.env.QA_PROFILE || "";

const VIEWPORT = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
} as const;

const DEFAULT_BUDGET: Record<PersonaTurn["kind"], number> = { chat: 20, lookup: 75, draft: 90, schedule: 60, notfound: 75 };
const NOT_FOUND = /(couldn'?t|could not|did not|didn'?t|can'?t|cannot|was not able to|wasn'?t able to) (find|see|locate|spot)|\bno (emails?|files?|results?|threads?|mentions?|match(es)?|information|info|record|records|details|updates?|messages?)\b|nothing (about|on|in|came up|matching|turned up|found)|not (find|see) any|found nothing|no sign of|(were|was) not (found|located)|isn'?t anything|there'?s nothing/i;
const TOOL_LOG = /Used a tool|<\/?tool_call>|\bTOOL\s*\{|\b(email_search|email_read|cloud_files_search|cloud_files_read|calendar_list|search_library)\b/;
const FLAG = /\(not in your sources\)/i;

interface DoneJson {
  phase: string;
  text?: string;
  emailDraft?: { to?: string; subject?: string; body?: string };
  sources?: { file?: string; room?: string; url?: string }[];
  activity?: { kind: string; label: string; status: string }[];
  verification?: { checked: number; unsupported: number; stripped: number; flagged: number; kinds: string[] };
  error?: boolean;
  note?: string;
}

interface TurnResult {
  scenario: string;
  turn: number;
  viewport: string;
  ask: string;
  kind: string;
  seconds: number;
  cold: boolean;
  pass: boolean;
  checks: Record<string, boolean>;
  notes: string[];
  text: string;
  draft?: DoneJson["emailDraft"];
  sources: string[];
  verification?: DoneJson["verification"];
}

function rx(s: string) {
  return new RegExp(s, "i");
}

async function signIn(page: Page) {
  await page.route("**/sw.js", (route) => route.abort());
  // Start every scenario on a fresh thread: hide server-side history from this browser (like a new device).
  await page.route("**/api/threads", (route) => (route.request().method() === "GET" ? route.fulfill({ json: { threads: [] } }) : route.fallback()));
  await page.goto(`${BASE}/signin`);
  await page.locator('input[name="invite"]').fill(CODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/chat/, { timeout: 30_000 });
  await page.goto(`${BASE}/chat?agent=general`);
  for (let i = 0; i < 2; i++) {
    const got = page.getByRole("button", { name: "Got it" });
    if (await got.isVisible().catch(() => false)) await got.click();
  }
  await page.getByLabel("Ask Hatch").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  const restored = await page.locator(".turn").count();
  if (restored) throw new Error(`expected a fresh thread, found ${restored} restored turns`);
}

async function askAndWait(page: Page, ask: string, timeoutMs: number): Promise<{ done: DoneJson | null; seconds: number; sawWarm: boolean }> {
  let done: DoneJson | null = null;
  let sawWarm = false;
  const onResponse = async (res: Response) => {
    const url = res.url();
    if (!/\/api\/chat(\/step)?\/?(\?|$)/.test(url) || res.request().method() !== "POST") return;
    const json = (await res.json().catch(() => null)) as DoneJson | null;
    if (!json) return;
    if (/warming up/i.test(json.note || "")) sawWarm = true;
    if (json.phase === "done") done = json;
  };
  page.on("response", onResponse);
  const started = Date.now();
  await page.getByLabel("Ask Hatch").fill(ask);
  await page.locator('button.send[aria-label="Send"]').click();
  const deadline = started + timeoutMs;
  while (!done && Date.now() < deadline) await page.waitForTimeout(400);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  await page.waitForTimeout(900); // let the bubble, pills and card paint
  page.off("response", onResponse);
  return { done, seconds, sawWarm };
}

async function layoutChecks(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const doc = document.scrollingElement || document.documentElement;
    const noHorizontalScroll = doc.scrollWidth <= vw + 1;
    const composer = document.querySelector('[aria-label="Ask Hatch"]') as HTMLElement | null;
    const cr = composer?.getBoundingClientRect();
    const composerVisible = Boolean(cr && cr.top >= 0 && cr.bottom <= vh + 1 && cr.width > 0);
    const turns = Array.from(document.querySelectorAll(".turn"));
    const last = turns[turns.length - 1] as HTMLElement | undefined;
    let lastVisible = true;
    if (last) {
      const r = last.getBoundingClientRect();
      // Bottom of the newest turn should be on screen (auto-scroll) or the jump button offered.
      const jump = document.querySelector(".jump") as HTMLElement | null;
      lastVisible = (r.top < vh && r.bottom > 0) || Boolean(jump && jump.offsetParent !== null);
    }
    const wide = Array.from(document.querySelectorAll(".bubble, .source-pills, .email-draft-card")).filter((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.right > vw + 2 || r.left < -2;
    }).length;
    const chatText = (document.querySelector("main") || document.body).innerText || "";
    return { noHorizontalScroll, composerVisible, lastVisible, noOverflowingBubbles: wide === 0, chatText };
  });
}

function grade(turn: PersonaTurn, done: DoneJson | null, seconds: number, cold: boolean, dom: Awaited<ReturnType<typeof layoutChecks>>, draftShown: boolean) {
  const notes: string[] = [];
  const text = done?.text || "";
  const draftText = done?.emailDraft ? `${done.emailDraft.subject || ""}\n${done.emailDraft.body || ""}` : "";
  const all = `${text}\n${draftText}`;
  const searched = (done?.activity || []).some((e) => e.kind === "searching" || e.kind === "reading");
  const checks: Record<string, boolean> = {};
  checks.answered = Boolean(done && !done.error && all.trim());
  if (!checks.answered) notes.push(done ? `error/empty reply${done.text ? `: ${done.text.slice(0, 80)}` : ""}` : "no reply before timeout");
  checks.routing = turn.kind === "chat" ? !searched : searched;
  if (!checks.routing) notes.push(turn.kind === "chat" ? "searched firm data on a casual ask" : "did not look anything up");
  const facts = turn.facts || [];
  const hit = facts.filter((f) => rx(f).test(all));
  checks.facts = hit.length === facts.length;
  if (!checks.facts) notes.push(`missing: ${facts.filter((f) => !hit.includes(f)).join(" | ")}`);
  const bad = (turn.forbid || []).filter((f) => rx(f).test(all));
  checks.noForbidden = bad.length === 0;
  if (bad.length) notes.push(`said: ${bad.join(" | ")}`);
  if (turn.anchor) {
    checks.anchored = rx(turn.anchor).test(all);
    if (!checks.anchored) notes.push(`lost the thread (no /${turn.anchor}/)`);
  }
  if (turn.kind === "notfound") {
    checks.honestNotFound = NOT_FOUND.test(text);
    if (!checks.honestNotFound) notes.push("did not say it found nothing");
  }
  if (turn.kind === "draft") {
    checks.draftCard = draftShown && Boolean(done?.emailDraft?.body);
    if (!checks.draftCard) notes.push("no email draft card");
  }
  const v = done?.verification;
  checks.grounded = !FLAG.test(all) && !(v && v.flagged > 0);
  if (!checks.grounded) notes.push(`unsupported claim shown (${v?.kinds?.join(",") || "flag"})`);
  if (v?.stripped) notes.push(`claim check removed ${v.stripped} invented detail(s)`);
  checks.noToolLog = !TOOL_LOG.test(dom.chatText);
  if (!checks.noToolLog) notes.push("tool log / raw tool call visible");
  const budget = turn.maxSeconds || DEFAULT_BUDGET[turn.kind];
  checks.latency = cold || seconds <= budget;
  if (!checks.latency) notes.push(`slow: ${seconds}s > ${budget}s`);
  checks.layout = dom.noHorizontalScroll && dom.composerVisible && dom.lastVisible && dom.noOverflowingBubbles;
  if (!checks.layout) notes.push(`layout: ${Object.entries(dom).filter(([k, val]) => k !== "chatText" && !val).map(([k]) => k).join(", ")}`);
  const pass = Object.values(checks).every(Boolean);
  return { pass, checks, notes };
}

/** QA_REGRADE=<results.json>: re-apply the text checks (facts, forbid, anchor, not-found) with the current case file. */
function regrade(file: string) {
  const cases = JSON.parse(readFileSync(CASES, "utf8")) as PersonaFile;
  const data = JSON.parse(readFileSync(file, "utf8")) as { summary: Record<string, unknown>; results: TurnResult[] };
  for (const r of data.results) {
    const turn = cases.scenarios.find((sc) => sc.id === r.scenario)?.turns[r.turn - 1];
    if (!turn || r.kind === "setup") continue;
    const all = `${r.text}\n${r.draft ? `${r.draft.subject || ""}\n${r.draft.body || ""}` : ""}`;
    const keep = r.notes.filter((n) => !/^(missing:|said:|lost the thread|did not say it found nothing)/.test(n));
    const facts = turn.facts || [];
    const miss = facts.filter((f) => !rx(f).test(all));
    r.checks.facts = miss.length === 0;
    if (miss.length) keep.push(`missing: ${miss.join(" | ")}`);
    const bad = (turn.forbid || []).filter((f) => rx(f).test(all));
    r.checks.noForbidden = bad.length === 0;
    if (bad.length) keep.push(`said: ${bad.join(" | ")}`);
    if (turn.anchor) {
      r.checks.anchored = rx(turn.anchor).test(all);
      if (!r.checks.anchored) keep.push(`lost the thread (no /${turn.anchor}/)`);
    }
    if (turn.kind === "notfound") {
      r.checks.honestNotFound = NOT_FOUND.test(r.text);
      if (!r.checks.honestNotFound) keep.push("did not say it found nothing");
    }
    r.notes = keep;
    r.pass = Object.values(r.checks).every(Boolean);
  }
  const turns = data.results.filter((r) => r.kind !== "setup");
  const passed = turns.filter((r) => r.pass).length;
  const out = file.replace(/\.json$/, ".regraded.json");
  writeFileSync(out, JSON.stringify({ summary: { ...data.summary, passed, passRate: Math.round((passed / Math.max(1, turns.length)) * 1000) / 10, regraded: new Date().toISOString() }, results: data.results }, null, 2));
  console.log(`${passed}/${turns.length} passed after regrade → ${out}`);
}

async function main() {
  if (process.env.QA_REGRADE) return regrade(process.env.QA_REGRADE);
  if (!BASE || !CODE) throw new Error("Set QA_BASE_URL and QA_CODE (and QA_CASES for real asks).");
  const file = JSON.parse(readFileSync(CASES, "utf8")) as PersonaFile;
  const scenarios = file.scenarios.filter((s) => !ONLY || ONLY.includes(s.id));
  mkdirSync(OUT, { recursive: true });
  const browserType = process.env.QA_BROWSER === "webkit" ? webkit : chromium;
  const browser: Browser = await browserType.launch();
  const results: TurnResult[] = [];
  let first = true;
  const startedAt = new Date();
  for (const vpName of VIEWPORTS) {
    const vp = VIEWPORT[vpName as keyof typeof VIEWPORT];
    if (!vp) continue;
    for (const scenario of scenarios) {
      // Fresh context = fresh client thread, so scenarios never bleed into each other.
      const context = await browser.newContext({ ...vp, serviceWorkers: "block", extraHTTPHeaders: PROFILE ? { "x-hatch-qa-profile": PROFILE } : undefined });
      const page = await context.newPage();
      try {
        await signIn(page);
      } catch (err) {
        results.push({ scenario: scenario.id, turn: 0, viewport: vpName, ask: "(sign in)", kind: "setup", seconds: 0, cold: false, pass: false, checks: { signIn: false }, notes: [String(err).slice(0, 200)], text: "", sources: [] });
        await context.close();
        continue;
      }
      for (const [i, turn] of scenario.turns.entries()) {
        const { done, seconds, sawWarm } = await askAndWait(page, turn.ask, first ? 420_000 : 240_000);
        const cold = first || sawWarm;
        first = false;
        const dom = await layoutChecks(page);
        const draftShown = await page.locator(".turn").last().locator(".email-draft-card").isVisible().catch(() => false);
        const g = grade(turn, done, seconds, cold, dom, draftShown);
        const r: TurnResult = {
          scenario: scenario.id, turn: i + 1, viewport: vpName, ask: turn.ask, kind: turn.kind, seconds, cold, ...g,
          text: done?.text || "", draft: done?.emailDraft, sources: (done?.sources || []).map((s) => s.file || s.room || "").filter(Boolean), verification: done?.verification,
        };
        results.push(r);
        console.log(`${r.pass ? "PASS" : "FAIL"} ${vpName.padEnd(7)} ${scenario.id}#${i + 1} ${seconds}s${cold ? " (cold)" : ""} ${r.notes.join("; ")}`);
        if (g.pass === false && !done) break; // no reply: later turns in this thread are meaningless
      }
      await context.close();
    }
  }
  await browser.close();
  const turns = results.filter((r) => r.kind !== "setup");
  const passed = turns.filter((r) => r.pass).length;
  const rate = turns.length ? passed / turns.length : 0;
  const warm = turns.filter((r) => !r.cold).map((r) => r.seconds).sort((a, b) => a - b);
  const pct = (p: number) => (warm.length ? warm[Math.min(warm.length - 1, Math.floor(p * warm.length))] : 0);
  const checkNames = [...new Set(turns.flatMap((r) => Object.keys(r.checks)))];
  const checkRates = checkNames.map((k) => {
    const rel = turns.filter((r) => k in r.checks);
    return `${k} ${rel.filter((r) => r.checks[k]).length}/${rel.length}`;
  });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const summary = {
    label: LABEL, profile: PROFILE, base: BASE.replace(/https?:\/\//, ""), at: startedAt.toISOString(), viewports: VIEWPORTS,
    turns: turns.length, passed, passRate: Math.round(rate * 1000) / 10, p50: pct(0.5), p90: pct(0.9), checks: checkRates,
  };
  writeFileSync(path.join(OUT, `persona-${stamp}.json`), JSON.stringify({ summary, results }, null, 2));
  const lines = [
    `# Hatch persona QA ${LABEL ? `— ${LABEL} ` : ""}(${startedAt.toISOString()})`,
    "",
    `${passed}/${turns.length} turns passed (${summary.passRate}%). Warm latency p50 ${summary.p50}s, p90 ${summary.p90}s.`,
    "",
    `Checks: ${checkRates.join(" · ")}`,
    "",
    "| viewport | scenario | turn | kind | s | result | notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((r) => `| ${r.viewport} | ${r.scenario} | ${r.turn} | ${r.kind} | ${r.seconds}${r.cold ? "*" : ""} | ${r.pass ? "pass" : "FAIL"} | ${r.notes.join("; ").replace(/\|/g, "/")} |`),
    "",
    "`*` = cold start (latency not graded).",
  ];
  if (process.env.QA_REPORT_TEXT === "1") for (const r of results) lines.push("", `### ${r.viewport} ${r.scenario}#${r.turn}: ${r.ask}`, "", r.text || "(draft)", r.draft ? `\n> To: ${r.draft.to}\n> Subject: ${r.draft.subject}\n>\n> ${(r.draft.body || "").replace(/\n/g, "\n> ")}` : "");
  writeFileSync(path.join(OUT, `persona-${stamp}.md`), lines.join("\n"));
  console.log(`\n${passed}/${turns.length} passed (${summary.passRate}%) · p50 ${summary.p50}s p90 ${summary.p90}s\n${checkRates.join(" · ")}\nReport: ${path.join(OUT, `persona-${stamp}.md`)}`);
  if (rate < MIN_PASS) process.exitCode = 1;
}

await main();
