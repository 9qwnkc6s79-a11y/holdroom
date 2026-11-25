import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  assertHasTokens,
  checkoutConfigured,
  creditTokens,
  deductUsage,
  freeTokenGrant,
  getBalance,
  isMeteredCode,
  isUnlimitedCode,
  listAccounts,
  OUT_OF_TOKENS_TEXT,
  testStripeSecret,
  topupTokens,
} from "./tokens.ts";
import { creditFromCheckoutSession } from "./stripe-tokens.ts";

const keys = [
  "HATCH_TESTER_CODES",
  "HATCH_FREE_TOKEN_GRANT",
  "HATCH_TOPUP_TOKENS",
  "HATCH_UNLIMITED_CODES",
  "HATCH_BETA_DIR",
  "BLOB_READ_WRITE_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
] as const;

const prior: Record<string, string | undefined> = {};
let dir = "";

describe("tester token balances", { concurrency: 1 }, () => {
  beforeEach(() => {
    for (const key of keys) prior[key] = process.env[key];
    dir = mkdtempSync(path.join(tmpdir(), "hatch-tokens-"));
    process.env.HATCH_BETA_DIR = dir;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.HATCH_TESTER_CODES = "HATCH-AH7G:Daniel,HATCH-TEST:Guest";
    delete process.env.HATCH_FREE_TOKEN_GRANT;
    delete process.env.HATCH_TOPUP_TOKENS;
    delete process.env.HATCH_UNLIMITED_CODES;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
  });

  afterEach(() => {
    for (const key of keys) {
      if (prior[key] == null) delete process.env[key];
      else process.env[key] = prior[key];
    }
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("leaves the free grant and pack size unset until they are configured", () => {
    assert.equal(freeTokenGrant(), null);
    assert.equal(topupTokens(), null);
    process.env.HATCH_FREE_TOKEN_GRANT = "25000";
    process.env.HATCH_TOPUP_TOKENS = "10000";
    assert.equal(freeTokenGrant(), 25000);
    assert.equal(topupTokens(), 10000);
  });

  it("treats Daniel's code as unlimited and other known testers as metered", () => {
    assert.equal(isUnlimitedCode("hatch-ah7g"), true);
    assert.equal(isMeteredCode("HATCH-AH7G"), false);
    assert.equal(isMeteredCode("HATCH-TEST"), true);
    assert.equal(isMeteredCode("staff"), false);
  });

  it("does not invent a starting balance when the grant env is unset", async () => {
    const view = await getBalance("HATCH-TEST");
    assert.equal(view.balance, 0);
    assert.equal(view.grantConfigured, false);
    assert.match(view.message, /starting grant has not been set/i);
    const gate = await assertHasTokens("HATCH-TEST");
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.text, OUT_OF_TOKENS_TEXT);
  });

  it("applies a configured free grant once and deducts prompt plus completion tokens", async () => {
    process.env.HATCH_FREE_TOKEN_GRANT = "100";
    const opened = await getBalance("HATCH-TEST");
    assert.equal(opened.balance, 100);
    const after = await deductUsage("HATCH-TEST", { promptTokens: 40, completionTokens: 10, totalTokens: 50 }, "ask");
    assert.equal(after?.balance, 50);
    assert.equal(after?.lifetimeUsed, 50);
    const again = await getBalance("HATCH-TEST");
    assert.equal(again.balance, 50);
  });

  it("blocks a metered code at zero and leaves Daniel's code open", async () => {
    process.env.HATCH_FREE_TOKEN_GRANT = "10";
    await deductUsage("HATCH-TEST", { promptTokens: 10, completionTokens: 0, totalTokens: 10 }, "agent");
    const empty = await assertHasTokens("HATCH-TEST");
    assert.equal(empty.ok, false);
    const owner = await assertHasTokens("HATCH-AH7G");
    assert.equal(owner.ok, true);
    const staff = await assertHasTokens("staff");
    assert.equal(staff.ok, true);
  });

  it("credits a top-up once for the same Stripe session id", async () => {
    const first = await creditTokens("HATCH-TEST", 80, { kind: "topup", id: "stripe-cs_test_1" });
    assert.equal(first.ok, true);
    assert.equal(first.applied, true);
    assert.equal(first.account?.balance, 80);
    const second = await creditTokens("HATCH-TEST", 80, { kind: "topup", id: "stripe-cs_test_1" });
    assert.equal(second.applied, false);
    assert.equal(second.account?.balance, 80);
    const accounts = await listAccounts();
    assert.equal(accounts.some((account) => account.code === "HATCH-TEST" && account.lifetimePurchased === 80), true);
  });

  it("only uses Stripe test secrets and requires a price plus pack size for checkout", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_not_allowed";
    assert.equal(testStripeSecret(), null);
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRICE_ID = "price_test";
    process.env.HATCH_TOPUP_TOKENS = "5000";
    assert.equal(testStripeSecret(), "sk_test_123");
    assert.equal(checkoutConfigured(), true);
  });

  it("credits a paid Checkout session and ignores unpaid ones", () => {
    process.env.HATCH_TOPUP_TOKENS = "5000";
    const paid = creditFromCheckoutSession({
      id: "cs_test_paid",
      payment_status: "paid",
      metadata: { testerCode: "HATCH-TEST", topupTokens: "5000" },
    });
    assert.equal(paid.ok, true);
    if (paid.ok) {
      assert.equal(paid.code, "HATCH-TEST");
      assert.equal(paid.amount, 5000);
      assert.equal(paid.id, "stripe-cs_test_paid");
    }
    const unpaid = creditFromCheckoutSession({
      id: "cs_test_open",
      payment_status: "unpaid",
      metadata: { testerCode: "HATCH-TEST", topupTokens: "5000" },
    });
    assert.equal(unpaid.ok, false);
  });
});
