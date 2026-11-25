import { readRecords, saveRecord } from "./beta-store.ts";
import { scopeKey } from "./connectors.ts";
import { decryptJson, encryptJson } from "./vault-crypto.ts";
import type { Source } from "./types.ts";

export interface PassageInput {
  id: string;
  title: string;
  source: string;
  text: string;
}

interface StoredPassage {
  id: string;
  title: string;
  source: string;
  at: string;
  secret: { iv: string; tag: string; ciphertext: string };
}

function folder(scope: string) {
  return `library/${scopeKey(scope)}`;
}

export function passageFilename(id: string): string {
  const clean = id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${clean || "plugin"}.md`;
}

export function rankPassages(rows: { title: string; text: string; source: string }[], query: string, limit = 6): Source[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
  if (!terms.length) return [];
  return rows
    .map((row) => {
      const hay = `${row.title} ${row.text}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), 0);
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => ({
      file: row.title,
      room: row.source,
      snippet: row.text.replace(/\s+/g, " ").slice(0, 1200),
    }));
}

export async function saveLibraryPassage(scope: string, passage: PassageInput) {
  const row: StoredPassage = {
    id: passage.id,
    title: passage.title.slice(0, 160),
    source: passage.source.slice(0, 80),
    at: new Date().toISOString(),
    secret: encryptJson({ text: passage.text.slice(0, 12000) }),
  };
  await saveRecord(folder(scope), passage.id, row);
}

export async function searchLibraryPassages(scope: string, query: string): Promise<Source[]> {
  if (!scope.trim()) return [];
  const rows = await readRecords<StoredPassage>(folder(scope));
  const open = rows.flatMap((row) => {
    try {
      const secret = decryptJson<{ text?: string }>(row.secret);
      return [{ title: row.title, source: row.source, text: secret.text || "" }];
    } catch {
      return [];
    }
  });
  return rankPassages(open, query);
}

export interface PublicPassage {
  id: string;
  title: string;
  source: string;
  at: string;
  text: string;
}

export async function listLibraryPassages(scope: string): Promise<PublicPassage[]> {
  if (!scope.trim()) return [];
  const rows = await readRecords<StoredPassage>(folder(scope));
  return rows
    .flatMap((row) => {
      try {
        const secret = decryptJson<{ text?: string }>(row.secret);
        return [{ id: row.id, title: row.title, source: row.source, at: row.at, text: secret.text || "" }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}
