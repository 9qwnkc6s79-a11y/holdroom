import { NextResponse } from "next/server";
import { persistUpload, removeFile } from "@/lib/store";
import { LITTLE_ELM, migrateRoomId } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const roomId = migrateRoomId(String(form.get("roomId") || LITTLE_ELM));
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const result = persistUpload({ roomId, filename: file.name, body: buf });
    return NextResponse.json(result);
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    roomId?: string;
    text?: string;
    action?: string;
    fileId?: string;
  } | null;

  const roomId = migrateRoomId(body?.roomId || LITTLE_ELM);
  if (body?.action === "delete" && body.fileId) {
    removeFile(roomId, body.fileId);
    return NextResponse.json({ ok: true });
  }

  const filename = body?.filename || "";
  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }
  const result = persistUpload({
    roomId,
    filename,
    body: Buffer.from(body?.text || "", "utf8"),
  });
  return NextResponse.json(result);
}
