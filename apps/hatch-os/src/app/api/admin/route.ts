import { NextResponse } from "next/server";
import { INITIAL_SEATS, SEAT_LINE } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      seats: INITIAL_SEATS,
      line: SEAT_LINE,
      backup: {
        lastSuccess: "none — software dry-run",
        note: "No appliance backup. Restore drill is a placeholder.",
      },
      updates: {
        note: "Import a signed offline bundle → inactive slot → health → cutover / rollback.",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (action === "backup") {
    return NextResponse.json({
      ok: true,
      message: "Backup started (stub). No appliance is connected.",
    });
  }
  if (action === "update") {
    return NextResponse.json({
      ok: true,
      message: "Waiting for a signed offline bundle. There is no live Hatch remote push.",
    });
  }
  if (action === "invite") {
    return NextResponse.json({
      ok: true,
      invite: "HATCH-8K2M",
      message: "Invite created. Share it in person. Issued by this box — not emailed from outside the firm.",
    });
  }
  return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
}
