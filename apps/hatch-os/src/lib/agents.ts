import { ENTERPRISE, FINANCE, HQ_OPS, LEGAL } from "./departments.ts";

export interface HatchAgent {
  id: string;
  name: string;
  /** Short line under the name in settings. */
  title: string;
  description: string;
  /** Workspace used for reads and thread filing. */
  departmentId: string;
  /** Where drafts land. Enterprise is not a write target. */
  writeDepartmentId: string;
  color: string;
  model: string;
  notifications: boolean;
  muted: boolean;
  pinned: boolean;
}

export const AGENT_COLORS = ["#18181B", "#27272A", "#3F3F46", "#0F766E", "#115E59", "#1C1C21"] as const;

export const FIRM_MODEL = "Firm model";

export const AGENTS: HatchAgent[] = [
  {
    id: "general",
    name: "Hatch",
    title: "General assistant",
    description: "Reads the firm file room and asks before anything is sent, changed, or deleted.",
    departmentId: ENTERPRISE,
    writeDepartmentId: HQ_OPS,
    color: "#18181B",
    model: FIRM_MODEL,
    notifications: true,
    muted: false,
    pinned: true,
  },
  {
    id: "operations",
    name: "Operations",
    title: "Operations",
    description: "Day-to-day running of the firm: vendors, checklists, and handoffs between desks.",
    departmentId: HQ_OPS,
    writeDepartmentId: HQ_OPS,
    color: "#27272A",
    model: FIRM_MODEL,
    notifications: true,
    muted: false,
    pinned: true,
  },
  {
    id: "legal",
    name: "Legal",
    title: "Counsel",
    description: "Contracts and engagement notes. Keeps counsel’s file room separate from the rest of the firm.",
    departmentId: LEGAL,
    writeDepartmentId: LEGAL,
    color: "#3F3F46",
    model: FIRM_MODEL,
    notifications: true,
    muted: false,
    pinned: true,
  },
  {
    id: "finance",
    name: "Finance",
    title: "Finance",
    description: "Close, cash, and the figures partners ask about. Drafts stay in Finance until you approve them.",
    departmentId: FINANCE,
    writeDepartmentId: FINANCE,
    color: "#0F766E",
    model: FIRM_MODEL,
    notifications: true,
    muted: false,
    pinned: false,
  },
];

export function agentById(id?: string | null): HatchAgent {
  return AGENTS.find((agent) => agent.id === id) || AGENTS[0];
}
