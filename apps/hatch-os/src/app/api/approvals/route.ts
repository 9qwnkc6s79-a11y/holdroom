import { NextResponse } from "next/server";
import { applyApprovalDecision } from "@/lib/approvals";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    threadId?: string;
    messageId?: string;
    decision?: "approved" | "cancelled";
    actor?: string;
    accessibleDepartments?: string[];
    enterprise?: boolean;
  } | null;
  if (!body?.threadId || !body.messageId) {
    return NextResponse.json({ error: "Missing approval." }, { status: 400 });
  }
  if (body.decision !== "approved" && body.decision !== "cancelled") {
    return NextResponse.json({ error: "Choose approve or cancel." }, { status: 400 });
  }
  const result = applyApprovalDecision({
    threadId: body.threadId,
    messageId: body.messageId,
    decision: body.decision,
    actor: body.actor,
    accessibleDepartments: body.accessibleDepartments,
    enterprise: body.enterprise,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, message: result.message, event: result.event || null });
}
