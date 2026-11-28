import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCorpus, extractClaims, verifyAnswer } from "./verify.ts";
import { parseToolCalls } from "../tool-parse.ts";

const EVIDENCE = [
  "Subject: Quote For Monument Sign-Little Elm\nFrom: Robert Hyman\nDate: Nov 24, 2026\nYour cost for the monument sign installed with permit labor, permit fee, engineering is $21,695.00. With tax, final price is $23,484.84. I'll see you tomorrow at 10:30 at Little Elm. Permit SP-26-0412.",
];
const corpus = () => buildCorpus({ evidence: EVIDENCE, query: "where are we on the sign", today: "Friday, November 27, 2026", todayIso: "2026-11-27" });

test("supported amounts, dates, times, ids and quotes pass untouched", () => {
  const answer = "Bottom line: Robert quoted $21,695 installed ($23,484.84 with tax) on Nov 24.\n- You met at 10:30 at Little Elm.\n- Permit SP-26-0412.\n- He wrote \"final price is $23,484.84\".";
  const r = verifyAnswer(answer, corpus());
  assert.equal(r.unsupported.length, 0, JSON.stringify(r.unsupported));
  assert.equal(r.text, answer);
});

test("invented bullet amounts are stripped with a note", () => {
  const r = verifyAnswer("Bottom line: Quote is in.\n- Total: $21,695.\n- Deposit: $9,625 due Dec 3.\n- Next: drawing.", corpus());
  assert.equal(r.stripped, 1);
  assert.doesNotMatch(r.text, /9,625/);
  assert.match(r.text, /left out 1 detail/);
});

test("invented quote in the lead line is flagged inline", () => {
  const r = verifyAnswer('Robert said "the permit is approved" yesterday.', corpus());
  assert.equal(r.flagged, 1);
  assert.match(r.text, /approved" \(not in your sources\)/);
});

test("drafts lose invented attachments and meetings", () => {
  const body = "Hi Robert,\nThanks for the quote. I've attached the site plan. See you at our meeting tomorrow. Proceed with the drawing.\nDaniel";
  const r = verifyAnswer(body, corpus(), { draft: true });
  assert.doesNotMatch(r.text, /attached|tomorrow/);
  assert.match(r.text, /Proceed with the drawing/);
});

test("today/tomorrow dates and small counts are allowed", () => {
  const claims = extractClaims("I checked 3 threads; nothing new since Nov 26 (yesterday).");
  const r = verifyAnswer("I checked 3 threads; nothing new since Nov 26 (yesterday).", corpus());
  assert.equal(claims.filter((c) => c.kind === "number").length, 0);
  assert.equal(r.unsupported.length, 0);
});

test("URLs inside markdown links are not checked", () => {
  const r = verifyAnswer("See [Quote For Monument Sign-Little Elm](https://mail.google.com/mail/u/0/#all/1a20de84a50e3ce0).", corpus());
  assert.equal(r.unsupported.length, 0);
});

test("qwen3_coder XML tool calls parse", () => {
  const calls = parseToolCalls("<tool_call>\n<function=email_search>\n<parameter=query>\nmonument sign\n</parameter>\n</function>\n</tool_call>");
  assert.deepEqual(calls, [{ name: "email_search", arguments: { query: "monument sign" } }]);
});

test("vLLM native tool_calls output parses into structured calls", async () => {
  const { parseRunpodChatOutput, outputErrorOf } = await import("../runpod-jobs.ts");
  const out = [{ choices: [{ finish_reason: "tool_calls", message: { content: null, role: "assistant", tool_calls: [{ id: "chatcmpl-tool-1", type: "function", function: { name: "email_search", arguments: "{\"query\": \"from:rick sign quote\"}" } }] } }] }];
  const parsed = parseRunpodChatOutput(out);
  assert.deepEqual(parsed.toolCalls, [{ name: "email_search", arguments: { query: "from:rick sign quote" } }]);
  assert.equal(outputErrorOf({ object: "error", message: "\"auto\" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set" }), "\"auto\" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set");
  const { isNativeToolRefusal } = await import("./live.ts").catch(() => ({ isNativeToolRefusal: (e: string) => /auto.?tool.?choice/i.test(e) }));
  assert.ok(isNativeToolRefusal("\"auto\" tool choice requires --enable-auto-tool-choice"));
});
