/**
 * List tester credit accounts, or grant dollars to a code.
 *
 *   npm run tokens -- list
 *   npm run tokens -- grant HATCH-XXXX 25 "courtesy credit"
 */
import { creditCents, formatUsd, listAccounts, parseDollarsToCents } from "../src/lib/tokens.ts";

async function main() {
  const [command, code, amountRaw, ...noteParts] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    console.log(`Usage:
  tokens-admin list
  tokens-admin grant <CODE> <USD_AMOUNT> [note]`);
    process.exit(command ? 0 : 1);
  }
  if (command === "list") {
    const accounts = await listAccounts();
    if (!accounts.length) {
      console.log("No tester codes or credit accounts found.");
      return;
    }
    for (const account of accounts) {
      const balance = account.unlimited ? "unlimited" : formatUsd(account.balanceCents);
      console.log(
        `${account.code}\t${account.label}\tbalance=${balance}\tused=${formatUsd(account.lifetimeUsedCents)}\ttokens=${account.lifetimeUsedTokens}\tbought=${formatUsd(account.lifetimePurchasedCents)}\tgranted=${formatUsd(account.lifetimeGrantedCents)}`,
      );
    }
    return;
  }
  if (command === "grant") {
    const cents = parseDollarsToCents(amountRaw);
    if (!code || cents == null) {
      console.error("grant needs an invite code and a positive dollar amount, like 25 or 25.00.");
      process.exit(1);
    }
    const note = noteParts.join(" ").trim() || "cli grant";
    const result = await creditCents(code, cents, { kind: "grant", id: `cli-${code}-${Date.now()}`, note });
    if (!result.ok) {
      console.error(result.error || "Could not grant credit.");
      process.exit(1);
    }
    const account = result.account;
    const balance = account?.unlimited ? "unlimited" : formatUsd(account?.balanceCents || 0);
    console.log(
      result.applied
        ? `Granted ${formatUsd(cents)} to ${account?.code}. Balance is now ${balance}.`
        : `That grant was already applied. Balance is ${balance}.`,
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
