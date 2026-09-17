import { NextResponse } from "next/server";
import { LITTLE_ELM, migrateWorkspaceId } from "@/lib/departments";
import { createThread, listThreads, updateThread } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const departmentId = new URL(req.url).searchParams.get("department");
  return NextResponse.json(
    { threads: listThreads(departmentId ? migrateWorkspaceId(departmentId) : undefined) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    departmentId?: string;
    title?: string;
  } | null;
  const thread = createThread(migrateWorkspaceId(body?.departmentId || LITTLE_ELM), body?.title || "New thread");
  return NextResponse.json({ thread });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    title?: string;
    archived?: boolean;
  } | null;
  if (!body?.id) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
  const thread = updateThread(body.id, { title: body.title, archived: body.archived });
  if (!thread) return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
  return NextResponse.json({ thread });
}
