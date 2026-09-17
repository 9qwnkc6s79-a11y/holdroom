import { ENTERPRISE, HQ_OPS, LITTLE_ELM, PROSPER, isEnterprise, migrateWorkspaceId } from "./departments";
import type { AuthMethod, DepartmentId } from "./types";

const PREFIX = "hatch_os_";

export const KEYS = {
  paired: `${PREFIX}paired`,
  device: `${PREFIX}device`,
  method: `${PREFIX}method`,
  role: `${PREFIX}role`,
  rooms: `${PREFIX}rooms`,
  room: `${PREFIX}room`,
  enterprise: `${PREFIX}enterprise`,
  home: `${PREFIX}home`,
  thread: `${PREFIX}thread`,
  threads: `${PREFIX}threads`,
} as const;

const DEFAULT_DEPARTMENTS: DepartmentId[] = [LITTLE_ELM, PROSPER, HQ_OPS];

function migrateDepartments(ids: DepartmentId[]): DepartmentId[] {
  return ids.map(migrateWorkspaceId).filter((id) => !isEnterprise(id));
}

export function readSession() {
  if (typeof window === "undefined") return null;
  if (localStorage.getItem(KEYS.paired) !== "1") return null;
  const roomsRaw = localStorage.getItem(KEYS.rooms);
  let departments: DepartmentId[] = DEFAULT_DEPARTMENTS;
  try {
    if (roomsRaw) departments = migrateDepartments(JSON.parse(roomsRaw) as DepartmentId[]);
  } catch {
    departments = DEFAULT_DEPARTMENTS;
  }
  const role = (localStorage.getItem(KEYS.role) as "Partner" | "Associate") || "Partner";
  const enterpriseStored = localStorage.getItem(KEYS.enterprise);
  const enterprise = enterpriseStored == null ? role === "Partner" : enterpriseStored === "1";
  const homeDepartment = migrateWorkspaceId(
    localStorage.getItem(KEYS.home) || (role === "Partner" ? HQ_OPS : departments[0] || LITTLE_ELM),
  );
  return {
    deviceName: localStorage.getItem(KEYS.device) || "This browser",
    method: (localStorage.getItem(KEYS.method) as AuthMethod) || "totp",
    role,
    departments,
    rooms: departments,
    enterprise,
    homeDepartment: isEnterprise(homeDepartment) ? HQ_OPS : homeDepartment,
  };
}

export function writeSession(input: {
  deviceName: string;
  method: AuthMethod;
  role: "Partner" | "Associate";
  departments?: DepartmentId[];
  rooms?: DepartmentId[];
  enterprise?: boolean;
  homeDepartment?: DepartmentId;
}) {
  const departments = migrateDepartments(input.departments || input.rooms || DEFAULT_DEPARTMENTS);
  const enterprise = input.enterprise ?? input.role === "Partner";
  localStorage.setItem(KEYS.paired, "1");
  localStorage.setItem(KEYS.device, input.deviceName);
  localStorage.setItem(KEYS.method, input.method);
  localStorage.setItem(KEYS.role, input.role);
  localStorage.setItem(KEYS.rooms, JSON.stringify(departments));
  localStorage.setItem(KEYS.enterprise, enterprise ? "1" : "0");
  localStorage.setItem(
    KEYS.home,
    migrateWorkspaceId(input.homeDepartment || departments[0] || LITTLE_ELM),
  );
}

export function clearSession() {
  localStorage.removeItem(KEYS.paired);
  localStorage.removeItem(KEYS.device);
  localStorage.removeItem(KEYS.method);
  localStorage.removeItem(KEYS.role);
  localStorage.removeItem(KEYS.rooms);
  localStorage.removeItem(KEYS.enterprise);
  localStorage.removeItem(KEYS.home);
}

export function readWorkspace(): DepartmentId {
  if (typeof window === "undefined") return LITTLE_ELM;
  return migrateWorkspaceId(localStorage.getItem(KEYS.room) || LITTLE_ELM);
}

export function writeWorkspace(id: DepartmentId) {
  localStorage.setItem(KEYS.room, migrateWorkspaceId(id));
}

/** @deprecated use readWorkspace */
export const readRoom = readWorkspace;
/** @deprecated use writeWorkspace */
export const writeRoom = writeWorkspace;

export function readThreadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.threads);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function writeThreadForWorkspace(workspaceId: DepartmentId, threadId: string) {
  const next = { ...readThreadMap(), [migrateWorkspaceId(workspaceId)]: threadId };
  localStorage.setItem(KEYS.threads, JSON.stringify(next));
  localStorage.setItem(KEYS.thread, threadId);
}

export function readThreadForWorkspace(workspaceId: DepartmentId): string | null {
  return readThreadMap()[migrateWorkspaceId(workspaceId)] || localStorage.getItem(KEYS.thread);
}

export function landingWorkspace(session: {
  enterprise: boolean;
  homeDepartment: DepartmentId;
  departments: DepartmentId[];
}): DepartmentId {
  const last = readWorkspace();
  if (isEnterprise(last) && session.enterprise) return ENTERPRISE;
  if (session.departments.includes(last)) return last;
  if (session.enterprise) return ENTERPRISE;
  return session.homeDepartment || session.departments[0] || LITTLE_ELM;
}
