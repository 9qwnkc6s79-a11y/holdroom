import { NextResponse } from "next/server";
import { getBalance } from "@/lib/tokens";
import { safeCode } from "@/lib/testers";

export const dynamic = "force-dynamic";

function scopeOf(req: Request) {
  const url = new URL(req.url);
  return safeCode(url.searchParams.get("code") || req.headers.get("x-hatch-tester") || "staff");
}

export async function GET(req: Request) {
  const view = await getBalance(scopeOf(req));
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
