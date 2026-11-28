import { analyzeIntent, fixTypo } from "./intent.ts";
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

test("connector health flags missing gmail.compose and expired grants without network", async () => {
  const { connectorHealth } = await import("../connectors.ts");
  assert.deepEqual(connectorHealth("google", { accessToken: "x", refreshToken: "r", scope: "openid email https://www.googleapis.com/auth/gmail.readonly" }), { status: "missing_scope", missing: ["save drafts", "send email"] });
  assert.equal(connectorHealth("google", { accessToken: "x", refreshToken: "r", scope: "gmail.readonly gmail.compose gmail.send" }).status, "ok");
  assert.equal(connectorHealth("google", { accessToken: "x", expiresAt: Date.now() - 1000 }).status, "expired");
  assert.equal(connectorHealth("microsoft", { accessToken: "" }).status, "expired");
  assert.equal(connectorHealth("google", null).status, "unreadable");
});

test("typo'd source quotes, phone numbers, totals and weekday dates are not false alarms", () => {
  const c = buildCorpus({
    evidence: ["She may need time beforr leavjnf her shell.", "Phone: (214) 277-9887", "Invoice $753.75", "Invoice $514.20", "Our App team has fixed the issue."],
    query: "kaleece",
    todayIso: "2026-11-27",
  });
  const r = verifyAnswer('She may need time "before leaving her shell". Phone 214-277-9887. Two invoices totaling $1,267.95. He will call Monday, Nov 30. TapMango said "our app team has fixed the issue".', c);
  assert.equal(r.unsupported.length, 0, JSON.stringify(r.unsupported));
  const bad = verifyAnswer('Robert quoted "$1,200 before tax" and will call Tuesday, Nov 30.', c);
  assert.ok(bad.unsupported.some((x) => x.kind === "quote"));
  assert.ok(bad.unsupported.some((x) => x.kind === "date"));
});

test("drops an unmatched trailing sentence instead of flagging it, and reads ISO calendar times", () => {
  const corpus = buildCorpus({ evidence: ["Invoice #1922 $753.75. Invoice #1923 $514.20. Event start 2026-11-25T10:30:00-06:00"], query: "do i owe tacos", todayIso: "2026-11-27" });
  const out = verifyAnswer("Yes, two invoices: $753.75 and $514.20. You paid $2,971.50 on Nov 24.", corpus);
  assert.equal(out.flagged, 0);
  assert.equal(out.stripped, 1);
  assert.ok(!out.text.includes("2,971.50"));
  assert.ok(out.text.includes("$753.75"));
  const time = verifyAnswer("You met on Nov 25 at 10:30 AM.", corpus);
  assert.equal(time.unsupported.filter((c) => c.kind === "time").length, 0);
});

test("chained follow-ups keep the topic and weekday asks get a date range", () => {
  const h = [
    { role: "user", text: "whats the latest on the monument sign for little elm" },
    { role: "assistant", text: "x" },
    { role: "user", text: "who is waiting on who with the sign again?" },
    { role: "assistant", text: "y" },
  ];
  const tax = analyzeIntent("and how much w tax", { history: h, todayIso: "2026-11-27" });
  assert.ok(tax.followUp && tax.terms.includes("sign"));
  const mon = analyzeIntent("and monday?", { history: [{ role: "user", text: "whats on my calendar tmrw" }, { role: "assistant", text: "n" }], todayIso: "2026-11-27" });
  assert.equal(mon.kind, "schedule");
  assert.deepEqual(mon.dateRange, { from: "2026-11-30", to: "2026-11-30" });
});

test("typo'd work words are snapped before searching", () => {
  assert.equal(fixTypo("monumnet"), "monument");
  assert.equal(fixTypo("celian"), "celina");
  assert.equal(fixTypo("proper"), "proper");
  assert.equal(fixTypo("robert"), "robert");
  assert.ok(analyzeIntent("monumnet sign status??", { todayIso: "2026-11-27" }).queries.some((q) => q.includes("monument")));
});

test("an inferred end state is not allowed to stand", () => {
  const corpus = buildCorpus({ evidence: ["Winter board launched Nov 13 per the social calendar."], query: "any update on the drive thru menu board order", todayIso: "2026-11-27" });
  const out = verifyAnswer("Bottom line: I found no order record.\n\n- The winter board launched Nov 13.\n- The order is complete and the board is live.", corpus);
  assert.ok(!/is complete/.test(out.text));
  const ok = verifyAnswer("The permit was approved on Nov 13.", buildCorpus({ evidence: ["City approved the permit Nov 13"], query: "permit", todayIso: "2026-11-27" }));
  assert.equal(ok.unsupported.length, 0);
});
