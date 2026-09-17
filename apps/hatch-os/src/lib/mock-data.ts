import { MATTER_ALPHA, MATTER_BETA } from "./rooms";
import { imageAssetPassage } from "./files";
import type { BoxStatus, Device, Room, Seat, Source } from "./types";

export { MATTER_ALPHA, MATTER_BETA };

export const INITIAL_ROOMS: Room[] = [
  {
    id: MATTER_ALPHA,
    name: "Matter Alpha",
    isolation: "Retrieval stays in Matter Alpha. Matter Beta files are not visible here.",
    files: [
      {
        id: "f1",
        name: "Northshore_CIM_v3.pdf",
        kind: "PDF",
        status: "ready",
        progress: 100,
        roomId: MATTER_ALPHA,
      },
      {
        id: "f2",
        name: "Quality_of_Earnings_memo.docx",
        kind: "Office",
        status: "indexed",
        progress: 100,
        roomId: MATTER_ALPHA,
      },
      {
        id: "f3",
        name: "Management_presentation_Q2.pdf",
        kind: "PDF",
        status: "ready",
        progress: 100,
        roomId: MATTER_ALPHA,
      },
      {
        id: "f4",
        name: "Addendum_customer_concentration.md",
        kind: "Markdown",
        status: "ready",
        progress: 100,
        roomId: MATTER_ALPHA,
      },
      {
        id: "f7",
        name: "Northshore_site_photo.jpg",
        kind: "Image",
        status: "ready",
        progress: 100,
        roomId: MATTER_ALPHA,
      },
    ],
  },
  {
    id: MATTER_BETA,
    name: "Matter Beta",
    isolation: "Retrieval stays in Matter Beta. Matter Alpha files are not visible here.",
    files: [
      {
        id: "f5",
        name: "Harbor_CIM_confidential.pdf",
        kind: "PDF",
        status: "ready",
        progress: 100,
        roomId: MATTER_BETA,
      },
      {
        id: "f6",
        name: "Working_capital_bridge.xlsx",
        kind: "Office",
        status: "failed",
        progress: 0,
        error: "Could not read this file — try PDF, Office, markdown, or an image (PNG, JPEG, WebP, GIF), or ask Admin.",
        roomId: MATTER_BETA,
      },
    ],
  },
];

export const INITIAL_SEATS: Seat[] = [
  {
    id: "s1",
    name: "Jane Ortiz",
    role: "Partner",
    rooms: [MATTER_ALPHA, MATTER_BETA],
    device: "Jane iPhone",
  },
  {
    id: "s2",
    name: "Alex Chen",
    role: "Associate",
    rooms: [MATTER_ALPHA],
    device: "Alex laptop",
  },
  {
    id: "s3",
    name: "Pending invite",
    role: "Seat reserved",
    rooms: [],
    device: "HATCH-7K2M",
    pending: true,
  },
];

export const INITIAL_DEVICES: Device[] = [
  {
    id: "d1",
    name: "Jane iPhone",
    lastSeen: "This session",
    current: true,
  },
  {
    id: "d2",
    name: "Office laptop",
    lastSeen: "Yesterday · LAN",
  },
];

export const MOCK_STATUS: BoxStatus = {
  ok: true,
  version: "0.1.0-phase1",
  egress_check: {
    status: "checked",
    detail:
      "Production nftables intent: DROP public internet except NTP and optional signed updates. FAIL=blocked is the accept test.",
    openai: "FAIL=blocked",
    anthropic: "FAIL=blocked",
  },
  label: "Hatch OS Phase 1 beta · mock box",
  stack: "Hatch-os-ui",
  model: "local instruct (box)",
  disk_free: "412 GB",
  last_backup: "14 Sep 2026 · 22:10",
  last_egress_check: "15 Sep 2026 · 09:02",
  source: "mock",
};

export interface CorpusChunk {
  roomId: string;
  file: string;
  page?: string;
  snippet: string;
  terms: string[];
}

export const CORPUS: CorpusChunk[] = [
  {
    roomId: MATTER_ALPHA,
    file: "Northshore_CIM_v3.pdf",
    page: "14",
    snippet:
      "LTM revenue concentration: Customer A 19%, Customer B 13%, Customer C 9% (41% combined). No customer exceeds 20%.",
    terms: ["concentration", "customer", "northshore", "ltm", "revenue"],
  },
  {
    roomId: MATTER_ALPHA,
    file: "Northshore_CIM_v3.pdf",
    page: "8",
    snippet:
      "Management presents $20.5m LTM EBITDA and describes working capital as “broadly neutral.”",
    terms: ["ebitda", "earnings", "northshore", "working", "capital"],
  },
  {
    roomId: MATTER_ALPHA,
    file: "Quality_of_Earnings_memo.docx",
    page: "6",
    snippet:
      "Customer A (19% of LTM) is on a rolling twelve-month MSA. Renewal is not contracted; treat as at-risk in the base case.",
    terms: ["concentration", "customer", "qoe", "earnings", "northshore"],
  },
  {
    roomId: MATTER_ALPHA,
    file: "Quality_of_Earnings_memo.docx",
    page: "3",
    snippet:
      "We propose $2.1m of add-back removals (one-time legal, related-party rent, and COVID catch-up). Adjusted EBITDA $18.4m.",
    terms: ["earning", "qoe", "ebitda", "add-back", "addback", "add backs"],
  },
  {
    roomId: MATTER_ALPHA,
    file: "Northshore_site_photo.jpg",
    snippet: imageAssetPassage("Northshore_site_photo.jpg"),
    terms: ["image", "photo", "site", "northshore", "ocr", "jpg"],
  },
  {
    roomId: MATTER_BETA,
    file: "Harbor_CIM_confidential.pdf",
    page: "2",
    snippet:
      "Harbor Partners — confidential information memorandum. LTM revenue $64m across 11 platform investments.",
    terms: ["harbor", "platform", "ltm", "revenue"],
  },
];

export const CANNED = {
  concentration: {
    text: "In the Northshore CIM, the top three customers are 41% of LTM revenue. Customer A is 19%, Customer B 13%, and Customer C 9%. The QoE memo flags the same concentration and notes no contract longer than twelve months on Customer A.",
    files: ["Northshore_CIM_v3.pdf", "Quality_of_Earnings_memo.docx"],
  },
  earnings: {
    text: "The quality-of-earnings memo treats reported EBITDA as inflated by $2.1m of add-backs. After the proposed adjustments, run-rate EBITDA is $18.4m versus $20.5m in the CIM. Working capital is described as a use, not a source, at close.",
    files: ["Quality_of_Earnings_memo.docx", "Northshore_CIM_v3.pdf"],
  },
  harbor: {
    text: "Harbor’s CIM (this room only) states LTM revenue of $64m and a book of 11 platform names. There is no Northshore material in Matter Beta, and this answer does not search Matter Alpha.",
    files: ["Harbor_CIM_confidential.pdf"],
  },
  isolated: {
    text: "That name is not in this room’s library. Matter Alpha and Matter Beta are isolated — this ask will not retrieve the other matter. Switch rooms if you meant the other space, or upload a file here.",
    files: [] as string[],
  },
  failedBridge: {
    text: "The working-capital bridge file in this room failed ingest, so there is no retrieved passage. The Harbor CIM does not include a numeric bridge. Re-upload as PDF or ask Admin.",
    files: [] as string[],
  },
  general: {
    text: "I can answer from general model knowledge, but this reply did not retrieve a passage from the room library. Upload a file in Library if you want the next ask grounded in the deal file.",
    files: [] as string[],
  },
};

export function sourcesFor(roomName: string, files: string[]): Source[] {
  return CORPUS.filter((c) => files.includes(c.file)).map((c) => ({
    file: c.file,
    room: roomName,
    page: c.page,
    snippet: c.snippet,
  }));
}

export const VALID_INVITES = {
  partner: ["HATCH-BETA", "HATCH-7K2M"],
  associate: ["HATCH-ASSOC"],
  noseat: ["HATCH-NOSEAT"],
};

export const SEAT_LINE = { used: 3, cap: 8, label: "Firm line" };
