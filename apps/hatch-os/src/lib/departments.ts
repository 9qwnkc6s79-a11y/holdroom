import type { DepartmentId } from "./types";

export const NORTH_DESK = "north-desk";
export const SOUTH_DESK = "south-desk";
export const HQ_OPS = "hq-ops";
export const LEGAL = "legal";
export const FINANCE = "finance";
export const ENTERPRISE = "enterprise";

export const DEPARTMENT_IDS = [NORTH_DESK, SOUTH_DESK, HQ_OPS, LEGAL, FINANCE] as const;
export const ALL_WORKSPACES = [ENTERPRISE, NORTH_DESK, SOUTH_DESK, HQ_OPS] as const;

/** @deprecated use DEPARTMENT_IDS */
export const ALL_ROOMS = DEPARTMENT_IDS;

export function migrateWorkspaceId(id: string): DepartmentId {
  if (id === "little-elm" || id === "fund-a" || id === "matter-alpha") return NORTH_DESK;
  if (id === "prosper" || id === "fund-b" || id === "matter-beta") return SOUTH_DESK;
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
  return rid === NORTH_DESK || rid === SOUTH_DESK || rid === HQ_OPS || (!isEnterprise(rid) && Boolean(rid));
}

export function workspaceLabel(id: string): string {
  const rid = migrateWorkspaceId(id);
  if (rid === ENTERPRISE) return "Enterprise";
  if (rid === NORTH_DESK) return "North desk";
  if (rid === SOUTH_DESK) return "South desk";
  if (rid === HQ_OPS) return "Operations";
  if (rid === LEGAL) return "Legal";
  if (rid === FINANCE) return "Finance";
  return id;
}

/** @deprecated use workspaceLabel */
export const roomLabel = workspaceLabel;

export function belongsToDepartment(sourceRoom: string, departmentId: string): boolean {
  const room = sourceRoom.toLowerCase();
  const id = migrateWorkspaceId(departmentId);
  if (id === ENTERPRISE) return true;
  if (id === NORTH_DESK) return room.includes("north") || room.includes("little elm") || room === "little-elm" || room === "north-desk";
  if (id === SOUTH_DESK) return room.includes("south") || room.includes("prosper") || room === "prosper" || room === "south-desk";
  if (id === HQ_OPS) return room.includes("hq") || room.includes("ops") || room === "hq-ops";
  return room === id.toLowerCase();
}

/** @deprecated use belongsToDepartment */
export const belongsToRoom = belongsToDepartment;

export function uxIsolation(id: string): string {
  const rid = migrateWorkspaceId(id);
  if (rid === ENTERPRISE) {
    return "Firm-wide workspace. Files and Library show every department plus Operations. Ask may use firm-wide knowledge. Writes still follow your department membership.";
  }
  if (rid === NORTH_DESK) {
    return "Sample desk. Chat and files here belong to this desk. Ask may use the firm library. Writes stay in desks you can open.";
  }
  if (rid === SOUTH_DESK) {
    return "Sample desk. Chat and files here belong to this desk. Ask may use the firm library. Writes stay in desks you can open.";
  }
  if (rid === HQ_OPS) {
    return "Sample operations desk. Chat and files here belong to this desk.";
  }
  if (rid === LEGAL) {
    return "File room for the Legal agent. Reads may use the firm library. Writes stay in Legal.";
  }
  if (rid === FINANCE) {
    return "File room for the Finance agent. Reads may use the firm library. Writes stay in Finance.";
  }
  return "UX space for this department. Ask may use firm-wide knowledge. Writes stay in departments you can open.";
}
