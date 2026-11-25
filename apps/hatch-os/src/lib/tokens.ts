import { readRecord, readRecords, saveRecord } from "./beta-store.ts";
import { parseTesterCodes, safeCode, testerByCode } from "./testers.ts";
import { tokensUsed, type LlmUsage } from "./llm-usage.ts";
import {
  MAX_TOPUP_CENTS,
  MIN_TOPUP_CENTS,
  type TokenBalanceView,
} from "./token-types.ts";

export { MAX_TOPUP_CENTS, MIN_TOPUP_CENTS, formatUsd, parseDollarsToCents } from "./token-types.ts";
export type { TokenBalanceView } from "./token-types.ts";

export const OUT_OF_CREDIT_TEXT =
  "You're out of credit. Add more in Settings to keep chatting.";
export const OUT_OF_TOKENS_TEXT = OUT_OF_CREDIT_TEXT;

export type CreditKind = "purchase" | "grant" | "topup";

export interface TokenAccount {
  type?: "token-account";
  currency: "cents";
  code: string;
  label: string;
  unlimited: boolean;
  balanceCents: number;
  lifetimeUsedCents: number;
  lifetimeUsedTokens: number;
  lifetimePurchasedCents: number;
  lifetimeGrantedCents: number;
  grantedFree: boolean;
  freeGrantCents: number;
  lastLane?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreditRecord {
  type?: "token-credit";
  id: string;
  code: string;
  cents: number;
  kind: "purchase" | "grant";
  note?: string;
  createdAt: string;
}

type LegacyAccount = TokenAccount & {
  balance?: number;
  lifetimeUsed?: number;
  lifetimePurchased?: number;
  lifetimeGranted?: number;
  freeGrant?: number;
};

export function isUnlimitedCode(code: string): boolean {
  const raw = process.env.HATCH_UNLIMITED_CODES || "HATCH-AH7G";
  const set = new Set(
    raw
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean),
  );
  return set.has(safeCode(code));
}

export function isMeteredCode(code: string): boolean {
  return Boolean(testerByCode(code)) && !isUnlimitedCode(code);
}

export function outOfCreditPayload() {
  return {
    phase: "done" as const,
    error: true,
    outOfCredit: true,
    outOfTokens: true,
    text: OUT_OF_CREDIT_TEXT,
  };
}

export const outOfTokensPayload = outOfCreditPayload;

/** Dollars per million tokens, or null when the rate has not been approved and set. */
export function pricePerMTokUsd(): number | null {
  const raw = process.env.HATCH_PRICE_PER_MTOK_USD;
  if (!raw?.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function freeCreditCents(): number | null {
  const raw = process.env.HATCH_FREE_CREDIT_USD;
  if (!raw?.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Integer cents charged for a token count. Returns 0 when the rate env is unset. */
export function centsForTokens(tokens: number): number {
  const usd = pricePerMTokUsd();
  if (usd == null || !Number.isFinite(tokens) || tokens <= 0) return 0;
  const microPerMTok = Math.round(usd * 1_000_000);
  return Math.ceil((tokens * microPerMTok) / 1e6 / 1e4);
}

export function testStripeSecret(): string | null {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET || "";
  if (!key) return null;
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    throw new Error("Live Stripe keys are refused. Use a test-mode secret (sk_test_ or rk_test_).");
  }
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("Stripe secret must be a test-mode key (sk_test_ or rk_test_).");
  }
  return key;
}

export function checkoutConfigured(): boolean {
  try {
    return Boolean(testStripeSecret());
  } catch {
    return false;
  }
}

function safeCreditId(id: string): string {
  const cleaned = id.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return cleaned || "credit";
}

function emptyAccount(code: string, now: string): TokenAccount {
  const tester = testerByCode(code);
  const normalized = tester?.code || safeCode(code);
  const unlimited = isUnlimitedCode(normalized);
  const grant = unlimited ? null : freeCreditCents();
  return {
    type: "token-account",
    currency: "cents",
    code: normalized,
    label: tester?.label || normalized,
    unlimited,
    balanceCents: grant ?? 0,
    lifetimeUsedCents: 0,
    lifetimeUsedTokens: 0,
    lifetimePurchasedCents: 0,
    lifetimeGrantedCents: 0,
    grantedFree: grant != null,
    freeGrantCents: grant ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

function migrateAccount(existing: LegacyAccount): TokenAccount {
  if (existing.currency === "cents" && typeof existing.balanceCents === "number") {
    return existing;
  }
  const now = new Date().toISOString();
  const fresh = emptyAccount(existing.code, now);
  return {
    ...fresh,
    createdAt: existing.createdAt || now,
    lifetimeUsedTokens: Number(existing.lifetimeUsedTokens || existing.lifetimeUsed || 0),
    lastLane: existing.lastLane,
  };
}

async function readAccount(code: string): Promise<TokenAccount | null> {
  const existing = await readRecord<LegacyAccount>("tokens/accounts", safeCode(code));
  return existing ? migrateAccount(existing) : null;
}

export async function ensureAccount(code: string): Promise<TokenAccount> {
  const existing = await readAccount(code);
  const now = new Date().toISOString();
  const tester = testerByCode(code);
  const normalized = tester?.code || safeCode(code);
  const label = tester?.label || existing?.label || normalized;
  const unlimited = isUnlimitedCode(normalized);
  if (!existing) {
    const created = emptyAccount(normalized, now);
    created.label = label;
    created.unlimited = unlimited;
    if (unlimited) {
      created.balanceCents = 0;
      created.grantedFree = false;
      created.freeGrantCents = 0;
    }
    await saveRecord("tokens/accounts", normalized, created);
    return created;
  }
  let next: TokenAccount = { ...existing, code: normalized, label, unlimited };
  let changed = existing.currency !== "cents" || existing.code !== normalized || existing.label !== label || existing.unlimited !== unlimited;
  if (!unlimited && !next.grantedFree) {
    const grant = freeCreditCents();
    if (grant != null) {
      next = {
        ...next,
        balanceCents: next.balanceCents + grant,
        grantedFree: true,
        freeGrantCents: grant,
      };
      changed = true;
    }
  }
  if (changed) {
    next = { ...next, updatedAt: now };
    await saveRecord("tokens/accounts", normalized, next);
  }
  return next;
}

async function mutateAccount(code: string, fn: (account: TokenAccount) => TokenAccount): Promise<TokenAccount> {
  const current = await ensureAccount(code);
  const next = { ...fn(current), updatedAt: new Date().toISOString() };
  await saveRecord("tokens/accounts", next.code, next);
  return next;
}

export async function getBalance(code: string): Promise<TokenBalanceView> {
  const account = await ensureAccount(code);
  const metered = isMeteredCode(account.code);
  const rateConfigured = pricePerMTokUsd() != null;
  const grant = freeCreditCents();
  let message = "";
  if (account.unlimited) {
    message = "This sign-in is not metered.";
  } else if (!metered) {
    message = "This session is not tied to a tester invite, so usage is not billed.";
  } else if (!rateConfigured) {
    message = "Usage is recorded, but credit is not deducted until a per-token rate is set.";
  }
  return {
    code: account.code,
    label: account.label,
    unlimited: account.unlimited,
    metered,
    balanceCents: account.unlimited ? 0 : account.balanceCents,
    lifetimeUsedCents: account.lifetimeUsedCents,
    lifetimeUsedTokens: account.lifetimeUsedTokens,
    lifetimePurchasedCents: account.lifetimePurchasedCents,
    lifetimeGrantedCents: account.lifetimeGrantedCents,
    checkoutReady: checkoutConfigured(),
    minTopupCents: MIN_TOPUP_CENTS,
    maxTopupCents: MAX_TOPUP_CENTS,
    rateConfigured,
    grantConfigured: grant != null,
    message,
  };
}

export async function assertHasCredit(code: string | undefined): Promise<{ ok: true } | { ok: false; message: string; text: string }> {
  const raw = (code || "").trim();
  if (!raw || isUnlimitedCode(raw) || !isMeteredCode(raw)) return { ok: true };
  const account = await ensureAccount(raw);
  if (account.unlimited || account.balanceCents > 0) return { ok: true };
  return { ok: false, message: OUT_OF_CREDIT_TEXT, text: OUT_OF_CREDIT_TEXT };
}

/** @deprecated Use assertHasCredit. */
export const assertHasTokens = assertHasCredit;

export async function deductUsage(
  code: string | undefined,
  usage: LlmUsage | null | undefined,
  lane?: string,
): Promise<TokenAccount | null> {
  const raw = (code || "").trim();
  if (!raw || !isMeteredCode(raw)) return null;
  const usedTokens = tokensUsed(usage);
  if (!usedTokens) return null;
  const charge = centsForTokens(usedTokens);
  return mutateAccount(raw, (account) => {
    if (account.unlimited) return account;
    return {
      ...account,
      lifetimeUsedTokens: account.lifetimeUsedTokens + usedTokens,
      lifetimeUsedCents: account.lifetimeUsedCents + charge,
      balanceCents: Math.max(0, account.balanceCents - charge),
      lastLane: lane || account.lastLane,
    };
  });
}

export async function creditCents(
  code: string,
  cents: number,
  opts: { kind: CreditKind; id: string; note?: string },
): Promise<{ ok: true; applied: boolean; account: TokenAccount } | { ok: false; applied: false; account: null; error: string }> {
  const raw = (code || "").trim();
  if (!raw) return { ok: false, applied: false, account: null, error: "An invite code is required." };
  if (!Number.isFinite(cents) || cents <= 0 || !Number.isInteger(cents)) {
    return { ok: false, applied: false, account: null, error: "A positive whole-cent amount is required." };
  }
  const tester = testerByCode(raw);
  const existing = await readAccount(raw);
  if (!tester && !isUnlimitedCode(raw) && !existing) {
    return { ok: false, applied: false, account: null, error: "That invite code is not on this system." };
  }
  const id = safeCreditId(opts.id);
  const prior = await readRecord<CreditRecord>("tokens/credits", id);
  if (prior) {
    const account = await ensureAccount(raw);
    return { ok: true, applied: false, account };
  }
  const kind: "purchase" | "grant" = opts.kind === "grant" ? "grant" : "purchase";
  const account = await mutateAccount(raw, (current) => ({
    ...current,
    balanceCents: current.unlimited ? current.balanceCents : current.balanceCents + cents,
    lifetimePurchasedCents: current.lifetimePurchasedCents + (kind === "purchase" ? cents : 0),
    lifetimeGrantedCents: current.lifetimeGrantedCents + (kind === "grant" ? cents : 0),
  }));
  await saveRecord("tokens/credits", id, {
    type: "token-credit",
    id,
    code: safeCode(raw),
    cents,
    kind,
    note: opts.note || "",
    createdAt: new Date().toISOString(),
  } satisfies CreditRecord);
  return { ok: true, applied: true, account };
}

/** @deprecated Use creditCents. */
export const creditTokens = creditCents;

export async function listAccounts(): Promise<TokenAccount[]> {
  const stored = await readRecords<LegacyAccount>("tokens/accounts");
  const byCode = new Map<string, TokenAccount>();
  for (const row of stored) {
    if (!row?.code) continue;
    byCode.set(safeCode(row.code), migrateAccount(row));
  }
  for (const tester of parseTesterCodes()) {
    if (!byCode.has(tester.code)) {
      byCode.set(tester.code, await ensureAccount(tester.code));
    }
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}
