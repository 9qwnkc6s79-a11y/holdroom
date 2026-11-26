import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session-auth";
import { registerPushToken } from "@/lib/routines/push";

export const dynamic = "force-dynamic";

/** The iPhone app posts its Expo push token here (once the app ships expo-notifications). */
export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { token?: string; device?: string } | null;
  const result = await registerPushToken(auth.session.scope, String(body?.token || ""), body?.device);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
