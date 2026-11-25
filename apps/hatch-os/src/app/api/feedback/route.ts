import { requireSession } from "@/lib/session-auth";
import { saveRecord } from "@/lib/beta-store";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    text?: string;
    screenshot?: string;
    page?: string;
    agent?: string;
    testerLabel?: string;
    inviteCode?: string;
    ua?: string;
    errors?: string[];
  } | null;
  const text = (body?.text || "").trim();
  if (!text) return Response.json({ error: "Write a note first." }, { status: 400 });
  if (text.length > 4000) return Response.json({ error: "That note is too long." }, { status: 400 });
  const shot = typeof body?.screenshot === "string" && body.screenshot.startsWith("data:image/") && body.screenshot.length < 700_000
    ? body.screenshot
    : "";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await saveRecord("feedback", id, {
      id,
      text,
      screenshot: shot,
      page: (body?.page || "").slice(0, 200),
      agent: (body?.agent || "").slice(0, 80),
      testerLabel: (body?.testerLabel || "").slice(0, 80),
      inviteCode: (body?.inviteCode || "").slice(0, 40),
      ua: (body?.ua || "").slice(0, 300),
      errors: Array.isArray(body?.errors) ? body.errors.map((item) => String(item).slice(0, 300)).slice(0, 10) : [],
      version: APP_VERSION,
      at: new Date().toISOString(),
    });
  } catch {
    return Response.json({ error: "Feedback could not be saved. Try again in a moment." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
