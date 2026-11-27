import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session-auth";
import { deleteRoutine, markRead, routinesPayload, saveRoutineInput, setEnabled, type SaveBody } from "@/lib/routines/api";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  return NextResponse.json(await routinesPayload(auth.session.scope), { headers: noStore });
}

/** Create or update. Accepts `cron`, `runAt`, `triggerQuery`, or plain-language `when`. */
export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as SaveBody | null;
  if (!body) return NextResponse.json({ error: "Missing routine." }, { status: 400 });
  const saved = await saveRoutineInput(auth.session.scope, body);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ routine: saved.routine, created: saved.created }, { headers: noStore });
}

/** `{ id, enabled }` pauses/resumes; `{ action: "read", id?, runId? }` marks results read. */
export async function PATCH(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { id?: string; enabled?: boolean; action?: string; runId?: string } | null;
  if (body?.action === "read") {
    await markRead(auth.session.scope, body.id, body.runId);
    return NextResponse.json(await routinesPayload(auth.session.scope), { headers: noStore });
  }
  if (!body?.id || typeof body.enabled !== "boolean") return NextResponse.json({ error: "Missing routine." }, { status: 400 });
  const routine = await setEnabled(auth.session.scope, body.id, body.enabled);
  if (!routine) return NextResponse.json({ error: "Unknown routine." }, { status: 404 });
  return NextResponse.json({ routine }, { headers: noStore });
}

export async function DELETE(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing routine." }, { status: 400 });
  const removed = await deleteRoutine(auth.session.scope, id);
  if (!removed) return NextResponse.json({ error: "Unknown routine." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
