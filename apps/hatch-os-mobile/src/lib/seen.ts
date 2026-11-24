import { kvGet, kvSet } from "./kv";

const KEY = "hatch.seen";

export async function loadSeen(): Promise<Set<string>> {
  const raw = await kvGet(KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export async function markSeen(id: string): Promise<Set<string>> {
  const seen = await loadSeen();
  seen.add(id);
  await kvSet(KEY, JSON.stringify([...seen]));
  return seen;
}
