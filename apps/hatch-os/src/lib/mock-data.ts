import { ENTERPRISE, HQ_OPS, LITTLE_ELM, PROSPER, uxIsolation } from "./departments.ts";
import type { BoxStatus, Department, Device, Seat } from "./types.ts";

export { ENTERPRISE, HQ_OPS, LITTLE_ELM, PROSPER };

export const INITIAL_DEPARTMENTS: Department[] = [
  {
    id: LITTLE_ELM,
    name: "North desk",
    kind: "department",
    isolation: uxIsolation(LITTLE_ELM),
    files: [],
  },
  {
    id: PROSPER,
    name: "South desk",
    kind: "department",
    isolation: uxIsolation(PROSPER),
    files: [],
  },
  {
    id: HQ_OPS,
    name: "Operations",
    kind: "department",
    isolation: uxIsolation(HQ_OPS),
    files: [],
  },
];

/** @deprecated use INITIAL_DEPARTMENTS */
export const INITIAL_ROOMS = INITIAL_DEPARTMENTS;

export const ENTERPRISE_WORKSPACE: Department = {
  id: ENTERPRISE,
  name: "Enterprise",
  kind: "enterprise",
  isolation: uxIsolation(ENTERPRISE),
  files: [],
};

function seat(
  id: string,
  name: string,
  role: Seat["role"],
  departments: Seat["departments"],
  extra: Partial<Seat>,
): Seat {
  return {
    id,
    name,
    role,
    departments,
    rooms: departments,
    enterprise: Boolean(extra.enterprise),
    homeDepartment: extra.homeDepartment || departments[0] || LITTLE_ELM,
    device: extra.device || "",
    pending: extra.pending,
  };
}

export const INITIAL_SEATS: Seat[] = [
  seat("s-partner", "Partner", "Partner", [LITTLE_ELM, PROSPER, HQ_OPS], {
    enterprise: true,
    homeDepartment: HQ_OPS,
    device: "Office Mac",
  }),
  seat("s-north", "North lead", "Admin", [LITTLE_ELM], {
    enterprise: false,
    homeDepartment: LITTLE_ELM,
    device: "North desk tablet",
  }),
  seat("s-south", "South lead", "Admin", [PROSPER], {
    enterprise: false,
    homeDepartment: PROSPER,
    device: "South desk tablet",
  }),
];

export const INITIAL_DEVICES: Device[] = [
  { id: "d1", name: "This Mac", lastSeen: "This session", current: true },
  { id: "d2", name: "North desk tablet", lastSeen: "Office network" },
];

export const MOCK_STATUS: BoxStatus = {
  ok: true,
  version: "0.3.0-departments",
  egress_check: {
    status: "checked",
    detail:
      "Software dry-run. Interim LLM is local Ollama — not OpenAI/Anthropic. FAIL=blocked remains the production accept test.",
    openai: "FAIL=blocked",
    anthropic: "FAIL=blocked",
  },
  label: "Software dry-run — appliance not connected",
  stack: "Hatch-os-ui",
  model: "qwen3:8b (16 GB Mac dogfood)",
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

export const SEAT_LINE = { used: 3, cap: 8, label: "Sample firm" };
