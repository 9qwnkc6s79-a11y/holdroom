import { deleteRecord, readRecord, readRecords, saveRecord } from "./beta-store.ts";
import { ENTERPRISE, NORTH_DESK, isEnterprise, migrateWorkspaceId } from "./departments.ts";
import {
  createThread,
  getThread,
  listThreads,
  removeFile,
  removeThreadRecord,
  setLibraryFlag,
  upsertThreadRecord,
  upsertUploadRecord,
} from "./store.ts";
import { safeCode } from "./testers.ts";
import type { ChatThread, DepartmentId, HatchFile } from "./types.ts";

function scopeKey(scope: string) {
  return safeCode(scope || "staff");
}

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "item";
}

function threadsFolder(scope: string) {
  return `threads/${scopeKey(scope)}`;
}

function uploadsFolder(scope: string) {
  return `uploads/${scopeKey(scope)}`;
}

export async function saveThreadScoped(scope: string, thread: ChatThread | null | undefined): Promise<ChatThread | null> {
  if (!thread?.id) return null;
  const saved = upsertThreadRecord(thread);
  await saveRecord(threadsFolder(scope), safeId(saved.id), saved);
  return saved;
}

export async function createThreadScoped(
  scope: string,
  departmentId: DepartmentId = NORTH_DESK,
  title = "New thread",
  agentId?: string,
): Promise<ChatThread> {
  const thread = createThread(migrateWorkspaceId(departmentId), title, agentId);
  await saveRecord(threadsFolder(scope), safeId(thread.id), thread);
  return thread;
}

export async function getThreadScoped(scope: string, threadId: string): Promise<ChatThread | null> {
  if (!threadId) return null;
  const remote = await readRecord<ChatThread>(threadsFolder(scope), safeId(threadId));
  if (remote?.id) {
    return upsertThreadRecord(remote);
  }
  const local = getThread(threadId);
  return local;
}

export async function ensureThreadScoped(scope: string, threadId: string): Promise<ChatThread | null> {
  const local = getThread(threadId);
  if (local) return local;
  return getThreadScoped(scope, threadId);
}

export async function listThreadsScoped(scope: string, departmentId?: DepartmentId): Promise<ChatThread[]> {
  const persisted = await readRecords<ChatThread>(threadsFolder(scope));
  const byId = new Map<string, ChatThread>();
  for (const thread of persisted) {
    if (!thread?.id) continue;
    const hydrated = upsertThreadRecord(thread);
    byId.set(hydrated.id, hydrated);
  }
  for (const local of listThreads()) {
    if (!byId.has(local.id)) byId.set(local.id, local);
  }
  const targetDept = departmentId ? migrateWorkspaceId(departmentId) : undefined;
  return [...byId.values()]
    .filter((thread) => !thread.archived)
    .filter((thread) => !targetDept || isEnterprise(targetDept) || thread.departmentId === targetDept)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function deleteThreadScoped(scope: string, threadId: string): Promise<boolean> {
  const existing = await getThreadScoped(scope, threadId);
  await deleteRecord(threadsFolder(scope), safeId(threadId));
  const removed = removeThreadRecord(threadId);
  return Boolean(existing || removed);
}

export interface StoredUploadBlob {
  file: HatchFile;
  text: string;
  bytesBase64?: string;
}

export async function saveUploadScoped(
  scope: string,
  file: HatchFile,
  text: string,
  bytes?: Buffer,
): Promise<void> {
  const bytesBase64 = bytes && bytes.length <= 2 * 1024 * 1024 ? bytes.toString("base64") : undefined;
  const record: StoredUploadBlob = { file, text, bytesBase64 };
  await saveRecord(uploadsFolder(scope), safeId(file.id), record);
}

export async function loadUploadScoped(scope: string, fileId: string): Promise<StoredUploadBlob | null> {
  const record = await readRecord<StoredUploadBlob>(uploadsFolder(scope), safeId(fileId));
  if (!record?.file?.id) return null;
  upsertUploadRecord(record.file, record.text || "", record.bytesBase64);
  return record;
}

export async function hydrateUploadsScoped(scope: string, departmentId?: DepartmentId): Promise<HatchFile[]> {
  const records = await readRecords<StoredUploadBlob>(uploadsFolder(scope));
  const dept = departmentId ? migrateWorkspaceId(departmentId) : ENTERPRISE;
  const out: HatchFile[] = [];
  for (const rec of records) {
    if (!rec?.file?.id) continue;
    const hydrated = upsertUploadRecord(rec.file, rec.text || "", rec.bytesBase64);
    if (isEnterprise(dept) || hydrated.departmentId === dept) {
      out.push(hydrated);
    }
  }
  return out;
}

export async function updateUploadLibraryFlagScoped(
  scope: string,
  departmentId: DepartmentId,
  fileId: string,
  inLibrary: boolean,
): Promise<HatchFile | null> {
  await loadUploadScoped(scope, fileId);
  const updated = setLibraryFlag(departmentId, fileId, inLibrary);
  const existing = await readRecord<StoredUploadBlob>(uploadsFolder(scope), safeId(fileId));
  if (existing && updated) {
    await saveRecord(uploadsFolder(scope), safeId(fileId), { ...existing, file: updated });
  }
  return updated;
}

export async function deleteUploadScoped(scope: string, departmentId: DepartmentId, fileId: string): Promise<void> {
  removeFile(departmentId, fileId);
  await deleteRecord(uploadsFolder(scope), safeId(fileId));
}
