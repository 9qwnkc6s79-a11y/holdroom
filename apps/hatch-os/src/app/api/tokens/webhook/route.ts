import { NextResponse } from "next/server";
import { applyCheckoutSession, stripeClient } from "@/lib/stripe-tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = stripeClient();
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe webhooks are not configured." }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature") || "";
  const raw = await req.text();
  let event: { type?: string; data?: { object?: unknown } };
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "The webhook signature was not recognized." }, { status: 400 });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true, ignored: event.type });
  }
  const session = event.data?.object as {
    id?: string;
    payment_status?: string;
    metadata?: Record<string, string> | null;
    client_reference_id?: string | null;
  } | undefined;
  const result = await applyCheckoutSession(session || {});
  return NextResponse.json({ received: true, ...result });
}
