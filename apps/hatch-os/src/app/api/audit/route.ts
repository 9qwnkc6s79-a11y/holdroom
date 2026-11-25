import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { listAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  return NextResponse.json({ entries: listAudit() }, { headers: { "Cache-Control": "no-store" } });
}
