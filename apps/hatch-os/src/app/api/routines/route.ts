import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { deleteRoutine, listRoutines, saveRoutine } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  return NextResponse.json(
    {
      routines: listRoutines(),
      execution: "stored-only",
      note: "Schedules are saved on this system. Nothing runs on a timer in this version.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    agentId?: string;
    name?: string;
    prompt?: string;
    schedule?: string;
    enabled?: boolean;
  } | null;
  if (!body?.prompt?.trim()) return NextResponse.json({ error: "Write the prompt." }, { status: 400 });
  const routine = saveRoutine({
    id: body.id,
    agentId: body.agentId || "general",
    name: body.name || "Untitled routine",
    prompt: body.prompt,
    schedule: body.schedule || "weekdays 07:00",
    enabled: body.enabled,
  });
  return NextResponse.json({ routine });
}

export async function DELETE(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing routine." }, { status: 400 });
  const removed = deleteRoutine(id);
  if (!removed) return NextResponse.json({ error: "Unknown routine." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
