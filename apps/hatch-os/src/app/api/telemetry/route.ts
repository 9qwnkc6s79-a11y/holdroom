import { saveRecord } from "@/lib/beta-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { kind?: string; code?: string } | null;
  const kind = body?.kind === "session" || body?.kind === "error" ? body.kind : "";
  if (!kind) return Response.json({ ok: false }, { status: 400 });
  const day = new Date().toISOString().slice(0, 10);
  void saveRecord(`events/${day}`, `${Date.now()}-${kind}`, {
    kind,
    code: (body?.code || "staff").slice(0, 40),
    at: new Date().toISOString(),
  }).catch(() => undefined);
  return Response.json({ ok: true });
}
