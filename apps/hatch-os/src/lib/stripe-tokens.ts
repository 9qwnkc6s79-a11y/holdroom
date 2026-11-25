import Stripe from "stripe";
import {
  MAX_TOPUP_CENTS,
  MIN_TOPUP_CENTS,
  checkoutConfigured,
  creditCents,
  formatUsd,
  testStripeSecret,
} from "./tokens.ts";
import { safeCode } from "./testers.ts";

export function stripeClient(): Stripe | null {
  const key = testStripeSecret();
  if (!key) return null;
  return new Stripe(key);
}

export function publicOrigin(req: Request): string {
  const configured = (process.env.HATCH_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (host) return `${proto}://${host}`;
  const vercel = (process.env.VERCEL_URL || "").trim();
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export function validateTopupCents(cents: number): { ok: true; cents: number } | { ok: false; error: string } {
  if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents <= 0) {
    return { ok: false, error: "Enter a dollar amount to add, like 20 or 20.00." };
  }
  if (cents < MIN_TOPUP_CENTS) {
    return { ok: false, error: `The minimum top-up is ${formatUsd(MIN_TOPUP_CENTS)}.` };
  }
  if (cents > MAX_TOPUP_CENTS) {
    return { ok: false, error: `The maximum top-up is ${formatUsd(MAX_TOPUP_CENTS)}.` };
  }
  return { ok: true, cents };
}

export async function createTopupCheckout(opts: {
  code: string;
  origin: string;
  amountCents: number;
}): Promise<{ url: string } | { error: string }> {
  if (!checkoutConfigured()) {
    return { error: "Credit top-ups are not set up yet. A Stripe test-mode secret needs to be set." };
  }
  const stripe = stripeClient();
  if (!stripe) {
    return { error: "Credit top-ups are not set up yet." };
  }
  const amount = validateTopupCents(opts.amountCents);
  if (!amount.ok) return { error: amount.error };
  const code = safeCode(opts.code);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount.cents,
          product_data: { name: `Hatch credit ${formatUsd(amount.cents)}` },
        },
      },
    ],
    success_url: `${opts.origin}/settings?tab=usage&topup=success`,
    cancel_url: `${opts.origin}/settings?tab=usage&topup=cancel`,
    client_reference_id: code,
    metadata: {
      testerCode: code,
      amountCents: String(amount.cents),
    },
  });
  if (!session.url) return { error: "Stripe did not return a checkout link." };
  return { url: session.url };
}

export function creditFromCheckoutSession(session: {
  id?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
}): { ok: true; code: string; cents: number; id: string } | { ok: false; reason: string } {
  if (!session?.id) return { ok: false, reason: "missing-session" };
  if (session.payment_status !== "paid") return { ok: false, reason: "not-paid" };
  const code = safeCode(session.metadata?.testerCode || session.client_reference_id || "");
  if (!code || code === "STAFF") return { ok: false, reason: "missing-code" };
  const paid = Number(session.amount_total);
  const fromMeta = Number(session.metadata?.amountCents);
  const cents = Number.isFinite(paid) && paid > 0
    ? Math.floor(paid)
    : Number.isFinite(fromMeta) && fromMeta > 0
      ? Math.floor(fromMeta)
      : 0;
  if (!cents) return { ok: false, reason: "missing-amount" };
  return { ok: true, code, cents, id: `stripe-${session.id}` };
}

export async function applyCheckoutSession(session: Parameters<typeof creditFromCheckoutSession>[0]) {
  const parsed = creditFromCheckoutSession(session);
  if (!parsed.ok) return { applied: false, reason: parsed.reason };
  const result = await creditCents(parsed.code, parsed.cents, { kind: "purchase", id: parsed.id });
  return {
    applied: result.applied,
    ok: result.ok,
    error: result.ok ? undefined : result.error,
    reason: result.ok ? "ok" : "credit-failed",
  };
}
