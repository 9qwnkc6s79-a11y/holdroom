import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { patchMessage } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    threadId?: string;
    messageId?: string;
    reactions?: string[];
  } | null;
  if (!body?.threadId || !body.messageId) {
    return NextResponse.json({ error: "Missing message." }, { status: 400 });
  }
  const message = patchMessage(body.threadId, body.messageId, {
    reactions: (body.reactions || []).filter((emoji) => typeof emoji === "string").slice(0, 8),
  });
  if (!message) return NextResponse.json({ error: "Unknown message." }, { status: 404 });
  return NextResponse.json({ message });
}
