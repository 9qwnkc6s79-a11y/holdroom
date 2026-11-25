import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { NORTH_DESK, migrateWorkspaceId } from "@/lib/departments";
import { createThread, listThreads, patchMessage, updateThread } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const departmentId = new URL(req.url).searchParams.get("department");
  return NextResponse.json(
    { threads: listThreads(departmentId ? migrateWorkspaceId(departmentId) : undefined) },
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
  const thread = createThread(
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
  if (body.messageId && body.reactions) {
    const message = patchMessage(body.id, body.messageId, {
      reactions: body.reactions.filter((emoji) => typeof emoji === "string").slice(0, 8),
    });
    if (!message) return NextResponse.json({ error: "Unknown message." }, { status: 404 });
    return NextResponse.json({ message });
  }
  const thread = updateThread(body.id, {
    title: body.title,
    archived: body.archived,
    lastArtifactId: body.lastArtifactId,
  });
  if (!thread) return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
  return NextResponse.json({ thread });
}
