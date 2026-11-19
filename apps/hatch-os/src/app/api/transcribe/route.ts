import { demoModeEnabled } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** On-box Whisper stand-in. Audio is not stored and not sent to a public lab. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "No audio." }, { status: 400 });
  }
  if (demoModeEnabled()) {
    return Response.json({
      text: "Voice note.",
      stub: true,
      note: "Demo mode. Whisper is not connected on this box.",
    });
  }
  return Response.json({
    text: "",
    stub: true,
    note: "Whisper is not connected on this box yet. Dictation uses the phone’s speech service when it is available.",
  });
}
