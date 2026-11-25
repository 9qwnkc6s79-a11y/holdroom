import { NextResponse } from "next/server";
import { createTopupCheckout, publicOrigin } from "@/lib/stripe-tokens";
import { checkoutConfigured, isUnlimitedCode, parseDollarsToCents } from "@/lib/tokens";
import { safeCode, testerByCode } from "@/lib/testers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    code?: string;
    amount?: string | number;
    amountUsd?: string | number;
    amountCents?: number;
  } | null;
  const code = safeCode(body?.code || req.headers.get("x-hatch-tester") || "");
  if (!testerByCode(code)) {
    return NextResponse.json({ error: "Sign in with your invite code to add credit." }, { status: 401 });
  }
  if (isUnlimitedCode(code)) {
    return NextResponse.json({ error: "This sign-in already has an unlimited balance." }, { status: 400 });
  }
  if (!checkoutConfigured()) {
    return NextResponse.json({
      error: "Credit top-ups are not set up yet. A Stripe test-mode secret needs to be set.",
      checkoutReady: false,
    }, { status: 503 });
  }
  const amountCents = Number.isFinite(Number(body?.amountCents)) && Number(body?.amountCents) > 0
    ? Math.round(Number(body?.amountCents))
    : parseDollarsToCents(body?.amountUsd ?? body?.amount);
  if (amountCents == null) {
    return NextResponse.json({ error: "Enter a dollar amount to add, like 20 or 20.00." }, { status: 400 });
  }
  try {
    const result = await createTopupCheckout({ code, origin: publicOrigin(req), amountCents });
    if ("error" in result) {
      return NextResponse.json({ error: result.error, checkoutReady: false }, { status: 400 });
    }
    return NextResponse.json({ url: result.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe checkout could not be started.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
