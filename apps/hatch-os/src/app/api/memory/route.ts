import { NextResponse } from "next/server";
import { sanitizeMemory } from "@/lib/harness/memory";
import { loadMemory, rememberFact, saveMemory } from "@/lib/harness/memory-store";
import { requireSession } from "@/lib/session-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Firm memory: people, projects, places, preferences, remembered facts. */
export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  return NextResponse.json({ memory: await loadMemory(auth.session.scope) }, { headers: { "Cache-Control": "no-store" } });
}

/** Replace the whole memory document (the Settings editor sends the full object). */
export async function PUT(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { memory?: unknown } | null;
  if (!body?.memory) return NextResponse.json({ error: "Send a memory object." }, { status: 400 });
  const saved = await saveMemory(auth.session.scope, sanitizeMemory(body.memory));
  return NextResponse.json({ memory: saved });
}

/** Add one remembered fact: { fact: "Rick is our sign vendor" }. */
export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { fact?: string } | null;
  const fact = String(body?.fact || "").trim();
  if (!fact) return NextResponse.json({ error: "Send a fact." }, { status: 400 });
  return NextResponse.json({ memory: await rememberFact(auth.session.scope, fact) });
}
