import { mkdirSync, readFileSync, existsSync, writeFileSync, readdirSync } from "fs";
import path from "path";
import { atomicWriteFile, withFileLock } from "./atomic-json.ts";
import { canWriteDepartment, normalizeDepartments } from "./acl.ts";
import { ENTERPRISE, FINANCE, HQ_OPS, LEGAL, LITTLE_ELM, PROSPER, isEnterprise, migrateWorkspaceId, uxIsolation, workspaceLabel } from "./departments.ts";
import { DRIVE_STUB_ITEMS } from "./drive.ts";
import { imageAssetPassage, isAcceptedFilename, kindFromFilename, REJECT_COPY } from "./files.ts";
import { INITIAL_SEATS } from "./mock-data.ts";
import type {
  AuditEntry,
  ChatMessage,
  ChatThread,
  Department,
  DepartmentId,
  FileFolder,
  FileOrigin,
  Handoff,
  HatchFile,
  Routine,
  Seat,
  Source,
  ToolEvent,
} from "./types.ts";
import { scrubVaultSecrets } from "./vault.ts";
import { iconForAgent } from "./bot-icons.ts";
import { AGENTS, AGENT_COLORS, FIRM_MODEL, type HatchAgent } from "./agents.ts";
import { hatchDataDir } from "./data-dir.ts";

export interface Chunk {
  id: string;
  departmentId: DepartmentId;
  roomId: DepartmentId;
  file: string;
  text: string;
}

interface DiskState {
  version: number;
  rooms: Department[];
  folders: FileFolder[];
  chunks: Chunk[];
  seats: Seat[];
  threads: ChatThread[];
  handoffs: Handoff[];
  audit: AuditEntry[];
  routines: Routine[];
  agents: HatchAgent[];
}

const DATA = hatchDataDir();
const STATE = path.join(DATA, "state.json");
const UPLOADS = path.join(DATA, "uploads");
const STATE_VERSION = 5;

const SEED_FOLDERS: Record<string, string[]> = {
  [LITTLE_ELM]: ["Checklists", "Staff", "Shared from HQ"],
  [PROSPER]: ["Checklists", "Staff", "Shared from HQ"],
  [HQ_OPS]: ["Catering", "Loyalty", "Roster"],
  [LEGAL]: ["Notes"],
  [FINANCE]: ["Notes"],
};

const SEED_FILE_FOLDER: Record<string, string> = {
  "DEMO_open_close_checklist.md": "Checklists",
  "DEMO_north_lead.md": "Staff",
  "DEMO_south_lead.md": "Staff",
  "DEMO_loyalty.md": "Loyalty",
  "DEMO_catering_protocol.md": "Catering",
  "DEMO_catering_onepager.pdf": "Catering",
  "DEMO_gm_roster.md": "Roster",
};

function seedDir() {
  return path.join(process.cwd(), "seed");
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyDepartments(): Department[] {
  return [LITTLE_ELM, PROSPER, HQ_OPS, LEGAL, FINANCE].map((id) => ({
    id,
    name: workspaceLabel(id),
    kind: "department" as const,
    isolation: uxIsolation(id),
    files: [],
  }));
}

function defaultSeats(): Seat[] {
  return INITIAL_SEATS.map((s) => ({ ...s, rooms: [...s.departments] }));
}

function seedFolders(): FileFolder[] {
  const out: FileFolder[] = [];
  for (const [departmentId, names] of Object.entries(SEED_FOLDERS)) {
    for (const name of names) {
      out.push({
        id: `fld-${departmentId}-${name.toLowerCase().replace(/\s+/g, "-")}`,
        name,
        departmentId,
        parentId: null,
      });
    }
  }
  return out;
}

function folderForSeed(departmentId: string, filename: string, folders: FileFolder[]): string | null {
  let folderName = SEED_FILE_FOLDER[filename];
  if (folderName === "Loyalty" || folderName === "Catering" || folderName === "Roster") {
    if (departmentId !== HQ_OPS) folderName = "Shared from HQ";
  }
  return folders.find((f) => f.departmentId === departmentId && f.name === folderName)?.id || null;
}

function normalizeFile(file: Partial<HatchFile> & { name: string }, departmentId: DepartmentId): HatchFile {
  const id = file.id || newId("file");
  const dept = migrateWorkspaceId(file.departmentId || file.roomId || departmentId);
  return {
    id,
    name: file.name,
    kind: file.kind || kindFromFilename(file.name),
    status: file.status || "ready",
    progress: file.progress ?? 100,
    error: file.error,
    departmentId: dept,
    roomId: dept,
    folderId: file.folderId ?? null,
    inLibrary: file.inLibrary !== false,
    demo: file.demo,
    origin: file.origin || (file.demo ? "seed" : "upload"),
    folderPath: file.folderPath,
  };
}

function normalizeSeat(raw: Partial<Seat> & { id: string; name: string }): Seat {
  const departments = normalizeDepartments(raw.departments || raw.rooms || []);
  return {
    id: raw.id,
    name: raw.name,
    role: raw.role || "Associate",
    departments,
    rooms: departments,
    enterprise: raw.enterprise ?? raw.role === "Partner",
    homeDepartment: migrateWorkspaceId(raw.homeDepartment || departments[0] || LITTLE_ELM),
    device: raw.device || "",
    pending: raw.pending,
  };
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

function extractText(kind: HatchFile["kind"], filename: string, body: Buffer | string): string {
  if (kind === "Image") return imageAssetPassage(filename);
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  if (kind === "PDF") {
    const raw = buf.toString("latin1");
    const strings = [...raw.matchAll(/\(([^)]{8,})\)/g)].map((m) => m[1]).join(" ");
    return (
      strings.trim() ||
      `PDF uploaded: ${filename}. Text extract is limited in this dry-run — keep a markdown copy for Ask.`
    );
  }
  return buf.toString("utf8");
}

function ingestSeedFile(
  departmentId: DepartmentId,
  filename: string,
  body: string,
  kind: HatchFile["kind"],
  folderId: string | null,
): { file: HatchFile; chunks: Chunk[] } {
  const file = normalizeFile(
    {
      id: `seed-${departmentId}-${filename}`,
      name: filename,
      kind,
      status: "ready",
      progress: 100,
      departmentId,
      roomId: departmentId,
      folderId,
      inLibrary: true,
      demo: true,
      origin: "seed",
    },
    departmentId,
  );
  const texts = kind === "Image" ? [imageAssetPassage(filename)] : chunkText(body);
  const chunks = texts.map((text, i) => ({
    id: `${file.id}-${i}`,
    departmentId,
    roomId: departmentId,
    file: filename,
    text,
  }));
  return { file, chunks };
}

function decorateFiles(state: DiskState) {
  for (const room of state.rooms) {
    room.kind = "department";
    room.name = workspaceLabel(room.id);
    room.isolation = uxIsolation(room.id);
    room.files = room.files.map((f) => {
      const file = normalizeFile(f, room.id);
      const folder = state.folders.find((x) => x.id === file.folderId);
      file.folderPath = folder?.name;
      return file;
    });
  }
}

function loadSeed(): DiskState {
  const rooms = emptyDepartments();
  const folders = seedFolders();
  const chunks: Chunk[] = [];
  const root = seedDir();
  if (!existsSync(root)) {
    return { version: STATE_VERSION, rooms, folders, chunks, seats: defaultSeats(), threads: [], handoffs: [], audit: [], routines: defaultRoutines(), agents: defaultAgents() };
  }

  for (const room of rooms) {
    const dir = path.join(root, room.id);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const kind = kindFromFilename(name);
      let body = "";
      try {
        if (kind === "Image") body = "";
        else if (kind === "PDF") body = extractText("PDF", name, readFileSync(full));
        else body = readFileSync(full, "utf8");
      } catch {
        body = "";
      }
      const rec = ingestSeedFile(room.id, name, body, kind, folderForSeed(room.id, name, folders));
      room.files.push(rec.file);
      chunks.push(...rec.chunks);
    }
  }

  const hqLoyalty = path.join(root, "hq-ops", "DEMO_loyalty.md");
  const hqCater = path.join(root, "hq-ops", "DEMO_catering_protocol.md");
  for (const id of [LITTLE_ELM, PROSPER]) {
    const room = rooms.find((r) => r.id === id);
    if (!room) continue;
    for (const src of [hqLoyalty, hqCater]) {
      if (!existsSync(src)) continue;
      const name = path.basename(src);
      if (room.files.some((f) => f.name === name)) continue;
      const rec = ingestSeedFile(id, name, readFileSync(src, "utf8"), "Markdown", folderForSeed(id, name, folders));
      rec.file.id = `seed-${id}-${name}`;
      rec.chunks.forEach((c, i) => {
        c.id = `${rec.file.id}-${i}`;
        c.departmentId = id;
        c.roomId = id;
      });
      room.files.push(rec.file);
      chunks.push(...rec.chunks);
    }
  }

  const state: DiskState = {
    version: STATE_VERSION,
    rooms,
    folders,
    chunks,
    seats: defaultSeats(),
    threads: [],
    handoffs: [],
    audit: [],
    routines: defaultRoutines(),
    agents: defaultAgents(),
  };
  decorateFiles(state);
  return state;
}

function migrateState(raw: Partial<DiskState>): DiskState {
  const rooms = (raw.rooms || []).length ? raw.rooms! : emptyDepartments();
  const have = new Set(rooms.map((r) => r.id));
  for (const dept of emptyDepartments()) {
    if (!have.has(dept.id)) rooms.push(dept);
  }
  const folders = raw.folders?.length ? raw.folders : seedFolders();
  const state: DiskState = {
    version: STATE_VERSION,
    rooms: rooms.filter((r) => !isEnterprise(r.id)),
    folders,
    chunks: (raw.chunks || []).map((c) => {
      const departmentId = migrateWorkspaceId(c.departmentId || c.roomId);
      return { ...c, departmentId, roomId: departmentId };
    }),
    seats: (raw.seats || defaultSeats()).map(normalizeSeat),
    threads: raw.threads || [],
    handoffs: raw.handoffs || [],
    audit: raw.audit || [],
    routines: raw.routines ?? defaultRoutines(),
    agents: raw.agents?.length ? raw.agents.map(normalizeAgent) : defaultAgents(),
  };
  addSeedFilesIfEmpty(state, LEGAL);
  addSeedFilesIfEmpty(state, FINANCE);
  for (const room of state.rooms) {
    room.files = (room.files || []).map((f) => {
      const file = normalizeFile(f, room.id);
      if (file.folderId == null && file.origin === "seed") {
        file.folderId = folderForSeed(room.id, file.name, state.folders);
      }
      return file;
    });
  }
  decorateFiles(state);
  return state;
}

function ensure() {
  mkdirSync(DATA, { recursive: true });
  mkdirSync(UPLOADS, { recursive: true });
  if (!existsSync(STATE)) {
    writeFileSync(STATE, JSON.stringify(loadSeed(), null, 2));
  }
}

function seedTextIsStale(raw: Partial<DiskState>) {
  return (raw.chunks || []).some((chunk) =>
    /boundaries|prosper|little elm|rafael|heath|\bcoffee\b/i.test(chunk.text || ""),
  );
}

function readState(): DiskState {
  ensure();
  try {
    const raw = JSON.parse(readFileSync(STATE, "utf8")) as Partial<DiskState>;
    const ids = (raw.rooms || []).map((r) => r.id);
    if (!ids.includes(LITTLE_ELM) || !ids.includes(PROSPER) || seedTextIsStale(raw)) {
      const fresh = loadSeed();
      fresh.threads = raw.threads || [];
      fresh.agents = raw.agents?.length ? raw.agents.map(normalizeAgent) : fresh.agents;
      fresh.audit = raw.audit || [];
      writeFileSync(STATE, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    const migrated = migrateState(raw);
    if (raw.version !== STATE_VERSION || !raw.folders?.length) {
      writeFileSync(STATE, JSON.stringify(migrated, null, 2));
    }
    return migrated;
  } catch {
    const fresh = loadSeed();
    writeFileSync(STATE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function writeState(state: DiskState) {
  withFileLock(STATE, () => {
    ensure();
    state.version = STATE_VERSION;
    decorateFiles(state);
    atomicWriteFile(STATE, JSON.stringify(state, null, 2));
  });
}

function allFiles(state: DiskState): HatchFile[] {
  return state.rooms.flatMap((r) => r.files);
}

export function listDepartments(): Department[] {
  return readState().rooms;
}

/** @deprecated use listDepartments */
export const listRooms = listDepartments;

export function listSeats(): Seat[] {
  return readState().seats;
}

export function listFolders(departmentId?: DepartmentId): FileFolder[] {
  const folders = readState().folders;
  if (!departmentId || isEnterprise(departmentId)) return folders;
  return folders.filter((f) => f.departmentId === migrateWorkspaceId(departmentId));
}

export function filesIn(departmentId: DepartmentId): HatchFile[] {
  const state = readState();
  if (isEnterprise(departmentId)) {
    return allFiles(state).map((f) => ({
      ...f,
      folderPath: [workspaceLabel(f.departmentId), f.folderPath].filter(Boolean).join(" / "),
    }));
  }
  return state.rooms.find((r) => r.id === migrateWorkspaceId(departmentId))?.files || [];
}

export function libraryIn(departmentId: DepartmentId): HatchFile[] {
  return filesIn(departmentId).filter((f) => f.inLibrary);
}

function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "what", "does", "this", "that"].includes(t));
}

export function retrieveFirm(query: string, limit = 6): Source[] {
  const terms = queryTerms(query);
  const state = readState();
  const allowed = new Set(
    allFiles(state)
      .filter((f) => f.inLibrary && f.status !== "failed")
      .map((f) => `${f.departmentId}::${f.name}`),
  );
  return state.chunks
    .filter((c) => allowed.has(`${c.departmentId}::${c.file}`))
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
      room: workspaceLabel(c.departmentId),
      departmentId: c.departmentId,
      snippet: c.text.slice(0, 700).trim(),
    }));
}

/** Firm-capable. departmentId is UX context only and does not sandbox retrieval. */
export function retrieve(_departmentId: DepartmentId, query: string, limit = 6): Source[] {
  return retrieveFirm(query, limit);
}

export function fileListing(workspaceId: DepartmentId): string {
  const files = filesIn(workspaceId);
  if (!files.length) return "(no files in this workspace)";
  return files
    .slice(0, 40)
    .map((f) => {
      const lib = f.inLibrary ? "library" : "files";
      const folder = f.folderPath ? `${f.folderPath}/` : "";
      const shown = f.name.replace(/^DEMO_/i, "");
      return `- ${workspaceLabel(f.departmentId)} / ${folder}${shown} [${lib}] id=${f.id}`;
    })
    .join("\n");
}

/** Replace library text for one uploaded image after the model captions it. */
export function replaceFilePassage(fileId: string, passage: string): boolean {
  const clean = passage.replace(/\u0000/g, "").trim();
  if (!clean) return false;
  return withFileLock(STATE, () => {
    const state = readState();
    const file = allFiles(state).find((item) => item.id === fileId);
    if (!file) return false;
    state.chunks = state.chunks.filter((chunk) => !(chunk.departmentId === file.departmentId && chunk.file === file.name));
    const parts = chunkText(clean);
    (parts.length ? parts : [clean]).forEach((text, index) => {
      state.chunks.push({
        id: `${file.id}-cap-${index}`,
        departmentId: file.departmentId,
        roomId: file.departmentId,
        file: file.name,
        text,
      });
    });
    writeState(state);
    return true;
  });
}

export function readFileRecord(fileId: string): { file: HatchFile; text: string } | null {
  const state = readState();
  const file = allFiles(state).find((f) => f.id === fileId);
  if (!file) return null;
  const text = state.chunks
    .filter((c) => c.departmentId === file.departmentId && c.file === file.name)
    .map((c) => c.text)
    .join("\n");
  return { file, text: text || `(no extracted text for ${file.name})` };
}

export function findFileById(fileId: string): HatchFile | null {
  return allFiles(readState()).find((f) => f.id === fileId) || null;
}

/** Disk path for an uploaded or seed file. Drafts from write_draft land in uploads. */
export function storedFilePath(file: HatchFile): string | null {
  const uploaded = path.join(UPLOADS, file.departmentId, `${file.id}-${file.name}`);
  if (existsSync(uploaded)) return uploaded;
  const seedDept = path.join(seedDir(), file.departmentId, file.name);
  if (existsSync(seedDept)) return seedDept;
  const seedHq = path.join(seedDir(), HQ_OPS, file.name);
  if (existsSync(seedHq)) return seedHq;
  return null;
}

export function readFileBytes(fileId: string): { file: HatchFile; bytes: Buffer; path: string | null } | null {
  const rec = readFileRecord(fileId);
  if (!rec) return null;
  const disk = storedFilePath(rec.file);
  if (disk) {
    return { file: rec.file, bytes: readFileSync(disk), path: disk };
  }
  return { file: rec.file, bytes: Buffer.from(rec.text, "utf8"), path: null };
}

export function findFilesByName(query: string): HatchFile[] {
  const q = query.toLowerCase();
  return allFiles(readState()).filter((f) => q.includes(f.name.toLowerCase()) || q.includes(f.id.toLowerCase()));
}

function pushFile(
  state: DiskState,
  input: {
    departmentId: DepartmentId;
    filename: string;
    body: Buffer | string;
    inLibrary: boolean;
    folderId?: string | null;
    origin: FileOrigin;
    demo?: boolean;
  },
): { file: HatchFile; error?: string } {
  const departmentId = migrateWorkspaceId(input.departmentId);
  const room = state.rooms.find((r) => r.id === departmentId);
  if (!room || isEnterprise(departmentId)) {
    return {
      file: normalizeFile(
        {
          id: "x",
          name: input.filename,
          kind: "Office",
          status: "failed",
          progress: 0,
          error: "Unknown desk. Pick North desk, South desk, or Operations.",
          departmentId,
          roomId: departmentId,
          inLibrary: false,
        },
        departmentId,
      ),
      error: "Unknown department.",
    };
  }

  if (!isAcceptedFilename(input.filename)) {
    const file = normalizeFile(
      {
        id: newId("up"),
        name: input.filename,
        kind: kindFromFilename(input.filename),
        status: "failed",
        progress: 0,
        error: REJECT_COPY,
        departmentId,
        roomId: departmentId,
        inLibrary: false,
        origin: input.origin,
      },
      departmentId,
    );
    room.files.unshift(file);
    writeState(state);
    return { file, error: REJECT_COPY };
  }

  const kind = kindFromFilename(input.filename);
  const id = newId("up");
  const dest = path.join(UPLOADS, departmentId);
  mkdirSync(dest, { recursive: true });
  const buf = typeof input.body === "string" ? Buffer.from(input.body, "utf8") : input.body;
  writeFileSync(path.join(dest, `${id}-${input.filename}`), buf);
  const text = extractText(kind, input.filename, buf);
  const file = normalizeFile(
    {
      id,
      name: input.filename,
      kind,
      status: "ready",
      progress: 100,
      departmentId,
      roomId: departmentId,
      folderId: input.folderId ?? null,
      inLibrary: input.inLibrary,
      origin: input.origin,
      demo: input.demo,
    },
    departmentId,
  );
  room.files.unshift(file);
  chunkText(text).forEach((part, i) => {
    state.chunks.push({ id: `${id}-${i}`, departmentId, roomId: departmentId, file: input.filename, text: part });
  });
  writeState(state);
  return { file };
}

export function persistUpload(input: {
  roomId?: DepartmentId;
  departmentId?: DepartmentId;
  filename: string;
  body: Buffer;
  inLibrary?: boolean;
  folderId?: string | null;
  origin?: FileOrigin;
  accessibleDepartments?: string[];
}): { file: HatchFile; error?: string } {
  const departmentId = migrateWorkspaceId(input.departmentId || input.roomId || LITTLE_ELM);
  if (input.accessibleDepartments) {
    const acl = canWriteDepartment({ departmentId, accessibleDepartments: input.accessibleDepartments });
    if (!acl.ok) {
      return {
        file: normalizeFile(
          {
            id: newId("up"),
            name: input.filename,
            status: "failed",
            progress: 0,
            error: acl.error,
            departmentId,
            roomId: departmentId,
            inLibrary: false,
          },
          departmentId,
        ),
        error: acl.error,
      };
    }
  }
  return withFileLock(STATE, () =>
    pushFile(readState(), {
      departmentId,
      filename: input.filename,
      body: input.body,
      inLibrary: Boolean(input.inLibrary),
      folderId: input.folderId,
      origin: input.origin || "upload",
    }),
  );
}

export function writeDraft(input: {
  departmentId: string;
  filename: string;
  text: string;
  accessibleDepartments: string[];
  folderId?: string | null;
}): { file?: HatchFile; event: ToolEvent } {
  const acl = canWriteDepartment(input);
  if (!acl.ok) {
    const event: ToolEvent = {
      name: "write_draft",
      ok: false,
      detail: acl.error,
      departmentId: migrateWorkspaceId(input.departmentId),
    };
    recordAudit(event);
    return { event };
  }
  const filename = input.filename.endsWith(".md") ? input.filename : `${input.filename.replace(/\s+/g, "_")}.md`;
  return withFileLock(STATE, () => {
    const result = pushFile(readState(), {
      departmentId: acl.departmentId,
      filename,
      body: input.text,
      inLibrary: false,
      folderId: input.folderId,
      origin: "draft",
    });
    const event: ToolEvent = {
      name: "write_draft",
      ok: !result.error,
      detail:
        result.error ||
        `Draft written to ${workspaceLabel(acl.departmentId)} Files: ${filename} (not in Library until promoted).`,
      departmentId: acl.departmentId,
      fileId: result.error ? undefined : result.file.id,
    };
    recordAudit(event);
    return { file: result.file, event };
  });
}

export function setLibraryFlag(departmentId: DepartmentId, fileId: string, inLibrary: boolean): HatchFile | null {
  return withFileLock(STATE, () => {
    const state = readState();
    const id = isEnterprise(departmentId) ? "" : migrateWorkspaceId(departmentId);
    for (const room of state.rooms) {
      if (id && room.id !== id) continue;
      const file = room.files.find((f) => f.id === fileId);
      if (!file) continue;
      file.inLibrary = inLibrary;
      writeState(state);
      return file;
    }
    return null;
  });
}

export function removeFile(departmentId: DepartmentId, fileId: string) {
  withFileLock(STATE, () => {
    const state = readState();
    const rooms = isEnterprise(departmentId) ? state.rooms : state.rooms.filter((r) => r.id === migrateWorkspaceId(departmentId));
    for (const room of rooms) {
      const file = room.files.find((f) => f.id === fileId);
      if (!file) continue;
      room.files = room.files.filter((f) => f.id !== fileId);
      state.chunks = state.chunks.filter((c) => !(c.departmentId === file.departmentId && c.file === file.name));
      writeState(state);
      return;
    }
  });
}

export function createFolder(departmentId: DepartmentId, name: string, parentId: string | null = null): FileFolder | { error: string } {
  const id = migrateWorkspaceId(departmentId);
  if (isEnterprise(id)) return { error: "Create the folder in a department, not Enterprise." };
  return withFileLock(STATE, () => {
    const state = readState();
    if (!state.rooms.some((r) => r.id === id)) return { error: "Unknown department." };
    const folder: FileFolder = { id: newId("fld"), name: name.trim() || "Untitled", departmentId: id, parentId };
    state.folders.push(folder);
    writeState(state);
    return folder;
  });
}

export function importDriveStub(input: {
  departmentId: string;
  accessibleDepartments: string[];
}): { files: HatchFile[]; events: ToolEvent[]; error?: string; note: string } {
  const acl = canWriteDepartment(input);
  const note =
    "Google Drive is not connected. Sample firm files landed in this desk’s Files.";
  if (!acl.ok) {
    const event: ToolEvent = { name: "drive_import", ok: false, detail: acl.error, departmentId: migrateWorkspaceId(input.departmentId) };
    recordAudit(event);
    return { files: [], events: [event], error: acl.error, note };
  }
  const items = DRIVE_STUB_ITEMS.filter(
    (item) => item.departmentHint === acl.departmentId || isEnterprise(input.departmentId),
  );
  const pick = items.length ? items : DRIVE_STUB_ITEMS.slice(0, 1);
  const files: HatchFile[] = [];
  const events: ToolEvent[] = [];
  for (const item of pick) {
    const result = persistUpload({
      departmentId: acl.departmentId,
      filename: item.name,
      body: Buffer.from(item.text, "utf8"),
      inLibrary: false,
      origin: "drive",
      accessibleDepartments: input.accessibleDepartments,
    });
    if (result.file) files.push(result.file);
    events.push({
      name: "drive_import",
      ok: !result.error,
      detail: result.error || `Imported ${item.path} → ${workspaceLabel(acl.departmentId)} Files`,
      departmentId: acl.departmentId,
      fileId: result.error ? undefined : result.file.id,
    });
  }
  events.forEach(recordAudit);
  return { files, events, note };
}

export function listThreads(departmentId?: DepartmentId): ChatThread[] {
  const threads = readState().threads;
  if (!departmentId) return threads.filter((t) => !t.archived);
  return threads.filter((t) => t.departmentId === migrateWorkspaceId(departmentId) && !t.archived);
}

export function getThread(threadId: string): ChatThread | null {
  return readState().threads.find((t) => t.id === threadId) || null;
}

export function createThread(departmentId: DepartmentId, title = "New thread", agentId?: string): ChatThread {
  return withFileLock(STATE, () => {
    const state = readState();
    const now = new Date().toISOString();
    const thread: ChatThread = {
      id: newId("th"),
      departmentId: migrateWorkspaceId(departmentId),
      title,
      archived: false,
      createdAt: now,
      updatedAt: now,
      messages: [],
      agentId,
    };
    state.threads.unshift(thread);
    writeState(state);
    return thread;
  });
}

export function updateThread(
  threadId: string,
  patch: Partial<Pick<ChatThread, "title" | "archived" | "messages" | "lastArtifactId">>,
): ChatThread | null {
  return withFileLock(STATE, () => {
    const state = readState();
    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) return null;
    if (patch.title != null) thread.title = patch.title;
    if (patch.archived != null) thread.archived = patch.archived;
    if (patch.messages) thread.messages = patch.messages;
    if (patch.lastArtifactId !== undefined) thread.lastArtifactId = patch.lastArtifactId;
    thread.updatedAt = new Date().toISOString();
    writeState(state);
    return thread;
  });
}

export function appendThreadMessages(threadId: string, messages: ChatMessage[]): ChatThread | null {
  return withFileLock(STATE, () => {
    const state = readState();
    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) return null;
    thread.messages = [...thread.messages, ...messages];
    const firstUser = thread.messages.find((m) => m.role === "user");
    if (thread.title === "New thread" && firstUser) {
      thread.title = firstUser.text.slice(0, 42) + (firstUser.text.length > 42 ? "…" : "");
    }
    thread.updatedAt = new Date().toISOString();
    writeState(state);
    return thread;
  });
}

export function replaceThreadMessage(threadId: string, message: ChatMessage): ChatThread | null {
  return withFileLock(STATE, () => {
    const state = readState();
    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) return null;
    thread.messages = thread.messages.map((m) => (m.id === message.id ? message : m));
    thread.updatedAt = new Date().toISOString();
    writeState(state);
    return thread;
  });
}

export function listHandoffs(departmentId?: DepartmentId): Handoff[] {
  const rows = readState().handoffs;
  if (!departmentId || isEnterprise(departmentId)) return rows;
  const id = migrateWorkspaceId(departmentId);
  return rows.filter((h) => h.toDepartmentId === id || h.fromDepartmentId === id);
}

export function createHandoff(input: {
  fromDepartmentId: string;
  toDepartmentId: string;
  summary: string;
  facts?: string;
}): { handoff?: Handoff; event: ToolEvent } {
  const to = migrateWorkspaceId(input.toDepartmentId);
  const from = migrateWorkspaceId(input.fromDepartmentId || ENTERPRISE);
  if (isEnterprise(to) || !to) {
    const event: ToolEvent = {
      name: "handoff_to_department",
      ok: false,
      detail: "Handoff target must be North desk, South desk, or Operations.",
    };
    recordAudit(event);
    return { event };
  }
  const handoff: Handoff = {
    id: newId("ho"),
    fromDepartmentId: from,
    toDepartmentId: to,
    summary: input.summary.trim() || "Inbound handoff",
    facts: (input.facts || "").trim(),
    status: "learned",
    createdAt: new Date().toISOString(),
  };
  const event: ToolEvent = {
    name: "handoff_to_department",
    ok: true,
    detail: `Handoff to ${workspaceLabel(to)} recorded. Their inbox was notified. No files were written in ${workspaceLabel(to)}.`,
    departmentId: to,
  };
  return withFileLock(STATE, () => {
    const state = readState();
    state.handoffs.unshift(handoff);
    writeState(state);
    recordAudit(event);
    return { handoff, event };
  });
}

export function recordAuditEntry(
  event: ToolEvent,
  extra?: { actor?: string; agentId?: string; kind?: AuditEntry["kind"] },
) {
  withFileLock(STATE, () => {
    const state = readState();
    state.audit.unshift({
      id: newId("aud"),
      tool: event.name,
      ok: event.ok,
      detail: scrubVaultSecrets(event.detail || "").slice(0, 500),
      departmentId: event.departmentId,
      at: new Date().toISOString(),
      actor: extra?.actor,
      agentId: extra?.agentId,
      kind: extra?.kind || "tool",
    });
    state.audit = state.audit.slice(0, 200);
    writeState(state);
  });
}

function recordAudit(event: ToolEvent) {
  recordAuditEntry(event);
}

function defaultAgents(): HatchAgent[] {
  return AGENTS.map((agent) => ({ ...agent }));
}

function normalizeAgent(raw: HatchAgent): HatchAgent {
  const base = AGENTS.find((agent) => agent.id === raw.id);
  return {
    id: raw.id,
    name: raw.name || base?.name || "Agent",
    title: raw.title || base?.title || "Assistant",
    description: raw.description || base?.description || "",
    departmentId: raw.departmentId || base?.departmentId || raw.id,
    writeDepartmentId: raw.writeDepartmentId || base?.writeDepartmentId || raw.departmentId || raw.id,
    color: raw.color || base?.color || AGENT_COLORS[0],
    icon: iconForAgent({ id: raw.id || base?.id, name: raw.name || base?.name, icon: raw.icon || base?.icon }),
    model: raw.model || base?.model || FIRM_MODEL,
    notifications: raw.notifications !== false,
    muted: Boolean(raw.muted),
    pinned: raw.pinned ?? base?.pinned ?? false,
  };
}

function defaultRoutines(): Routine[] {
  return [
    {
      id: "routine-morning-brief",
      agentId: "general",
      name: "Morning brief",
      prompt: "Summarize what changed in the file room and list anything waiting on a partner.",
      schedule: "weekdays 07:00",
      enabled: true,
      createdAt: "2026-01-01T12:00:00.000Z",
    },
  ];
}

function addSeedFilesIfEmpty(state: DiskState, departmentId: string) {
  const room = state.rooms.find((item) => item.id === departmentId);
  if (!room || room.files.length) return;
  const dir = path.join(seedDir(), departmentId);
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    let body = "";
    try {
      body = readFileSync(full, "utf8");
    } catch {
      body = "";
    }
    const rec = ingestSeedFile(departmentId, name, body, kindFromFilename(name), null);
    room.files.push(rec.file);
    state.chunks.push(...rec.chunks);
  }
}

export function listRoutines(): Routine[] {
  return readState().routines || [];
}

export function saveRoutine(input: {
  id?: string;
  agentId: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled?: boolean;
}): Routine {
  return withFileLock(STATE, () => {
    const state = readState();
    const name = input.name.trim() || "Untitled routine";
    const prompt = input.prompt.trim();
    const schedule = input.schedule.trim() || "weekdays 07:00";
    if (input.id) {
      const existing = state.routines.find((item) => item.id === input.id);
      if (existing) {
        existing.agentId = input.agentId;
        existing.name = name;
        existing.prompt = prompt;
        existing.schedule = schedule;
        if (input.enabled != null) existing.enabled = input.enabled;
        writeState(state);
        return existing;
      }
    }
    const routine: Routine = {
      id: newId("routine"),
      agentId: input.agentId,
      name,
      prompt,
      schedule,
      enabled: input.enabled !== false,
      createdAt: new Date().toISOString(),
    };
    state.routines.unshift(routine);
    writeState(state);
    return routine;
  });
}

export function listStoredAgents(): HatchAgent[] {
  const agents = readState().agents;
  if (!agents?.length) return defaultAgents();
  return agents.map((agent) => normalizeAgent(agent));
}

export function resolveAgent(id?: string | null): HatchAgent {
  const agents = listStoredAgents();
  return agents.find((agent) => agent.id === id) || agents[0] || defaultAgents()[0];
}

export function saveStoredAgent(input: Partial<HatchAgent> & { name: string }): HatchAgent {
  return withFileLock(STATE, () => {
    const state = readState();
    const name = input.name.trim().slice(0, 40) || "Agent";
    if (input.id) {
      const existing = state.agents.find((agent) => agent.id === input.id);
      if (existing) {
        Object.assign(existing, normalizeAgent({ ...existing, ...input, name }));
        writeState(state);
        return existing;
      }
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "agent";
    let id = slug;
    let n = 2;
    while (state.agents.some((agent) => agent.id === id) || state.rooms.some((room) => room.id === id)) {
      id = `${slug}-${n++}`;
    }
    const agent = normalizeAgent({
      id,
      name,
      title: input.title || "Assistant",
      description: (input.description || "").slice(0, 400),
      departmentId: id,
      writeDepartmentId: id,
      color: input.color || AGENT_COLORS[state.agents.length % AGENT_COLORS.length],
      icon: input.icon,
      model: input.model || FIRM_MODEL,
      notifications: input.notifications !== false,
      muted: Boolean(input.muted),
      pinned: Boolean(input.pinned),
    });
    state.agents.unshift(agent);
    if (!state.rooms.some((room) => room.id === id)) {
      state.rooms.push({
        id,
        name,
        kind: "department",
        isolation: `File room for ${name}.`,
        files: [],
      });
    }
    writeState(state);
    return agent;
  });
}

export function removeStoredAgent(id: string): boolean {
  if (AGENTS.some((agent) => agent.id === id)) return false;
  return withFileLock(STATE, () => {
    const state = readState();
    const next = state.agents.filter((agent) => agent.id !== id);
    if (next.length === state.agents.length) return false;
    state.agents = next;
    writeState(state);
    return true;
  });
}

export function patchMessage(
  threadId: string,
  messageId: string,
  patch: Partial<Pick<ChatMessage, "reactions" | "replyTo">>,
): ChatMessage | null {
  return withFileLock(STATE, () => {
    const state = readState();
    const thread = state.threads.find((item) => item.id === threadId);
    const message = thread?.messages.find((item) => item.id === messageId);
    if (!message) return null;
    if (patch.reactions) message.reactions = patch.reactions.slice(0, 8);
    if (patch.replyTo !== undefined) message.replyTo = patch.replyTo;
    writeState(state);
    return message;
  });
}

export function deleteRoutine(id: string): boolean {
  return withFileLock(STATE, () => {
    const state = readState();
    const next = state.routines.filter((item) => item.id !== id);
    if (next.length === state.routines.length) return false;
    state.routines = next;
    writeState(state);
    return true;
  });
}

export function listAudit(): AuditEntry[] {
  return readState().audit;
}

export function resetSeed() {
  withFileLock(STATE, () => {
    atomicWriteFile(STATE, JSON.stringify(loadSeed(), null, 2));
  });
}
