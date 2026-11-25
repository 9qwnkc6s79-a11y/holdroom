import { NextResponse } from "next/server";
import { clearSessionCookie, requireSession } from "@/lib/session-auth";
import { deleteAccountScope } from "@/lib/thread-store";

export const dynamic = "force-dynamic";

async function handleDelete(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const result = await deleteAccountScope(auth.session.scope);
  const res = NextResponse.json(
    { ok: true, deleted: true, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
  clearSessionCookie(res, req.url);
  return res;
}

export async function DELETE(req: Request) {
  return handleDelete(req);
}

export async function POST(req: Request) {
  return handleDelete(req);
}
