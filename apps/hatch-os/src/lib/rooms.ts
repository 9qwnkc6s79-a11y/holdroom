import type { RoomId } from "./types";

export const LITTLE_ELM = "little-elm";
export const PROSPER = "prosper";
export const HQ_OPS = "hq-ops";

export const ALL_ROOMS = [LITTLE_ELM, PROSPER, HQ_OPS] as const;

export function migrateRoomId(id: string): RoomId {
  if (id === "fund-a" || id === "matter-alpha") return LITTLE_ELM;
  if (id === "fund-b" || id === "matter-beta") return PROSPER;
  return id;
}

export function roomLabel(id: string): string {
  const rid = migrateRoomId(id);
  if (rid === LITTLE_ELM) return "Little Elm";
  if (rid === PROSPER) return "Prosper";
  if (rid === HQ_OPS) return "HQ / Ops";
  return id;
}

export function belongsToRoom(sourceRoom: string, roomId: string): boolean {
  const room = sourceRoom.toLowerCase();
  const id = migrateRoomId(roomId);
  if (id === LITTLE_ELM) {
    return room.includes("little elm") || room === "little-elm";
  }
  if (id === PROSPER) {
    return room.includes("prosper") || room === "prosper";
  }
  if (id === HQ_OPS) {
    return room.includes("hq") || room.includes("ops") || room === "hq-ops";
  }
  return room === id.toLowerCase();
}
