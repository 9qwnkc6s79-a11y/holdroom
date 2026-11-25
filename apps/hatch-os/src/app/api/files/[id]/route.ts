import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { readFileRecord } from "@/lib/store";
import { loadUploadScoped } from "@/lib/thread-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const fileId = decodeURIComponent(id);
  let rec = readFileRecord(fileId);
  if (!rec) {
    await loadUploadScoped(auth.session.scope, fileId);
    rec = readFileRecord(fileId);
  }
  if (!rec) return NextResponse.json({ error: "Unknown file." }, { status: 404 });
  return NextResponse.json(
    { file: rec.file, text: rec.text },
    { headers: { "Cache-Control": "no-store" } },
  );
}
