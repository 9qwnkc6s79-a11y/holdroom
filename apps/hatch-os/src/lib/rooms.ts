import type { RoomId } from "./types";

export const MATTER_ALPHA = "matter-alpha";
export const MATTER_BETA = "matter-beta";

export function migrateRoomId(id: string): RoomId {
  if (id === "fund-a") return MATTER_ALPHA;
  if (id === "fund-b") return MATTER_BETA;
  return id;
}

export function roomLabel(id: string): string {
  if (id === MATTER_ALPHA || id === "fund-a") return "Matter Alpha";
  if (id === MATTER_BETA || id === "fund-b") return "Matter Beta";
  return id;
}

export function belongsToRoom(sourceRoom: string, roomId: string): boolean {
  const room = sourceRoom.toLowerCase();
  const id = migrateRoomId(roomId);
  if (id === MATTER_ALPHA) {
    return (
      room.includes("matter alpha") ||
      room === "matter-alpha" ||
      room.includes("fund a") ||
      room === "fund-a" ||
      (room.includes("alpha") && !room.includes("beta"))
    );
  }
  if (id === MATTER_BETA) {
    return (
      room.includes("matter beta") ||
      room === "matter-beta" ||
      room.includes("fund b") ||
      room === "fund-b" ||
      (room.includes("beta") && !room.includes("alpha"))
    );
  }
  return room === id.toLowerCase();
}
