import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session-auth";
import { updateThread } from "@/lib/store";
import { deleteThreadScoped, getThreadScoped, saveThreadScoped } from "@/lib/thread-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const thread = await getThreadScoped(auth.session.scope, decodeURIComponent(id));
  if (!thread) return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
  return NextResponse.json({ thread }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const decoded = decodeURIComponent(id);
  const existing = await getThreadScoped(auth.session.scope, decoded);
  if (!existing) return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    archived?: boolean;
    lastArtifactId?: string | null;
  } | null;
  const thread = updateThread(decoded, {
    title: body?.title,
    archived: body?.archived,
    lastArtifactId: body?.lastArtifactId,
  });
  if (!thread) return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
  await saveThreadScoped(auth.session.scope, thread);
  return NextResponse.json({ thread });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const ok = await deleteThreadScoped(auth.session.scope, decodeURIComponent(id));
  if (!ok) return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
