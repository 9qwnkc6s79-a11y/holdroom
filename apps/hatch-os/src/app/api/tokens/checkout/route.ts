import { NextResponse } from "next/server";
import { createTopupCheckout, publicOrigin } from "@/lib/stripe-tokens";
import { checkoutConfigured, isUnlimitedCode } from "@/lib/tokens";
import { safeCode, testerByCode } from "@/lib/testers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const code = safeCode(body?.code || req.headers.get("x-hatch-tester") || "");
  if (!testerByCode(code)) {
    return NextResponse.json({ error: "Sign in with your invite code to add tokens." }, { status: 401 });
  }
  if (isUnlimitedCode(code)) {
    return NextResponse.json({ error: "This sign-in already has an unlimited balance." }, { status: 400 });
  }
  if (!checkoutConfigured()) {
    return NextResponse.json({
      error: "Token top-ups are not set up yet. Stripe test keys, a Price ID, and HATCH_TOPUP_TOKENS need to be set.",
      checkoutReady: false,
    }, { status: 503 });
  }
  try {
    const result = await createTopupCheckout({ code, origin: publicOrigin(req) });
    if ("error" in result) {
      return NextResponse.json({ error: result.error, checkoutReady: false }, { status: 503 });
    }
    return NextResponse.json({ url: result.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe checkout could not be started.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
