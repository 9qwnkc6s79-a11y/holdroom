import { NextResponse } from "next/server";
import { ENTERPRISE, migrateWorkspaceId, workspaceLabel } from "@/lib/departments";
import { listLibraryPassages } from "@/lib/library-passages";
import { requireSession } from "@/lib/session-auth";
import { libraryIn, listDepartments } from "@/lib/store";
import { hydrateUploadsScoped } from "@/lib/thread-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const departmentId = migrateWorkspaceId(url.searchParams.get("department") || url.searchParams.get("room") || ENTERPRISE);
  if (departmentId !== ENTERPRISE && !listDepartments().some((d) => d.id === departmentId)) {
    return NextResponse.json({ error: "Unknown department." }, { status: 404 });
  }
  await hydrateUploadsScoped(auth.session.scope, departmentId);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const rawFiles = libraryIn(departmentId);
  const rawPassages = await listLibraryPassages(auth.session.scope);
  const files = q
    ? rawFiles.filter((f) => [f.name, f.departmentId, f.kind].join(" ").toLowerCase().includes(q))
    : rawFiles;
  const passages = q
    ? rawPassages.filter((p) => [p.title, p.source, p.text].join(" ").toLowerCase().includes(q))
    : rawPassages;
  return NextResponse.json(
    {
      department: workspaceLabel(departmentId),
      files,
      passages,
      firmWideRead: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
