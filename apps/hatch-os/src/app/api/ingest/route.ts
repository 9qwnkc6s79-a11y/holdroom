import { NextResponse } from "next/server";
import { ragIngest } from "@/lib/adapters";
import { isAcceptedFilename, isImageFilename, REJECT_COPY } from "@/lib/files";
import { MATTER_ALPHA } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    roomId?: string;
  } | null;
  const filename = body?.filename || "";
  const roomId = body?.roomId || MATTER_ALPHA;
  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  const ok = isAcceptedFilename(filename);
  if (!ok) {
    return NextResponse.json({
      roomId,
      filename,
      status: "failed",
      error: REJECT_COPY,
      rag: false,
    });
  }

  const rag = await ragIngest(filename);
  return NextResponse.json({
    roomId,
    filename,
    status: "queued",
    kind: isImageFilename(filename) ? "Image" : "document",
    rag: isImageFilename(filename) ? false : rag,
    note: isImageFilename(filename)
      ? "Image indexed in this room. OCR is stubbed in this beta (filename + image-asset passage)."
      : "Extract, chunk, and embed stay on this box. Hatch support does not receive a copy.",
  });
}
