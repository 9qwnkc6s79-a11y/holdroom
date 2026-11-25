import { NextResponse } from "next/server";
import { syncConnector } from "@/lib/connector-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { kind?: string; scope?: string; departmentId?: string } | null;
  const kind = body?.kind === "microsoft" ? "microsoft" : body?.kind === "google" ? "google" : "";
  if (!kind) return NextResponse.json({ error: "Choose Google or Microsoft." }, { status: 400 });
  const scope = body?.scope || req.headers.get("x-hatch-tester") || "";
  if (!scope) return NextResponse.json({ error: "Sign in before syncing." }, { status: 400 });
  const departmentId = body?.departmentId || "hq-ops";
  try {
    const result = await syncConnector(scope, kind, departmentId);
    return NextResponse.json({
      ok: true,
      saved: result.saved,
      accounts: result.accounts,
      detail: result.saved
        ? `Copied ${result.saved} items into your firm’s file room. They are not sent to OpenAI or Anthropic.`
        : "Connected. Nothing new was copied.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not copy into the file room.";
    return NextResponse.json({ error: message.replace(/bearer\s+\S+/gi, "bearer ••••") }, { status: 400 });
  }
}
