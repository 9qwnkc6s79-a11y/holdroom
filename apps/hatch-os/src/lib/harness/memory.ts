/**
 * Firm memory: the people, projects, places and preferences that let a short,
 * sloppy ask resolve to the right thing ("the sign" -> "Little Elm monument sign").
 *
 * Pure functions only. Storage lives in memory-store.ts.
 */

export interface MemoryPerson {
  name: string;
  aliases?: string[];
  role?: string;
  org?: string;
  email?: string;
  notes?: string;
}

export interface MemoryProject {
  name: string;
  aliases?: string[];
  /** Words that should be searched for when this project comes up. */
  keywords?: string[];
  people?: string[];
  place?: string;
  status?: string;
  notes?: string;
}

export interface MemoryPlace {
  name: string;
  aliases?: string[];
  notes?: string;
}

export interface FirmMemory {
  version: 1;
  firmName?: string;
  /** Who is talking to Hatch, so "my" and "me" resolve. */
  user?: { name?: string; role?: string; email?: string };
  people: MemoryPerson[];
  projects: MemoryProject[];
  places: MemoryPlace[];
  /** How the user likes answers. Plain sentences. */
  preferences: string[];
  /** Short facts the user asked Hatch to remember. */
  facts: { text: string; at: string }[];
  updatedAt?: string;
}

export function emptyMemory(): FirmMemory {
  return { version: 1, people: [], projects: [], places: [], preferences: [], facts: [] };
}

export interface EntityMatch {
  kind: "person" | "project" | "place";
  name: string;
  /** The words in the query that matched. */
  matched: string;
  /** The canonical label (name or alias, normalized) that the query matched. */
  label: string;
  /** Extra search words that come with this entity. */
  keywords: string[];
  email?: string;
}

export function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9@.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
      // transposition counts as one edit
      i += 2;
      j += 2;
    } else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Does `phrase` appear in `tokens` (allowing one typo per long word)? Returns matched text or "". */
export function fuzzyFind(tokens: string[], phrase: string): string {
  const want = normalize(phrase).split(" ").filter(Boolean);
  if (!want.length) return "";
  for (let start = 0; start + want.length <= tokens.length; start++) {
    let ok = true;
    for (let k = 0; k < want.length; k++) {
      const got = tokens[start + k];
      const target = want[k];
      if (got === target) continue;
      if (target.length >= 5 && got.length >= 4 && editDistanceAtMost1(got, target)) continue;
      // plural / possessive
      if (got === `${target}s` || `${got}s` === target) continue;
      ok = false;
      break;
    }
    if (ok) return tokens.slice(start, start + want.length).join(" ");
  }
  return "";
}

export function matchEntities(query: string, memory: FirmMemory | null | undefined): EntityMatch[] {
  if (!memory) return [];
  const tokens = normalize(query).split(" ").filter(Boolean);
  const out: EntityMatch[] = [];
  const seen = new Set<string>();
  const add = (match: EntityMatch) => {
    const key = `${match.kind}:${match.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(match);
  };
  for (const project of memory.projects || []) {
    for (const label of [project.name, ...(project.aliases || [])]) {
      const hit = fuzzyFind(tokens, label);
      if (hit) {
        add({ kind: "project", name: project.name, matched: hit, label: normalize(label), keywords: project.keywords || [] });
        break;
      }
    }
  }
  for (const place of memory.places || []) {
    for (const label of [place.name, ...(place.aliases || [])]) {
      const hit = fuzzyFind(tokens, label);
      if (hit) {
        add({ kind: "place", name: place.name, matched: hit, label: normalize(label), keywords: [] });
        break;
      }
    }
  }
  for (const person of memory.people || []) {
    const first = person.name.split(" ")[0];
    const labels = [person.name, ...(person.aliases || [])];
    if (first && first.length >= 3) labels.push(first);
    for (const label of labels) {
      const hit = fuzzyFind(tokens, label);
      if (hit) {
        add({ kind: "person", name: person.name, matched: hit, label: normalize(label), keywords: [], email: person.email });
        break;
      }
    }
  }
  return out;
}

/** Plain-text memory block for the system prompt. Kept short on purpose. */
export function renderMemory(memory: FirmMemory | null | undefined, matches: EntityMatch[], maxChars = 2400): string {
  if (!memory) return "";
  const lines: string[] = [];
  if (memory.firmName) lines.push(`Firm: ${memory.firmName}.`);
  if (memory.user?.name) lines.push(`You are helping ${memory.user.name}${memory.user.role ? `, ${memory.user.role}` : ""}.`);
  const matchedNames = new Set(matches.map((match) => match.name));
  const projects = [...(memory.projects || [])].sort((a, b) => Number(matchedNames.has(b.name)) - Number(matchedNames.has(a.name)));
  for (const project of projects.slice(0, 12)) {
    const bits = [project.name];
    if (project.aliases?.length) bits.push(`aka ${project.aliases.join(", ")}`);
    if (project.place) bits.push(`at ${project.place}`);
    if (project.people?.length) bits.push(`people: ${project.people.join(", ")}`);
    if (project.status) bits.push(`last known: ${project.status}`);
    lines.push(`Project: ${bits.join("; ")}.`);
  }
  for (const person of (memory.people || []).slice(0, 20)) {
    const bits = [person.name];
    if (person.role) bits.push(person.role);
    if (person.org) bits.push(person.org);
    if (person.email) bits.push(person.email);
    lines.push(`Person: ${bits.join(", ")}.`);
  }
  for (const place of (memory.places || []).slice(0, 10)) {
    lines.push(`Place: ${place.name}${place.aliases?.length ? ` (aka ${place.aliases.join(", ")})` : ""}.`);
  }
  for (const pref of (memory.preferences || []).slice(0, 10)) lines.push(`Preference: ${pref}`);
  for (const fact of (memory.facts || []).slice(-15)) lines.push(`Remembered: ${fact.text}`);
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/** "remember that Tom is our GC" -> "Tom is our GC". */
export function rememberRequest(query: string): string | null {
  const match = String(query || "").trim().match(/^(?:please\s+)?(?:remember|note|keep in mind|fyi,? remember)\s+(?:that\s+)?(.{4,400})$/i);
  if (!match) return null;
  return match[1].trim().replace(/[.!]+$/, "");
}

export function addFact(memory: FirmMemory, text: string, now = new Date()): FirmMemory {
  const clean = text.trim().slice(0, 400);
  if (!clean) return memory;
  const facts = (memory.facts || []).filter((fact) => fact.text.toLowerCase() !== clean.toLowerCase());
  facts.push({ text: clean, at: now.toISOString() });
  return { ...memory, facts: facts.slice(-100), updatedAt: now.toISOString() };
}

/** Defensive parse of a memory payload from the API. Drops anything unexpected. */
export function sanitizeMemory(raw: unknown): FirmMemory {
  const base = emptyMemory();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const strs = (v: unknown, n = 20) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((x) => (x as string).slice(0, 120)) : undefined);
  const arr = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, n) as Record<string, unknown>[] : []);
  base.firmName = str(r.firmName, 120);
  if (r.user && typeof r.user === "object") {
    const u = r.user as Record<string, unknown>;
    base.user = { name: str(u.name, 120), role: str(u.role, 120), email: str(u.email, 200) };
  }
  base.people = arr(r.people, 200).flatMap((p) => (str(p.name) ? [{ name: str(p.name)!, aliases: strs(p.aliases), role: str(p.role), org: str(p.org), email: str(p.email), notes: str(p.notes, 400) }] : []));
  base.projects = arr(r.projects, 200).flatMap((p) => (str(p.name) ? [{ name: str(p.name)!, aliases: strs(p.aliases), keywords: strs(p.keywords), people: strs(p.people), place: str(p.place), status: str(p.status, 400), notes: str(p.notes, 400) }] : []));
  base.places = arr(r.places, 100).flatMap((p) => (str(p.name) ? [{ name: str(p.name)!, aliases: strs(p.aliases), notes: str(p.notes, 400) }] : []));
  base.preferences = strs(r.preferences, 30) || [];
  base.facts = arr(r.facts, 100).flatMap((f) => (str(f.text, 400) ? [{ text: str(f.text, 400)!, at: str(f.at, 40) || new Date().toISOString() }] : []));
  return base;
}
