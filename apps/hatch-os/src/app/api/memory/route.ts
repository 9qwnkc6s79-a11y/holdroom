import { NextResponse } from "next/server";
import { sanitizeMemory } from "@/lib/harness/memory";
import { loadMemory, rememberFact, saveMemory } from "@/lib/harness/memory-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function scopeOf(req: Request, body?: { scope?: string }) {
  return body?.scope || req.headers.get("x-hatch-tester") || "staff";
}

/** Firm memory: people, projects, places, preferences, remembered facts. */
export async function GET(req: Request) {
  return NextResponse.json({ memory: await loadMemory(scopeOf(req)) }, { headers: { "Cache-Control": "no-store" } });
}

/** Replace the whole memory document (the Settings editor sends the full object). */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as { scope?: string; memory?: unknown } | null;
  if (!body?.memory) return NextResponse.json({ error: "Send a memory object." }, { status: 400 });
  const saved = await saveMemory(scopeOf(req, body), sanitizeMemory(body.memory));
  return NextResponse.json({ memory: saved });
}

/** Add one remembered fact: { fact: "Rick is our sign vendor" }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { scope?: string; fact?: string } | null;
  const fact = String(body?.fact || "").trim();
  if (!fact) return NextResponse.json({ error: "Send a fact." }, { status: 400 });
  return NextResponse.json({ memory: await rememberFact(scopeOf(req, body || undefined), fact) });
}
