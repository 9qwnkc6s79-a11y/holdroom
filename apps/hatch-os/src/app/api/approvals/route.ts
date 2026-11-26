import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { applyApprovalDecision } from "@/lib/approvals";
import { getThread } from "@/lib/store";
import { ensureThreadScoped, listThreadsScoped, saveThreadScoped } from "@/lib/thread-store";
import { ROUTINES_AGENT_ID } from "@/lib/routines/runner";
import { syncRunApproval } from "@/lib/routines/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    threadId?: string;
    messageId?: string;
    decision?: "approved" | "cancelled";
    actor?: string;
    accessibleDepartments?: string[];
    enterprise?: boolean;
    testerCode?: string;
    /** Routine proposals only: edits made on the card (name, prompt, when, mode). */
    edits?: { name?: string; prompt?: string; when?: string; mode?: string; triggerQuery?: string } | null;
  } | null;
  if (!body?.threadId || !body.messageId) {
    return NextResponse.json({ error: "Missing approval." }, { status: 400 });
  }
  if (body.decision !== "approved" && body.decision !== "cancelled") {
    return NextResponse.json({ error: "Choose approve or cancel." }, { status: 400 });
  }
  let threadId = body.threadId;
  const found = await ensureThreadScoped(auth.session.scope, threadId);
  if (!found?.messages?.some((m) => m.id === body.messageId)) {
    // The web client can still hold a local thread id ("local-…") for a thread
    // the server created; find the thread that owns this message instead.
    const owner = (await listThreadsScoped(auth.session.scope)).find((t) => t.messages?.some((m) => m.id === body.messageId));
    if (owner) threadId = owner.id;
  }
  const result = await applyApprovalDecision({
    threadId,
    messageId: body.messageId,
    decision: body.decision,
    actor: body.actor,
    accessibleDepartments: body.accessibleDepartments,
    enterprise: body.enterprise,
    testerCode: auth.session.scope,
    edits: body.edits && typeof body.edits === "object" ? body.edits : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const thread = getThread(threadId);
  await saveThreadScoped(auth.session.scope, thread);
  if (thread?.agentId === ROUTINES_AGENT_ID && result.message.approval) {
    await syncRunApproval(auth.session.scope, body.messageId, result.message.approval.status).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, message: result.message, event: result.event || null });
}
