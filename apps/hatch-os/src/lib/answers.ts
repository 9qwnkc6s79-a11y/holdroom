import {
  CANNED,
  CORPUS,
  FUND_A,
  FUND_B,
  sourcesFor,
} from "./mock-data";
import type { Source } from "./types";

export interface AnswerPack {
  text: string;
  sources: Source[];
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

function roomName(roomId: string): string {
  if (roomId === FUND_A) return "Fund A";
  if (roomId === FUND_B) return "Fund B";
  return "This room";
}

export function searchRoom(roomId: string, query: string): Source[] {
  const q = query.toLowerCase();
  const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
  return CORPUS.filter((chunk) => chunk.roomId === roomId)
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
      room: roomName(roomId),
      page: chunk.page,
      snippet: chunk.snippet,
    }));
}

export function pickAnswer(roomId: string, query: string): AnswerPack {
  const t = query.toLowerCase();
  const inA = roomId === FUND_A;
  const inB = roomId === FUND_B;
  const name = roomName(roomId);

  if (/(harbor|fund b|other fund|other room)/.test(t) && inA) {
    return { text: CANNED.isolated.text, sources: [] };
  }
  if (/(northshore|fund a|other fund|other room)/.test(t) && inB) {
    return { text: CANNED.isolated.text, sources: [] };
  }
  if (inB && /(bridge|working capital)/.test(t)) {
    return { text: CANNED.failedBridge.text, sources: [] };
  }
  if (inB && /(harbor|platform|fund b)/.test(t)) {
    return { text: CANNED.harbor.text, sources: sourcesFor(name, CANNED.harbor.files) };
  }
  if (inA && /(concentration|customer|northshore)/.test(t)) {
    return {
      text: CANNED.concentration.text,
      sources: sourcesFor(name, CANNED.concentration.files),
    };
  }
  if (inA && /(earning|qoe|ebitda|add-back|addback)/.test(t)) {
    return { text: CANNED.earnings.text, sources: sourcesFor(name, CANNED.earnings.files) };
  }

  const hits = searchRoom(roomId, query);
  if (hits.length) {
    return {
      text: `From ${name} only: ${hits[0].snippet} This retrieve did not search other rooms.`,
      sources: hits,
    };
  }

  return { text: CANNED.general.text, sources: [] };
}
