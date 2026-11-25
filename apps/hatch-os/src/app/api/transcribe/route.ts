import { requireSession } from "@/lib/session-auth";
import { demoModeEnabled } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** On-box Whisper stand-in. Audio is not stored and not sent to a public lab. */
export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "No audio." }, { status: 400 });
  }
  if (demoModeEnabled()) {
    return Response.json({
      text: "",
      stub: true,
      note: "Hatch’s speech service is not connected on this host. Audio was not sent to another company.",
    });
  }
  return Response.json({
    text: "",
    stub: true,
    note: "Hatch’s speech service is not connected on this host. Audio was not sent to another company.",
  });
}
