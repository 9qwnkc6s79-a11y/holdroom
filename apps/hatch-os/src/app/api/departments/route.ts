import { NextResponse } from "next/server";
import { ENTERPRISE, uxIsolation } from "@/lib/departments";
import { filesIn, listDepartments, listFolders, listHandoffs } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const departments = listDepartments();
  const enterpriseFiles = filesIn(ENTERPRISE);
  return NextResponse.json(
    {
      departments: departments.map((dept) => ({
        ...dept,
        fileCount: dept.files.length,
        folders: listFolders(dept.id),
      })),
      enterprise: {
        id: ENTERPRISE,
        name: "Enterprise",
        kind: "enterprise",
        isolation: uxIsolation(ENTERPRISE),
        files: enterpriseFiles,
        fileCount: enterpriseFiles.length,
        folders: listFolders(),
      },
      handoffs: listHandoffs(),
      firmWideRead: true,
      writeAcl: "user-departments",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
