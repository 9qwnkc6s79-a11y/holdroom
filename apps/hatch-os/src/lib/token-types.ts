export const MIN_TOPUP_CENTS = 50;
export const MAX_TOPUP_CENTS = 1_000_000;

export interface TokenBalanceView {
  code: string;
  label: string;
  unlimited: boolean;
  metered: boolean;
  balanceCents: number;
  lifetimeUsedCents: number;
  lifetimeUsedTokens: number;
  lifetimePurchasedCents: number;
  lifetimeGrantedCents: number;
  checkoutReady: boolean;
  minTopupCents: number;
  maxTopupCents: number;
  rateConfigured: boolean;
  grantConfigured: boolean;
  message: string;
}

export function formatUsd(cents: number): string {
  const value = (Number(cents) || 0) / 100;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Parse a dollar amount like "10", "10.00", or "$10.50" into integer cents. */
export function parseDollarsToCents(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw * 100);
  }
  const text = String(raw || "").trim().replace(/[$,\s]/g, "");
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents;
}
