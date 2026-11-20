import { NextResponse } from "next/server";
import { listAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ entries: listAudit() }, { headers: { "Cache-Control": "no-store" } });
}
