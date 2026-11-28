import assert from "node:assert/strict";
import test from "node:test";
import { buildSettingsBlock, comingDaysLine, formatNowForPrompt, todayIsoInZone } from "./user-context.ts";
import { sourcesUsedInAnswer } from "./citations.ts";
import { analyzeIntent } from "./intent.ts";
import { buildRequest, initHarness } from "./engine.ts";
import type { Evidence } from "./context.ts";

const google = new Set(["google"]);

const christmasMail: Evidence = {
  id: "m1",
  source: "mail",
  title: "Updated invitation: Christmas party",
  url: "https://mail.google.com/mail/?authuser=a@b.com#all/xmas",
  text: "You are invited to the Christmas party on December 18 at the warehouse.",
  score: 0.8,
  date: "2026-11-20",
};
const daExec: Evidence = {
  id: "m2",
  source: "mail",
  title: "DA Executive briefing",
  text: "The DA Executive board meets Thursday.",
  score: 0.7,
};
const monthFile: Evidence = {
  id: "f1",
  source: "files",
  title: "Boundaries Oct 2026 Month in Review",
  text: "October sales were $48,200 across Little Elm and Prosper.",
  score: 0.6,
};
const tacos: Evidence = {
  id: "m3",
  source: "mail",
  title: "Tacos y Rocky invoice #1922",
  url: "https://mail.google.com/mail/?authuser=a@b.com#all/1922",
  text: "Invoice #1922 for the Prosper store. Total $192.00.",
  score: 0.95,
};

test("settings asks stay chat and do not search mail or files", () => {
  for (const q of ["I updated your settings", "what are my settings?", "which model am I using?", "what does Model & Ethics say?"]) {
    const intent = analyzeIntent(q, { connected: google });
    assert.equal(intent.kind, "chat", q);
    assert.equal(intent.needsTools, false, q);
  }
});

test("work asks still search when settings is not the topic", () => {
  const intent = analyzeIntent("did we ever hear back from the town", { connected: google });
  assert.equal(intent.needsTools, true);
});

test("settings block names model, ethics, app status, routines, and how to change them", () => {
  const block = buildSettingsBlock({
    model: "hermes",
    ethicsPreset: "executive",
    tone: "concise",
    posture: "direct",
    length: "short",
    connectors: [
      { kind: "google", label: "Google", status: "ok" },
      { kind: "google", label: "Gmail", status: "missing_scope", missing: ["mail.send"] },
    ],
    routines: [
      { name: "Morning brief", schedule: "Weekdays at 7:00 AM CT", enabled: true },
      { name: "Invoice watch", schedule: "", enabled: false, trigger: { query: "invoice" } },
    ],
  });
  assert.match(block, /Model: Hermes/);
  assert.match(block, /preset executive/);
  assert.match(block, /voice concise/);
  assert.match(block, /Google \(connected\)/);
  assert.match(block, /Gmail \(needs reconnect — missing mail\.send\)/);
  assert.match(block, /Morning brief \(Weekdays at 7:00 AM CT\)/);
  assert.match(block, /Invoice watch \(when email matches “invoice”\) — paused/);
  assert.match(block, /Settings in Hatch/);
  assert.match(block, /Do not say you cannot see their settings/);
  assert.ok(!/cannot change them yourself[\s\S]*cannot see/.test("ok"));
});

test("empty settings still tell the model how to describe and how the person changes them", () => {
  const block = buildSettingsBlock({ model: "qwen" });
  assert.match(block, /Qwen for drafting/);
  assert.match(block, /none connected yet/);
  assert.match(block, /none saved/);
  assert.match(block, /Model & Ethics/);
});

test("the system prompt on every path includes the current clock, timezone, and settings", () => {
  const today = formatNowForPrompt(new Date("2026-11-27T21:54:00-06:00"), "America/Chicago");
  const coming = comingDaysLine(new Date("2026-11-27T21:54:00-06:00"), "America/Chicago");
  const settingsBlock = buildSettingsBlock({ model: "hermes", ethicsPreset: "neutral", connectors: [{ label: "Google", status: "ok" }] });
  const chat = initHarness({
    query: "I updated your settings",
    connected: ["google"],
    today,
    todayIso: "2026-11-27",
    ethics: "Firm charter: Be a good partner.",
    settingsBlock,
    comingDays: coming,
  });
  const sys = buildRequest(chat, "ask", true).messages[0].content;
  assert.match(sys, /Current date and time: Friday, November 27, 2026, 9:54 PM, America\/Chicago \(CT\)/);
  assert.match(sys, /It is 2026; dates in 2026 are not in the future/);
  assert.match(sys, /Coming days: Sat Nov 28/);
  assert.match(sys, /The person's current Hatch settings/);
  assert.match(sys, /Model: Hermes/);
  assert.match(sys, /Google \(connected\)/);
  assert.match(sys, /Do not say you cannot see their settings/);
});

test("formatNowForPrompt and coming days use the user's zone, not UTC", () => {
  // 11:30 PM Friday CT is already Saturday UTC.
  const late = new Date("2026-11-27T23:30:00-06:00");
  const line = formatNowForPrompt(late, "America/Chicago");
  assert.match(line, /Friday, November 27, 2026, 11:30 PM, America\/Chicago \(CT\)/);
  assert.ok(!/Saturday, November 28/.test(line));
  assert.equal(todayIsoInZone(late, "America/Chicago"), "2026-11-27");
  const coming = comingDaysLine(late, "America/Chicago", 3);
  assert.match(coming, /Coming days: Sat Nov 28; Sun Nov 29; Mon Nov 30/);
  const defaulted = formatNowForPrompt(late);
  assert.match(defaulted, /America\/Chicago \(CT\)/);
});

test("source chips only include evidence the answer actually used", () => {
  const unused = [christmasMail, daExec, monthFile, tacos];
  assert.deepEqual(sourcesUsedInAnswer("I don't have access to your settings or the ability to update them.", unused), []);
  assert.deepEqual(sourcesUsedInAnswer("I don't have access to your settings.", unused).map((s) => s.file), []);

  const cited = sourcesUsedInAnswer(
    "Invoice #1922 is for the [Tacos y Rocky invoice #1922](https://mail.google.com/mail/?authuser=a@b.com#all/1922) Prosper store.",
    unused,
  );
  assert.deepEqual(cited.map((s) => s.file), ["Tacos y Rocky invoice #1922"]);
  assert.equal(cited[0].room, "Email");
  assert.equal(cited[0].url, tacos.url);

  const titled = sourcesUsedInAnswer("The Tacos y Rocky invoice #1922 is from the Prosper store, total $192.00.", unused);
  assert.deepEqual(titled.map((s) => s.file), ["Tacos y Rocky invoice #1922"]);

  const quoted = sourcesUsedInAnswer('The email says "Christmas party on December 18 at the warehouse."', [christmasMail, monthFile]);
  assert.deepEqual(quoted.map((s) => s.file), ["Updated invitation: Christmas party"]);
});
