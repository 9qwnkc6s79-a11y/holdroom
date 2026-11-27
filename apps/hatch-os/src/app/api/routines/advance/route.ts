import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session-auth";
import { routinesPayload } from "@/lib/routines/api";
import { advanceScope, defaultDeps, emptyReport } from "@/lib/routines/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The Routines screen polls this while a run is in flight (same idea as /api/chat/step). */
export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  await advanceScope(auth.session.scope, await defaultDeps(), emptyReport(), { deadline: Date.now() + 40_000, rounds: 1 });
  return NextResponse.json(await routinesPayload(auth.session.scope), { headers: { "Cache-Control": "no-store" } });
}
