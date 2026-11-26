/** Firm memory persistence. Encrypted at rest with the vault key, like library passages. */
import { readRecords, saveRecord } from "../beta-store.ts";
import { scopeKey } from "../connectors.ts";
import { decryptJson, encryptJson } from "../vault-crypto.ts";
import { addFact, emptyMemory, sanitizeMemory, type FirmMemory } from "./memory.ts";

interface StoredMemory {
  id: "memory";
  at: string;
  secret: { iv: string; tag: string; ciphertext: string };
}

function folder(scope: string) {
  return `memory/${scopeKey(scope)}`;
}

export async function loadMemory(scope: string): Promise<FirmMemory> {
  try {
    const rows = await readRecords<StoredMemory>(folder(scope));
    const row = rows.find((r) => r.id === "memory");
    if (!row) return emptyMemory();
    return sanitizeMemory(decryptJson<unknown>(row.secret));
  } catch {
    return emptyMemory();
  }
}

export async function saveMemory(scope: string, memory: FirmMemory): Promise<FirmMemory> {
  const clean = sanitizeMemory({ ...memory, updatedAt: new Date().toISOString() });
  const row: StoredMemory = { id: "memory", at: new Date().toISOString(), secret: encryptJson(clean) };
  await saveRecord(folder(scope), "memory", row);
  return clean;
}

export async function rememberFact(scope: string, fact: string): Promise<FirmMemory> {
  const current = await loadMemory(scope);
  return saveMemory(scope, addFact(current, fact));
}
