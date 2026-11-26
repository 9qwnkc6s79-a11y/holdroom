import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { defaultDeps, routinesEnabled, runTick } from "@/lib/routines/runner";

export const dynamic = "force-dynamic";
// Polls in-flight model runs until shortly before this limit, so a run that
// needs a second model turn does not wait for the next tick (and a cold GPU).
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (!(process.env.CRON_SECRET || "").trim()) {
    return NextResponse.json({ error: "Routines scheduler is not configured (CRON_SECRET is not set)." }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!routinesEnabled()) return NextResponse.json({ ok: true, skipped: "HATCH_ROUTINES=off" });
  const report = await runTick(await defaultDeps(), { budgetMs: 270_000 });
  return NextResponse.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store" } });
}
