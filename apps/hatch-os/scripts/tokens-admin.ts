#!/usr/bin/env node
/**
 * List tester token balances, or grant tokens by hand.
 *
 *   node --experimental-strip-types scripts/tokens-admin.ts list
 *   node --experimental-strip-types scripts/tokens-admin.ts grant HATCH-XXXX 10000 "reason"
 *
 * Needs the same env as the app: HATCH_TESTER_CODES, and BLOB_READ_WRITE_TOKEN
 * (or HATCH_BETA_DIR for a local folder). Never pass Stripe or blob secrets on the command line.
 */
import { creditTokens, listAccounts } from "../src/lib/tokens.ts";

async function main() {
  const [command, code, amountRaw, ...noteParts] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    console.log(`Usage:
  tokens-admin list
  tokens-admin grant <CODE> <AMOUNT> [note]`);
    process.exit(command ? 0 : 1);
  }
  if (command === "list") {
    const accounts = await listAccounts();
    if (!accounts.length) {
      console.log("No tester codes or token accounts found.");
      return;
    }
    for (const account of accounts) {
      const balance = account.unlimited ? "unlimited" : String(account.balance);
      console.log(
        `${account.code}\t${account.label}\tbalance=${balance}\tused=${account.lifetimeUsed}\tbought=${account.lifetimePurchased}\tgranted=${account.lifetimeGranted}`,
      );
    }
    return;
  }
  if (command === "grant") {
    const amount = Number(amountRaw);
    if (!code || !Number.isFinite(amount) || amount <= 0) {
      console.error("grant needs an invite code and a positive token amount.");
      process.exit(1);
    }
    const note = noteParts.join(" ").trim() || "cli grant";
    const result = await creditTokens(code, amount, { kind: "grant", id: `cli-${code}-${Date.now()}`, note });
    if (!result.ok) {
      console.error(result.error || "Could not grant tokens.");
      process.exit(1);
    }
    const account = result.account;
    console.log(
      result.applied
        ? `Granted ${Math.floor(amount)} tokens to ${account?.code}. Balance is now ${account?.unlimited ? "unlimited" : account?.balance}.`
        : `That grant was already applied. Balance is ${account?.unlimited ? "unlimited" : account?.balance}.`,
    );
    return;
  }
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
