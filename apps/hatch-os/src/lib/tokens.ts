import { readRecord, readRecords, saveRecord } from "./beta-store.ts";
import { parseTesterCodes, safeCode, testerByCode } from "./testers.ts";
import { tokensUsed, type LlmUsage } from "./llm-usage.ts";
import type { TokenBalanceView } from "./token-types.ts";

export type { TokenBalanceView } from "./token-types.ts";

export const OUT_OF_TOKENS_TEXT = "You're out of tokens. Add more in Settings to keep chatting.";

export interface TokenAccount {
  code: string;
  label: string;
  unlimited: boolean;
  balance: number;
  grantedFree: boolean;
  freeGrant: number;
  lifetimeUsed: number;
  lifetimePurchased: number;
  lifetimeGranted: number;
  lastLane?: "ask" | "agent";
  createdAt: string;
  updatedAt: string;
}

export function freeTokenGrant(): number | null {
  return positiveInt(process.env.HATCH_FREE_TOKEN_GRANT);
}

export function topupTokens(): number | null {
  return positiveInt(process.env.HATCH_TOPUP_TOKENS);
}

export function stripePriceId(): string {
  return (process.env.STRIPE_PRICE_ID || "").trim();
}

export function checkoutConfigured(): boolean {
  return Boolean(testStripeSecret() && stripePriceId() && topupTokens());
}

/** Test-mode Stripe secret only. Live keys are rejected so a typo cannot charge real cards. */
export function testStripeSecret(): string | null {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) return null;
  if (key.startsWith("sk_live") || key.startsWith("rk_live")) return null;
  if (key.startsWith("sk_test") || key.startsWith("rk_test")) return key;
  return null;
}

export function unlimitedCodes(): Set<string> {
  const raw = process.env.HATCH_UNLIMITED_CODES;
  const list = raw == null || raw.trim() === "" ? "HATCH-AH7G" : raw;
  const codes = new Set<string>();
  for (const part of list.split(",")) {
    const code = safeCode(part);
    if (code && code !== "STAFF") codes.add(code);
  }
  return codes;
}

export function isUnlimitedCode(code: string): boolean {
  return unlimitedCodes().has(safeCode(code));
}

/** Only known tester codes are metered. "staff" and unknown codes stay unmetered so local/CI paths keep working. */
export function isMeteredCode(code: string): boolean {
  const tester = testerByCode(code);
  if (!tester) return false;
  return !isUnlimitedCode(tester.code);
}

export function outOfTokensPayload() {
  return {
    phase: "done" as const,
    error: true,
    outOfTokens: true,
    text: OUT_OF_TOKENS_TEXT,
  };
}

export async function getBalance(code: string): Promise<TokenBalanceView> {
  const account = await ensureAccount(code);
  const metered = isMeteredCode(code);
  const unlimited = account.unlimited || isUnlimitedCode(code);
  const grantConfigured = freeTokenGrant() != null;
  const pack = topupTokens();
  const checkoutReady = checkoutConfigured();
  let message = "";
  if (unlimited) message = "This sign-in has an unlimited token balance.";
  else if (!metered) message = "This sign-in is not on a metered tester code.";
  else if (account.balance <= 0) {
    const hadAny = account.lifetimeUsed > 0 || account.lifetimePurchased > 0 || account.lifetimeGranted > 0 || account.grantedFree;
    message = hadAny
      ? OUT_OF_TOKENS_TEXT
      : "A free starting grant has not been set yet. An admin can add tokens, or set HATCH_FREE_TOKEN_GRANT.";
  }
  return {
    code: account.code,
    label: account.label,
    unlimited,
    metered,
    balance: unlimited ? 0 : account.balance,
    lifetimeUsed: account.lifetimeUsed,
    lifetimePurchased: account.lifetimePurchased,
    lifetimeGranted: account.lifetimeGranted,
    checkoutReady,
    topupTokens: pack,
    grantConfigured,
    message,
  };
}

export async function assertHasTokens(code: string): Promise<{ ok: true } | { ok: false; text: string }> {
  if (!isMeteredCode(code)) return { ok: true };
  const account = await ensureAccount(code);
  if (account.unlimited || account.balance > 0) return { ok: true };
  return { ok: false, text: OUT_OF_TOKENS_TEXT };
}

export async function deductUsage(code: string, usage: LlmUsage | null | undefined, lane: "ask" | "agent"): Promise<TokenAccount | null> {
  const used = tokensUsed(usage);
  if (!used || !isMeteredCode(code)) return null;
  return mutateAccount(code, (account) => {
    if (account.unlimited) return account;
    const nextUsed = account.lifetimeUsed + used;
    const nextBalance = Math.max(0, account.balance - used);
    return { ...account, balance: nextBalance, lifetimeUsed: nextUsed, lastLane: lane };
  });
}

export type CreditKind = "topup" | "grant" | "free";

export async function creditTokens(
  code: string,
  amount: number,
  credit: { kind: CreditKind; id: string; note?: string },
): Promise<{ ok: boolean; applied: boolean; account: TokenAccount | null; error?: string }> {
  const tokens = Math.floor(Number(amount));
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return { ok: false, applied: false, account: null, error: "A positive token amount is required." };
  }
  const tester = testerByCode(code) || (isUnlimitedCode(code) ? { code: safeCode(code), label: safeCode(code) } : null);
  if (!tester && !isMeteredCode(code) && !isUnlimitedCode(code)) {
    // Still allow a known-format Hatch code that was listed earlier and then removed? Require the code to parse as a tester or already have an account.
    const existing = await readAccount(code);
    if (!existing) return { ok: false, applied: false, account: null, error: "That invite code is not on this system." };
  }
  const id = safeCreditId(credit.id);
  const prior = await readRecord<CreditRecord>("tokens/credits", id);
  if (prior) {
    const account = await ensureAccount(code);
    return { ok: true, applied: false, account };
  }
  const account = await mutateAccount(code, (current) => {
    const purchased = current.lifetimePurchased + (credit.kind === "topup" ? tokens : 0);
    const granted = current.lifetimeGranted + (credit.kind === "grant" ? tokens : 0);
    return {
      ...current,
      balance: current.unlimited ? current.balance : current.balance + tokens,
      lifetimePurchased: purchased,
      lifetimeGranted: granted,
    };
  });
  await saveRecord("tokens/credits", id, {
    id,
    code: safeCode(code),
    kind: credit.kind,
    amount: tokens,
    note: credit.note || "",
    at: new Date().toISOString(),
  } satisfies CreditRecord);
  return { ok: true, applied: true, account };
}

export async function listAccounts(): Promise<TokenAccount[]> {
  const stored = await readRecords<TokenAccount>("tokens/accounts");
  const byCode = new Map<string, TokenAccount>();
  for (const account of stored) {
    if (account?.code) byCode.set(safeCode(account.code), account);
  }
  for (const tester of parseTesterCodes()) {
    if (!byCode.has(tester.code)) {
      byCode.set(tester.code, await ensureAccount(tester.code));
    }
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function ensureAccount(code: string): Promise<TokenAccount> {
  const existing = await readAccount(code);
  const tester = testerByCode(code);
  const normalized = tester?.code || safeCode(code);
  const label = tester?.label || existing?.label || normalized;
  const unlimited = isUnlimitedCode(normalized);
  const grant = freeTokenGrant();
  const now = new Date().toISOString();
  if (!existing) {
    const next: TokenAccount = {
      code: normalized,
      label,
      unlimited,
      balance: unlimited ? 0 : grant ?? 0,
      grantedFree: !unlimited && grant != null,
      freeGrant: !unlimited && grant != null ? grant : 0,
      lifetimeUsed: 0,
      lifetimePurchased: 0,
      lifetimeGranted: 0,
      createdAt: now,
      updatedAt: now,
    };
    await saveRecord("tokens/accounts", normalized, next);
    return next;
  }
  let changed = false;
  let next: TokenAccount = { ...existing, code: normalized, label, unlimited };
  if (!next.grantedFree && !unlimited && grant != null) {
    next = {
      ...next,
      balance: next.balance + grant,
      grantedFree: true,
      freeGrant: grant,
    };
    changed = true;
  }
  if (existing.label !== label || existing.unlimited !== unlimited || existing.code !== normalized) changed = true;
  if (changed) {
    next = { ...next, updatedAt: now };
    await saveRecord("tokens/accounts", normalized, next);
  }
  return next;
}

async function readAccount(code: string): Promise<TokenAccount | null> {
  return readRecord<TokenAccount>("tokens/accounts", safeCode(code));
}

async function mutateAccount(code: string, fn: (account: TokenAccount) => TokenAccount): Promise<TokenAccount> {
  const current = await ensureAccount(code);
  const next = { ...fn(current), updatedAt: new Date().toISOString() };
  await saveRecord("tokens/accounts", next.code, next);
  return next;
}

function positiveInt(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function safeCreditId(id: string): string {
  const cleaned = id.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return cleaned || "credit";
}

interface CreditRecord {
  id: string;
  code: string;
  kind: CreditKind;
  amount: number;
  note: string;
  at: string;
}
