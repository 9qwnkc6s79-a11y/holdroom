import { NextResponse } from "next/server";
import { creditCents, listAccounts, parseDollarsToCents } from "@/lib/tokens";
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
  const body = (await req.json().catch(() => null)) as {
    code?: string;
    amount?: string | number;
    amountUsd?: string | number;
    amountCents?: number;
    id?: string;
    note?: string;
  } | null;
  const code = safeCode(body?.code || "");
  if (!code || code === "STAFF") return NextResponse.json({ error: "An invite code is required." }, { status: 400 });
  const cents = Number.isFinite(Number(body?.amountCents)) && Number(body?.amountCents) > 0
    ? Math.round(Number(body?.amountCents))
    : parseDollarsToCents(body?.amountUsd ?? body?.amount);
  if (cents == null) {
    return NextResponse.json({ error: "A positive dollar amount is required." }, { status: 400 });
  }
  const id = (body?.id || "").trim() || `grant-${code.toLowerCase()}-${Date.now()}`;
  const result = await creditCents(code, cents, { kind: "grant", id, note: body?.note || "admin grant" });
  if (!result.ok) return NextResponse.json({ error: result.error || "Could not grant credit." }, { status: 400 });
  return NextResponse.json({ ok: true, applied: result.applied, account: result.account });
}
