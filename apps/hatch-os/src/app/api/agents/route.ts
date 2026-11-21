import { NextResponse } from "next/server";
import { listStoredAgents, removeStoredAgent, saveStoredAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ agents: listStoredAgents() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    name?: string;
    title?: string;
    description?: string;
    color?: string;
    icon?: string;
    model?: string;
    notifications?: boolean;
    muted?: boolean;
    pinned?: boolean;
  } | null;
  if (!body?.name?.trim()) return NextResponse.json({ error: "Name the agent." }, { status: 400 });
  try {
    const agent = saveStoredAgent({
      id: body.id,
      name: body.name,
      title: body.title,
      description: body.description,
      color: body.color,
      icon: body.icon,
      model: body.model,
      notifications: body.notifications,
      muted: body.muted,
      pinned: body.pinned,
    });
    return NextResponse.json({ agent });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the agent.";
    return NextResponse.json({ error: `Could not save the agent. ${message}` }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing agent." }, { status: 400 });
  const removed = removeStoredAgent(id);
  if (!removed) return NextResponse.json({ error: "That agent stays. Only agents you added can be removed." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
