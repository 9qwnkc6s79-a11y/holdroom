import { mkdirSync, readFileSync, existsSync, writeFileSync, readdirSync } from "fs";
import path from "path";
import { imageAssetPassage, isAcceptedFilename, kindFromFilename, REJECT_COPY } from "./files";
import { HQ_OPS, LITTLE_ELM, PROSPER, roomLabel } from "./rooms";
import type { LibraryFile, Room, RoomId, Seat, Source } from "./types";

export interface Chunk {
  id: string;
  roomId: RoomId;
  file: string;
  text: string;
}

interface DiskState {
  rooms: Room[];
  chunks: Chunk[];
  seats: Seat[];
}

const DATA = path.join(process.cwd(), "data");
const STATE = path.join(DATA, "state.json");
const UPLOADS = path.join(DATA, "uploads");

function seedDir() {
  return path.join(process.cwd(), "seed");
}

function emptyRooms(): Room[] {
  return [
    {
      id: LITTLE_ELM,
      name: "Little Elm",
      isolation: "Retrieval stays in Little Elm. Prosper and HQ files are not visible here.",
      files: [],
    },
    {
      id: PROSPER,
      name: "Prosper",
      isolation: "Retrieval stays in Prosper. Little Elm and HQ files are not visible here.",
      files: [],
    },
    {
      id: HQ_OPS,
      name: "HQ / Ops",
      isolation: "Retrieval stays in HQ / Ops. Store rooms are not searched from here.",
      files: [],
    },
  ];
}

function defaultSeats(): Seat[] {
  return [
    {
      id: "s-daniel",
      name: "Daniel",
      role: "Partner",
      rooms: [LITTLE_ELM, PROSPER, HQ_OPS],
      device: "Daniel Mac",
    },
    {
      id: "s-rafael",
      name: "Rafael",
      role: "Admin",
      rooms: [LITTLE_ELM],
      device: "Little Elm iPad",
    },
    {
      id: "s-heath",
      name: "Heath",
      role: "Admin",
      rooms: [PROSPER],
      device: "Prosper iPad",
    },
  ];
}

function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  const size = 700;
  const overlap = 80;
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += size - overlap) {
    out.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return out;
}

function ingestSeedFile(roomId: RoomId, filename: string, body: string, kind: LibraryFile["kind"]): { file: LibraryFile; chunks: Chunk[] } {
  const file: LibraryFile = {
    id: `seed-${roomId}-${filename}`,
    name: filename,
    kind,
    status: "ready",
    progress: 100,
    roomId,
    demo: true,
  };
  const texts = kind === "Image" ? [imageAssetPassage(filename)] : chunkText(body);
  const chunks = texts.map((text, i) => ({
    id: `${file.id}-${i}`,
    roomId,
    file: filename,
    text,
  }));
  return { file, chunks };
}

function loadSeed(): DiskState {
  const rooms = emptyRooms();
  const chunks: Chunk[] = [];
  const root = seedDir();
  if (!existsSync(root)) return { rooms, chunks, seats: defaultSeats() };

  for (const room of rooms) {
    const dir = path.join(root, room.id);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const kind = kindFromFilename(name);
      let body = "";
      try {
        if (kind === "Image") body = "";
        else if (kind === "PDF") {
          const raw = readFileSync(full, "latin1");
          const strings = [...raw.matchAll(/\(([^)]{8,})\)/g)].map((m) => m[1]).join(" ");
          body = strings.trim() || `PDF uploaded: ${name}. Keep a markdown copy for Ask.`;
        } else {
          body = readFileSync(full, "utf8");
        }
      } catch {
        body = "";
      }
      const rec = ingestSeedFile(room.id, name, body, kind);
      room.files.push(rec.file);
      chunks.push(...rec.chunks);
    }
  }

  /* Store-facing copies of company docs so a GM can Ask from their room. */
  const hqLoyalty = path.join(root, "hq-ops", "DEMO_loyalty.md");
  const hqCater = path.join(root, "hq-ops", "DEMO_catering_protocol.md");
  for (const id of [LITTLE_ELM, PROSPER]) {
    const room = rooms.find((r) => r.id === id);
    if (!room) continue;
    for (const src of [hqLoyalty, hqCater]) {
      if (!existsSync(src)) continue;
      const name = path.basename(src);
      if (room.files.some((f) => f.name === name)) continue;
      const rec = ingestSeedFile(id, name, readFileSync(src, "utf8"), "Markdown");
      rec.file.id = `seed-${id}-${name}`;
      rec.chunks.forEach((c) => {
        c.id = `${rec.file.id}-${c.file}-${c.text.length}`;
        c.roomId = id;
      });
      room.files.push(rec.file);
      chunks.push(...rec.chunks);
    }
  }

  return { rooms, chunks, seats: defaultSeats() };
}

function ensure() {
  mkdirSync(DATA, { recursive: true });
  mkdirSync(UPLOADS, { recursive: true });
  if (!existsSync(STATE)) {
    writeFileSync(STATE, JSON.stringify(loadSeed(), null, 2));
  }
}

function readState(): DiskState {
  ensure();
  try {
    const state = JSON.parse(readFileSync(STATE, "utf8")) as DiskState;
    const ids = (state.rooms || []).map((r) => r.id);
    if (!ids.includes(LITTLE_ELM) || !ids.includes(PROSPER)) {
      const fresh = loadSeed();
      writeFileSync(STATE, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    return state;
  } catch {
    const fresh = loadSeed();
    writeFileSync(STATE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function writeState(state: DiskState) {
  ensure();
  writeFileSync(STATE, JSON.stringify(state, null, 2));
}

export function listRooms(): Room[] {
  return readState().rooms;
}

export function listSeats(): Seat[] {
  return readState().seats;
}

export function filesIn(roomId: RoomId): LibraryFile[] {
  return readState().rooms.find((r) => r.id === roomId)?.files || [];
}

export function retrieve(roomId: RoomId, query: string, limit = 4): Source[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "what", "does", "this", "that"].includes(t));
  const room = roomLabel(roomId);
  return readState()
    .chunks.filter((c) => c.roomId === roomId)
    .map((c) => {
      const hay = `${c.file} ${c.text}`.toLowerCase();
      const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { c, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ c }) => ({
      file: c.file,
      room,
      snippet: c.text.slice(0, 700).trim(),
    }));
}

export function persistUpload(input: {
  roomId: RoomId;
  filename: string;
  body: Buffer;
}): { file: LibraryFile; error?: string } {
  const state = readState();
  const room = state.rooms.find((r) => r.id === input.roomId);
  if (!room) {
    return {
      file: {
        id: "x",
        name: input.filename,
        kind: "Office",
        status: "failed",
        progress: 0,
        error: "Unknown room.",
        roomId: input.roomId,
      },
    };
  }
  if (!isAcceptedFilename(input.filename)) {
    const file: LibraryFile = {
      id: `up-${Date.now()}`,
      name: input.filename,
      kind: kindFromFilename(input.filename),
      status: "failed",
      progress: 0,
      error: REJECT_COPY,
      roomId: input.roomId,
    };
    room.files.unshift(file);
    writeState(state);
    return { file, error: REJECT_COPY };
  }

  const kind = kindFromFilename(input.filename);
  const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const dest = path.join(UPLOADS, input.roomId);
  mkdirSync(dest, { recursive: true });
  writeFileSync(path.join(dest, `${id}-${input.filename}`), input.body);

  let text = "";
  if (kind === "Image") text = imageAssetPassage(input.filename);
  else if (kind === "PDF") {
    const raw = input.body.toString("latin1");
    const strings = [...raw.matchAll(/\(([^)]{8,})\)/g)].map((m) => m[1]).join(" ");
    text = strings.trim() || `PDF uploaded: ${input.filename}. Text extract is limited in this dry-run — keep a markdown copy for Ask.`;
  } else {
    text = input.body.toString("utf8");
  }

  const file: LibraryFile = {
    id,
    name: input.filename,
    kind,
    status: "ready",
    progress: 100,
    roomId: input.roomId,
  };
  room.files.unshift(file);
  chunkText(text).forEach((part, i) => {
    state.chunks.push({ id: `${id}-${i}`, roomId: input.roomId, file: input.filename, text: part });
  });
  writeState(state);
  return { file };
}

export function removeFile(roomId: RoomId, fileId: string) {
  const state = readState();
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return;
  const file = room.files.find((f) => f.id === fileId);
  room.files = room.files.filter((f) => f.id !== fileId);
  if (file) state.chunks = state.chunks.filter((c) => !(c.roomId === roomId && c.file === file.name));
  writeState(state);
}

export function resetSeed() {
  if (existsSync(STATE)) {
    writeFileSync(STATE, JSON.stringify(loadSeed(), null, 2));
  }
}
