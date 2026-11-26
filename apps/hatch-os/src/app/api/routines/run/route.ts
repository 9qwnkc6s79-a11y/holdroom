import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session-auth";
import { routinesPayload } from "@/lib/routines/api";
import { advanceScope, defaultDeps, emptyReport, processScope } from "@/lib/routines/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Run now". Agent runs may wake the GPU; the screen then polls /api/routines/advance. */
export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  if (auth.session.appReview) return NextResponse.json({ error: "Routines do not run in the review account." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "Missing routine." }, { status: 400 });
  const deps = await defaultDeps();
  const report = emptyReport();
  const runs = await processScope(auth.session.scope, deps, report, body.id);
  if (!runs.length) return NextResponse.json({ error: "Unknown routine." }, { status: 404 });
  await advanceScope(auth.session.scope, deps, report, { deadline: Date.now() + 20_000, rounds: 1 });
  return NextResponse.json({ run: runs[0], ...(await routinesPayload(auth.session.scope)) }, { headers: { "Cache-Control": "no-store" } });
}
