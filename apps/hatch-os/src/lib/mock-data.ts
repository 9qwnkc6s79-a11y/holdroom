import { HQ_OPS, LITTLE_ELM, PROSPER } from "./rooms";
import type { BoxStatus, Device, Room, Seat } from "./types";

export { HQ_OPS, LITTLE_ELM, PROSPER };

export const INITIAL_ROOMS: Room[] = [
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

export const INITIAL_SEATS: Seat[] = [
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

export const INITIAL_DEVICES: Device[] = [
  { id: "d1", name: "This Mac", lastSeen: "This session", current: true },
  { id: "d2", name: "Little Elm iPad", lastSeen: "Store LAN" },
];

export const MOCK_STATUS: BoxStatus = {
  ok: true,
  version: "0.2.0-boundaries-dryrun",
  egress_check: {
    status: "checked",
    detail:
      "Software dry-run. Interim LLM is local Ollama — not OpenAI/Anthropic. FAIL=blocked remains the production accept test.",
    openai: "FAIL=blocked",
    anthropic: "FAIL=blocked",
  },
  label: "Software dry-run — appliance not connected",
  stack: "Hatch-os-ui",
  model: "qwen3:8b (interim Ollama)",
  disk_free: "local disk",
  last_backup: "No appliance backup — dry-run only.",
  last_egress_check: "dry-run",
  source: "mock",
  dryRun: true,
};

export const VALID_INVITES = {
  partner: ["HATCH-BETA", "HATCH-7K2M", "BOUNDARIES", "COFFEE"],
  associate: ["HATCH-ASSOC"],
  noseat: ["HATCH-NOSEAT"],
};

export const SEAT_LINE = { used: 3, cap: 8, label: "Boundaries dry-run" };
