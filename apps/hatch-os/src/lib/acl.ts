import { DEPARTMENT_IDS, ENTERPRISE, isEnterprise, migrateWorkspaceId, workspaceLabel } from "./departments";
import type { DepartmentId } from "./types";

export function normalizeDepartments(ids: string[] | undefined | null): DepartmentId[] {
  const seen = new Set<DepartmentId>();
  for (const raw of ids || []) {
    const id = migrateWorkspaceId(raw);
    if (!id || isEnterprise(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

export function canOpenWorkspace(input: {
  departmentId: string;
  accessibleDepartments: string[];
  enterprise?: boolean;
}): boolean {
  const id = migrateWorkspaceId(input.departmentId);
  if (isEnterprise(id)) return Boolean(input.enterprise);
  return normalizeDepartments(input.accessibleDepartments).includes(id);
}

/** Writes are never firm-wide. Enterprise is a view, not a write target. */
export function canWriteDepartment(input: {
  departmentId: string;
  accessibleDepartments: string[];
}): { ok: true; departmentId: DepartmentId } | { ok: false; error: string } {
  const id = migrateWorkspaceId(input.departmentId);
  if (isEnterprise(id) || id === ENTERPRISE) {
    return {
      ok: false,
      error:
        "Enterprise is a firm-wide view, not a write target. Pick Little Elm, Prosper, or HQ Ops — or hand off to that department.",
    };
  }
  const allowed = normalizeDepartments(input.accessibleDepartments);
  if (!allowed.includes(id)) {
    const names = allowed.length ? allowed.map(workspaceLabel).join(", ") : "none";
    return {
      ok: false,
      error: `Write denied in ${workspaceLabel(id)}. You can write in: ${names}. Use handoff_to_department — do not silently edit another department’s Files.`,
    };
  }
  return { ok: true, departmentId: id };
}

export function knownDepartmentId(id: string): boolean {
  const rid = migrateWorkspaceId(id);
  return (DEPARTMENT_IDS as readonly string[]).includes(rid);
}

export function writeDeniedHandoffHint(departmentId: string): string {
  return `Handoff to ${workspaceLabel(departmentId)} instead of writing their Files.`;
}
