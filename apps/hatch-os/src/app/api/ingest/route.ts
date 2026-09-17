import { NextResponse } from "next/server";
import { ragIngest } from "@/lib/adapters";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    roomId?: string;
  } | null;
  const filename = body?.filename || "";
  const roomId = body?.roomId || "fund-a";
  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  const ok = /\.(pdf|docx?|xlsx?|md|txt)$/i.test(filename);
  if (!ok) {
    return NextResponse.json({
      roomId,
      filename,
      status: "failed",
      error: "Could not read this file — try PDF or ask Admin.",
      rag: false,
    });
  }

  const rag = await ragIngest(filename);
  return NextResponse.json({
    roomId,
    filename,
    status: "queued",
    rag,
    note: "Extract, chunk, and embed stay on this box. Hatch support does not receive a copy.",
  });
}
