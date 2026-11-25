import Stripe from "stripe";
import { checkoutConfigured, creditTokens, stripePriceId, testStripeSecret, topupTokens } from "./tokens.ts";
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

export async function createTopupCheckout(opts: { code: string; origin: string }): Promise<{ url: string } | { error: string }> {
  if (!checkoutConfigured()) {
    return { error: "Token top-ups are not set up yet. Stripe test keys, a Price ID, and HATCH_TOPUP_TOKENS need to be set." };
  }
  const stripe = stripeClient();
  const pack = topupTokens();
  const price = stripePriceId();
  if (!stripe || !pack || !price) {
    return { error: "Token top-ups are not set up yet." };
  }
  const code = safeCode(opts.code);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price, quantity: 1 }],
    success_url: `${opts.origin}/settings?tab=usage&topup=success`,
    cancel_url: `${opts.origin}/settings?tab=usage&topup=cancel`,
    client_reference_id: code,
    metadata: {
      testerCode: code,
      topupTokens: String(pack),
    },
  });
  if (!session.url) return { error: "Stripe did not return a checkout link." };
  return { url: session.url };
}

export function creditFromCheckoutSession(session: {
  id?: string | null;
  payment_status?: string | null;
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
}): { ok: true; code: string; amount: number; id: string } | { ok: false; reason: string } {
  if (!session?.id) return { ok: false, reason: "missing-session" };
  if (session.payment_status !== "paid") return { ok: false, reason: "not-paid" };
  const code = safeCode(session.metadata?.testerCode || session.client_reference_id || "");
  if (!code || code === "STAFF") return { ok: false, reason: "missing-code" };
  const fromMeta = Number(session.metadata?.topupTokens);
  const fromEnv = topupTokens();
  const amount = Number.isFinite(fromMeta) && fromMeta > 0 ? Math.floor(fromMeta) : fromEnv;
  if (!amount) return { ok: false, reason: "missing-amount" };
  return { ok: true, code, amount, id: `stripe-${session.id}` };
}

export async function applyCheckoutSession(session: Parameters<typeof creditFromCheckoutSession>[0]) {
  const parsed = creditFromCheckoutSession(session);
  if (!parsed.ok) return { applied: false, reason: parsed.reason };
  const result = await creditTokens(parsed.code, parsed.amount, { kind: "topup", id: parsed.id });
  return { applied: result.applied, ok: result.ok, error: result.error, reason: result.ok ? "ok" : "credit-failed" };
}
