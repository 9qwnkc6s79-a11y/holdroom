import { NextResponse } from "next/server";
import { defaultEthics, loadEthics, normalizeEthics, resetEthics, saveEthics, type EthicsProfile } from "@/lib/ethics";
import { requireSession } from "@/lib/session-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const profile = await loadEthics(auth.session.scope, url.searchParams.get("agentId") || undefined);
  return NextResponse.json({ profile, defaults: defaultEthics() });
}

export async function PUT(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { scope?: string; agentId?: string; profile?: Partial<EthicsProfile>; reset?: boolean } | null;
  const scope = auth.session.scope;
  if (body?.reset) {
    await resetEthics(scope, body.agentId);
    return NextResponse.json({ profile: await loadEthics(scope, body.agentId) });
  }
  const profile = normalizeEthics(body?.profile);
  await saveEthics(scope, profile, body?.agentId);
  return NextResponse.json({ profile: await loadEthics(scope, body?.agentId) });
}
