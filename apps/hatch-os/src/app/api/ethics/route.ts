import { NextResponse } from "next/server";
import { defaultEthics, loadEthics, normalizeEthics, resetEthics, saveEthics, type EthicsProfile } from "@/lib/ethics";

export const dynamic = "force-dynamic";

function scopeOf(req: Request, body?: { scope?: string }) {
  return body?.scope || req.headers.get("x-hatch-tester") || "staff";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const profile = await loadEthics(scopeOf(req), url.searchParams.get("agentId") || undefined);
  return NextResponse.json({ profile, defaults: defaultEthics() });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as { scope?: string; agentId?: string; profile?: Partial<EthicsProfile>; reset?: boolean } | null;
  const scope = scopeOf(req, body || undefined);
  if (body?.reset) {
    await resetEthics(scope, body.agentId);
    return NextResponse.json({ profile: await loadEthics(scope, body.agentId) });
  }
  const profile = normalizeEthics(body?.profile);
  await saveEthics(scope, profile, body?.agentId);
  return NextResponse.json({ profile: await loadEthics(scope, body?.agentId) });
}
