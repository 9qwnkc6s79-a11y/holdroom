import { imageAssetPassage, isImageFilename } from "./files";
import {
  CANNED,
  CORPUS,
  MATTER_ALPHA,
  MATTER_BETA,
  sourcesFor,
} from "./mock-data";
import { migrateRoomId, roomLabel } from "./rooms";
import type { FileKind, Source } from "./types";

export interface AnswerPack {
  text: string;
  sources: Source[];
}

export interface LibraryHint {
  name: string;
  kind?: FileKind | string;
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "what",
  "does",
  "this",
  "that",
  "with",
  "from",
  "into",
  "about",
  "other",
  "room",
]);

function nameOf(roomId: string): string {
  return roomLabel(roomId);
}

function imageSources(roomId: string, library?: LibraryHint[]): Source[] {
  const name = nameOf(roomId);
  const extras = (library || [])
    .filter((f) => f.kind === "Image" || isImageFilename(f.name))
    .map((f) => ({
      file: f.name,
      room: name,
      snippet: imageAssetPassage(f.name),
    }));
  const seeded = CORPUS.filter(
    (c) => c.roomId === roomId && isImageFilename(c.file),
  ).map((c) => ({
    file: c.file,
    room: name,
    page: c.page,
    snippet: c.snippet,
  }));
  const seen = new Set<string>();
  return [...seeded, ...extras].filter((s) => {
    if (seen.has(s.file)) return false;
    seen.add(s.file);
    return true;
  });
}

export function searchRoom(roomId: string, query: string, library?: LibraryHint[]): Source[] {
  const id = migrateRoomId(roomId);
  const q = query.toLowerCase();
  const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
  const fromCorpus = CORPUS.filter((chunk) => chunk.roomId === id)
    .map((chunk) => {
      const hay = `${chunk.file} ${chunk.snippet} ${chunk.terms.join(" ")}`.toLowerCase();
      const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { chunk, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ chunk }) => ({
      file: chunk.file,
      room: nameOf(id),
      page: chunk.page,
      snippet: chunk.snippet,
    }));

  if (fromCorpus.length) return fromCorpus;

  const images = imageSources(id, library).filter((s) => {
    const hay = `${s.file} ${s.snippet}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
  return images.slice(0, 3);
}

export function pickAnswer(roomId: string, query: string, library?: LibraryHint[]): AnswerPack {
  const id = migrateRoomId(roomId);
  const t = query.toLowerCase();
  const inA = id === MATTER_ALPHA;
  const inB = id === MATTER_BETA;
  const name = nameOf(id);

  if (/(harbor|matter beta|other matter|other room|other fund|fund b)/.test(t) && inA) {
    return { text: CANNED.isolated.text, sources: [] };
  }
  if (/(northshore|matter alpha|other matter|other room|other fund|fund a)/.test(t) && inB) {
    return { text: CANNED.isolated.text, sources: [] };
  }
  if (inB && /(bridge|working capital)/.test(t)) {
    return { text: CANNED.failedBridge.text, sources: [] };
  }
  if (inB && /(harbor|platform|matter beta)/.test(t)) {
    return { text: CANNED.harbor.text, sources: sourcesFor(name, CANNED.harbor.files) };
  }
  if (inA && /(concentration|customer|northshore)/.test(t) && !/(photo|image|jpg|png)/.test(t)) {
    return {
      text: CANNED.concentration.text,
      sources: sourcesFor(name, CANNED.concentration.files),
    };
  }
  if (inA && /(earning|qoe|ebitda|add-back|addback)/.test(t)) {
    return { text: CANNED.earnings.text, sources: sourcesFor(name, CANNED.earnings.files) };
  }
  if (/(photo|image|ocr|jpg|jpeg|png|webp|gif)/.test(t)) {
    const images = imageSources(id, library);
    if (images.length) {
      return {
        text: `${images[0].snippet} This retrieve stayed in ${name}.`,
        sources: images,
      };
    }
  }

  const hits = searchRoom(id, query, library);
  if (hits.length) {
    return {
      text: `From ${name} only: ${hits[0].snippet} This retrieve did not search other rooms.`,
      sources: hits,
    };
  }

  return { text: CANNED.general.text, sources: [] };
}
