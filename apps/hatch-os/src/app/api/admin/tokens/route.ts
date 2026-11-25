import { NextResponse } from "next/server";
import { creditTokens, listAccounts } from "@/lib/tokens";
import { safeCode } from "@/lib/testers";

export const dynamic = "force-dynamic";

function allowed(req: Request) {
  const expected = process.env.HATCH_ADMIN_CODE || "";
  const given = req.headers.get("x-hatch-admin") || "";
  return Boolean(expected) && given === expected;
}

export async function GET(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "That admin code is not recognized." }, { status: 401 });
  const accounts = await listAccounts();
  return NextResponse.json({ accounts }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "That admin code is not recognized." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { code?: string; amount?: number; id?: string; note?: string } | null;
  const code = safeCode(body?.code || "");
  const amount = Number(body?.amount);
  if (!code) return NextResponse.json({ error: "An invite code is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "A positive token amount is required." }, { status: 400 });
  }
  const id = (body?.id || "").trim() || `grant-${code.toLowerCase()}-${Date.now()}`;
  const result = await creditTokens(code, amount, { kind: "grant", id, note: body?.note || "admin grant" });
  if (!result.ok) return NextResponse.json({ error: result.error || "Could not grant tokens." }, { status: 400 });
  return NextResponse.json({ ok: true, applied: result.applied, account: result.account });
}
