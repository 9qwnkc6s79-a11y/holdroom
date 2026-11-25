import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  assertHasCredit,
  centsForTokens,
  checkoutConfigured,
  creditCents,
  deductUsage,
  freeCreditCents,
  getBalance,
  isMeteredCode,
  isUnlimitedCode,
  listAccounts,
  OUT_OF_CREDIT_TEXT,
  parseDollarsToCents,
  pricePerMTokUsd,
  testStripeSecret,
} from "./tokens.ts";
import { creditFromCheckoutSession, validateTopupCents } from "./stripe-tokens.ts";
import { MAX_TOPUP_CENTS, MIN_TOPUP_CENTS } from "./token-types.ts";

const keys = [
  "HATCH_TESTER_CODES",
  "HATCH_FREE_CREDIT_USD",
  "HATCH_PRICE_PER_MTOK_USD",
  "HATCH_UNLIMITED_CODES",
  "HATCH_BETA_DIR",
  "BLOB_READ_WRITE_TOKEN",
  "STRIPE_SECRET_KEY",
] as const;

const prior: Record<string, string | undefined> = {};
let dir = "";

describe("tester credit balances", { concurrency: 1 }, () => {
  beforeEach(() => {
    for (const key of keys) prior[key] = process.env[key];
    dir = mkdtempSync(path.join(tmpdir(), "hatch-tokens-"));
    process.env.HATCH_BETA_DIR = dir;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.HATCH_TESTER_CODES = "HATCH-AH7G:Daniel,HATCH-TEST:Guest";
    delete process.env.HATCH_FREE_CREDIT_USD;
    delete process.env.HATCH_PRICE_PER_MTOK_USD;
    delete process.env.HATCH_UNLIMITED_CODES;
    delete process.env.STRIPE_SECRET_KEY;
  });

  afterEach(() => {
    for (const key of keys) {
      if (prior[key] == null) delete process.env[key];
      else process.env[key] = prior[key];
    }
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("leaves the free credit and per-token rate unset until they are configured", () => {
    assert.equal(freeCreditCents(), null);
    assert.equal(pricePerMTokUsd(), null);
    assert.equal(centsForTokens(1_000_000), 0);
    process.env.HATCH_FREE_CREDIT_USD = "100";
    process.env.HATCH_PRICE_PER_MTOK_USD = "25";
    assert.equal(freeCreditCents(), 10_000);
    assert.equal(pricePerMTokUsd(), 25);
    assert.equal(centsForTokens(1_000_000), 2500);
    assert.equal(centsForTokens(40_000), 100);
    assert.equal(centsForTokens(1), 1);
  });

  it("parses dollar amounts into cents and rejects invalid top-ups", () => {
    assert.equal(parseDollarsToCents("10"), 1000);
    assert.equal(parseDollarsToCents("$10.50"), 1050);
    assert.equal(parseDollarsToCents(" 20.00 "), 2000);
    assert.equal(parseDollarsToCents("nope"), null);
    assert.equal(validateTopupCents(MIN_TOPUP_CENTS).ok, true);
    assert.equal(validateTopupCents(MIN_TOPUP_CENTS - 1).ok, false);
    assert.equal(validateTopupCents(MAX_TOPUP_CENTS + 1).ok, false);
  });

  it("treats Daniel's code as unlimited and other known testers as metered", () => {
    assert.equal(isUnlimitedCode("hatch-ah7g"), true);
    assert.equal(isMeteredCode("HATCH-AH7G"), false);
    assert.equal(isMeteredCode("HATCH-TEST"), true);
    assert.equal(isMeteredCode("staff"), false);
  });

  it("does not invent a starting balance when the free credit env is unset", async () => {
    const view = await getBalance("HATCH-TEST");
    assert.equal(view.balanceCents, 0);
    assert.equal(view.grantConfigured, false);
    const gate = await assertHasCredit("HATCH-TEST");
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.text, OUT_OF_CREDIT_TEXT);
  });

  it("applies a configured free credit once and does not deduct dollars when the rate is unset", async () => {
    process.env.HATCH_FREE_CREDIT_USD = "100";
    const opened = await getBalance("HATCH-TEST");
    assert.equal(opened.balanceCents, 10_000);
    assert.equal(opened.rateConfigured, false);
    const after = await deductUsage("HATCH-TEST", { promptTokens: 40, completionTokens: 10, totalTokens: 50 }, "ask");
    assert.equal(after?.balanceCents, 10_000);
    assert.equal(after?.lifetimeUsedTokens, 50);
    assert.equal(after?.lifetimeUsedCents, 0);
    const again = await getBalance("HATCH-TEST");
    assert.equal(again.balanceCents, 10_000);
  });

  it("deducts cents from credit only after a per-token rate is set", async () => {
    process.env.HATCH_FREE_CREDIT_USD = "100";
    process.env.HATCH_PRICE_PER_MTOK_USD = "25";
    await getBalance("HATCH-TEST");
    const after = await deductUsage("HATCH-TEST", { promptTokens: 0, completionTokens: 40_000, totalTokens: 40_000 }, "agent");
    assert.equal(after?.lifetimeUsedTokens, 40_000);
    assert.equal(after?.lifetimeUsedCents, 100);
    assert.equal(after?.balanceCents, 9900);
  });

  it("blocks a metered code at zero credit and leaves Daniel's code open", async () => {
    process.env.HATCH_FREE_CREDIT_USD = "1";
    process.env.HATCH_PRICE_PER_MTOK_USD = "25";
    await deductUsage("HATCH-TEST", { promptTokens: 0, completionTokens: 40_000, totalTokens: 40_000 }, "agent");
    const empty = await assertHasCredit("HATCH-TEST");
    assert.equal(empty.ok, false);
    const owner = await assertHasCredit("HATCH-AH7G");
    assert.equal(owner.ok, true);
    const staff = await assertHasCredit("staff");
    assert.equal(staff.ok, true);
  });

  it("credits a purchase once for the same Stripe session id", async () => {
    const first = await creditCents("HATCH-TEST", 2000, { kind: "purchase", id: "stripe-cs_test_1" });
    assert.equal(first.ok, true);
    assert.equal(first.applied, true);
    assert.equal(first.account?.balanceCents, 2000);
    const second = await creditCents("HATCH-TEST", 2000, { kind: "purchase", id: "stripe-cs_test_1" });
    assert.equal(second.applied, false);
    assert.equal(second.account?.balanceCents, 2000);
    const accounts = await listAccounts();
    assert.equal(accounts.some((account) => account.code === "HATCH-TEST" && account.lifetimePurchasedCents === 2000), true);
  });

  it("only uses Stripe test secrets and treats a test key as enough to open checkout", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_not_allowed";
    assert.throws(() => testStripeSecret(), /Live Stripe keys are refused/);
    assert.equal(checkoutConfigured(), false);
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    assert.equal(testStripeSecret(), "sk_test_123");
    assert.equal(checkoutConfigured(), true);
  });

  it("credits a paid Checkout session from amount_total and ignores unpaid ones", () => {
    const paid = creditFromCheckoutSession({
      id: "cs_test_paid",
      payment_status: "paid",
      amount_total: 2500,
      metadata: { testerCode: "HATCH-TEST", amountCents: "2500" },
    });
    assert.equal(paid.ok, true);
    if (paid.ok) {
      assert.equal(paid.code, "HATCH-TEST");
      assert.equal(paid.cents, 2500);
      assert.equal(paid.id, "stripe-cs_test_paid");
    }
    const unpaid = creditFromCheckoutSession({
      id: "cs_test_open",
      payment_status: "unpaid",
      amount_total: 2500,
      metadata: { testerCode: "HATCH-TEST", amountCents: "2500" },
    });
    assert.equal(unpaid.ok, false);
  });
});
