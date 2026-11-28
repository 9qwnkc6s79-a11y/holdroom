import { test } from "node:test";
import assert from "node:assert/strict";
import { anyNeedsReconnect, needsReconnect, reconnectCta, reconnectReason } from "./reconnect.ts";

test("needsReconnect is true only when status is present and not ok", () => {
  assert.equal(needsReconnect({}), false);
  assert.equal(needsReconnect({ status: "ok" }), false);
  assert.equal(needsReconnect({ status: "missing_scope", missing: ["save drafts"] }), true);
  assert.equal(needsReconnect({ status: "expired" }), true);
  assert.equal(needsReconnect({ status: "unreadable" }), true);
  assert.equal(anyNeedsReconnect([{ status: "ok" }, { status: "expired" }]), true);
  assert.equal(anyNeedsReconnect([{ status: "ok" }]), false);
});

test("reconnectReason matches the web copy", () => {
  assert.equal(
    reconnectReason({ status: "missing_scope", missing: ["save drafts", "send email"] }),
    "Reconnect to let Hatch save drafts and send email. Tap Reconnect and allow every permission Google asks for.",
  );
  assert.equal(reconnectReason({ status: "missing_scope" }), "Reconnect to let Hatch finish setup. Tap Reconnect and allow every permission Google asks for.");
  assert.equal(reconnectReason({ status: "expired" }), "This connection expired. Tap Reconnect to sign in again.");
  assert.equal(reconnectReason({ status: "unreadable" }), "This connection could not be read. Tap Reconnect to sign in again.");
  assert.equal(reconnectReason({ status: "ok" }), "");
});

test("reconnect CTA names Google and Microsoft the way the web does", () => {
  assert.equal(reconnectCta("google", "Gmail"), "Reconnect Google");
  assert.equal(reconnectCta("microsoft", "Outlook"), "Reconnect Microsoft");
  assert.equal(reconnectCta("slack", "Slack"), "Reconnect Slack");
});
