import { MATTER_ALPHA, MATTER_BETA, migrateRoomId } from "./rooms";
import type { AuthMethod, RoomId } from "./types";

const PREFIX = "hatch_os_";

export const KEYS = {
  paired: `${PREFIX}paired`,
  device: `${PREFIX}device`,
  method: `${PREFIX}method`,
  role: `${PREFIX}role`,
  rooms: `${PREFIX}rooms`,
  room: `${PREFIX}room`,
} as const;

function migrateRooms(ids: RoomId[]): RoomId[] {
  return ids.map(migrateRoomId);
}

export function readSession() {
  if (typeof window === "undefined") return null;
  if (localStorage.getItem(KEYS.paired) !== "1") return null;
  const roomsRaw = localStorage.getItem(KEYS.rooms);
  let rooms: RoomId[] = [MATTER_ALPHA, MATTER_BETA];
  try {
    if (roomsRaw) rooms = migrateRooms(JSON.parse(roomsRaw) as RoomId[]);
  } catch {
    rooms = [MATTER_ALPHA, MATTER_BETA];
  }
  return {
    deviceName: localStorage.getItem(KEYS.device) || "This browser",
    method: (localStorage.getItem(KEYS.method) as AuthMethod) || "totp",
    role: (localStorage.getItem(KEYS.role) as "Partner" | "Associate") || "Partner",
    rooms,
  };
}

export function writeSession(input: {
  deviceName: string;
  method: AuthMethod;
  role: "Partner" | "Associate";
  rooms: RoomId[];
}) {
  localStorage.setItem(KEYS.paired, "1");
  localStorage.setItem(KEYS.device, input.deviceName);
  localStorage.setItem(KEYS.method, input.method);
  localStorage.setItem(KEYS.role, input.role);
  localStorage.setItem(KEYS.rooms, JSON.stringify(migrateRooms(input.rooms)));
}

export function clearSession() {
  localStorage.removeItem(KEYS.paired);
  localStorage.removeItem(KEYS.device);
  localStorage.removeItem(KEYS.method);
  localStorage.removeItem(KEYS.role);
  localStorage.removeItem(KEYS.rooms);
}

export function readRoom(): RoomId {
  if (typeof window === "undefined") return MATTER_ALPHA;
  return migrateRoomId(localStorage.getItem(KEYS.room) || MATTER_ALPHA);
}

export function writeRoom(id: RoomId) {
  localStorage.setItem(KEYS.room, migrateRoomId(id));
}
