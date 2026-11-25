import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { NORTH_DESK, migrateWorkspaceId } from "@/lib/departments";
import { mirrorVisionJpeg } from "@/lib/image-cache";
import { toVisionJpeg } from "@/lib/image-bytes";
import { isRasterImage } from "@/lib/images";
import { persistUpload, removeFile, setLibraryFlag } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const departmentId = migrateWorkspaceId(String(form.get("departmentId") || form.get("roomId") || NORTH_DESK));
    const inLibrary = String(form.get("inLibrary") || "") === "1" || String(form.get("inLibrary") || "") === "true";
    const folderId = String(form.get("folderId") || "") || null;
    const accessible = String(form.get("accessibleDepartments") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const result = persistUpload({
      departmentId,
      filename: file.name,
      body: buf,
      inLibrary,
      folderId,
      accessibleDepartments: accessible.length ? accessible : undefined,
    });
    if (result.file?.id && result.file.kind === "Image" && isRasterImage(file.name, file.type || "")) {
      try {
        const jpeg = await toVisionJpeg(buf);
        await mirrorVisionJpeg(result.file.id, jpeg);
      } catch {
        /* Chat can still send a data URL from the browser, or read the original file. */
      }
    }
    return NextResponse.json(result);
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    roomId?: string;
    departmentId?: string;
    text?: string;
    action?: string;
    fileId?: string;
    inLibrary?: boolean;
    folderId?: string | null;
    accessibleDepartments?: string[];
  } | null;

  const departmentId = migrateWorkspaceId(body?.departmentId || body?.roomId || NORTH_DESK);
  if (body?.action === "delete" && body.fileId) {
    removeFile(departmentId, body.fileId);
    return NextResponse.json({ ok: true });
  }
  if ((body?.action === "promote" || body?.action === "library") && body.fileId) {
    const file = setLibraryFlag(departmentId, body.fileId, body.inLibrary !== false);
    return NextResponse.json({ ok: Boolean(file), file });
  }
  if (body?.action === "unlibrary" && body.fileId) {
    const file = setLibraryFlag(departmentId, body.fileId, false);
    return NextResponse.json({ ok: Boolean(file), file });
  }

  const filename = body?.filename || "";
  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }
  const result = persistUpload({
    departmentId,
    filename,
    body: Buffer.from(body?.text || "", "utf8"),
    inLibrary: Boolean(body?.inLibrary),
    folderId: body?.folderId,
    accessibleDepartments: body?.accessibleDepartments,
  });
  return NextResponse.json(result);
}
