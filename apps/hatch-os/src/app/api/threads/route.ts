import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { NORTH_DESK, migrateWorkspaceId } from "@/lib/departments";
import { patchMessage, updateThread } from "@/lib/store";
import {
  createThreadScoped,
  deleteThreadScoped,
  getThreadScoped,
  listThreadsScoped,
  saveThreadScoped,
} from "@/lib/thread-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const departmentId = new URL(req.url).searchParams.get("department");
  const threads = await listThreadsScoped(
    auth.session.scope,
    departmentId ? migrateWorkspaceId(departmentId) : undefined,
  );
  return NextResponse.json(
    { threads },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    departmentId?: string;
    title?: string;
    agentId?: string;
  } | null;
  const thread = await createThreadScoped(
    auth.session.scope,
    migrateWorkspaceId(body?.departmentId || NORTH_DESK),
    body?.title || "New thread",
    body?.agentId,
  );
  return NextResponse.json({ thread });
}

export async function PATCH(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    title?: string;
    archived?: boolean;
    lastArtifactId?: string | null;
    messageId?: string;
    reactions?: string[];
  } | null;
  if (!body?.id) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
  const existing = await getThreadScoped(auth.session.scope, body.id);
  if (!existing) return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
  if (body.messageId && body.reactions) {
    const message = patchMessage(body.id, body.messageId, {
      reactions: body.reactions.filter((emoji) => typeof emoji === "string").slice(0, 8),
    });
    if (!message) return NextResponse.json({ error: "Unknown message." }, { status: 404 });
    const latest = await getThreadScoped(auth.session.scope, body.id);
    await saveThreadScoped(auth.session.scope, latest);
    return NextResponse.json({ message });
  }
  const thread = updateThread(body.id, {
    title: body.title,
    archived: body.archived,
    lastArtifactId: body.lastArtifactId,
  });
  if (!thread) return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
  await saveThreadScoped(auth.session.scope, thread);
  return NextResponse.json({ thread });
}

export async function DELETE(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
  const ok = await deleteThreadScoped(auth.session.scope, id);
  if (!ok) return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
