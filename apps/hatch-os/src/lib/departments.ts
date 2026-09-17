import type { DepartmentId } from "./types";

export const LITTLE_ELM = "little-elm";
export const PROSPER = "prosper";
export const HQ_OPS = "hq-ops";
export const ENTERPRISE = "enterprise";

export const DEPARTMENT_IDS = [LITTLE_ELM, PROSPER, HQ_OPS] as const;
export const ALL_WORKSPACES = [ENTERPRISE, LITTLE_ELM, PROSPER, HQ_OPS] as const;

/** @deprecated use DEPARTMENT_IDS */
export const ALL_ROOMS = DEPARTMENT_IDS;

export function migrateWorkspaceId(id: string): DepartmentId {
  if (id === "fund-a" || id === "matter-alpha") return LITTLE_ELM;
  if (id === "fund-b" || id === "matter-beta") return PROSPER;
  if (id === "firm" || id === "hq") return id === "hq" ? HQ_OPS : ENTERPRISE;
  if (id === "enterprise") return ENTERPRISE;
  return id;
}

/** @deprecated use migrateWorkspaceId */
export const migrateRoomId = migrateWorkspaceId;

export function isEnterprise(id: string): boolean {
  return migrateWorkspaceId(id) === ENTERPRISE;
}

export function isDepartment(id: string): boolean {
  const rid = migrateWorkspaceId(id);
  return rid === LITTLE_ELM || rid === PROSPER || rid === HQ_OPS || (!isEnterprise(rid) && Boolean(rid));
}

export function workspaceLabel(id: string): string {
  const rid = migrateWorkspaceId(id);
  if (rid === ENTERPRISE) return "Enterprise";
  if (rid === LITTLE_ELM) return "Little Elm";
  if (rid === PROSPER) return "Prosper";
  if (rid === HQ_OPS) return "HQ Ops";
  return id;
}

/** @deprecated use workspaceLabel */
export const roomLabel = workspaceLabel;

export function belongsToDepartment(sourceRoom: string, departmentId: string): boolean {
  const room = sourceRoom.toLowerCase();
  const id = migrateWorkspaceId(departmentId);
  if (id === ENTERPRISE) return true;
  if (id === LITTLE_ELM) return room.includes("little elm") || room === "little-elm";
  if (id === PROSPER) return room.includes("prosper") || room === "prosper";
  if (id === HQ_OPS) return room.includes("hq") || room.includes("ops") || room === "hq-ops";
  return room === id.toLowerCase();
}

/** @deprecated use belongsToDepartment */
export const belongsToRoom = belongsToDepartment;

export function uxIsolation(id: string): string {
  const rid = migrateWorkspaceId(id);
  if (rid === ENTERPRISE) {
    return "Firm-wide workspace. Files and Library show every department plus HQ. Ask may use firm-wide knowledge. Writes still follow your department membership.";
  }
  if (rid === LITTLE_ELM) {
    return "UX space for the Little Elm store team. Chat, Files, and Library are this department’s. Ask may use firm-wide knowledge. Writes stay in departments you can open.";
  }
  if (rid === PROSPER) {
    return "UX space for the Prosper store team. Chat, Files, and Library are this department’s. Ask may use firm-wide knowledge. Writes stay in departments you can open.";
  }
  if (rid === HQ_OPS) {
    return "UX space for HQ Ops. Chat, Files, and Library are this department’s. Ask may use firm-wide knowledge. Writes stay in departments you can open.";
  }
  return "UX space for this department. Ask may use firm-wide knowledge. Writes stay in departments you can open.";
}
