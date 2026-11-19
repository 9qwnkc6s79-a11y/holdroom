import { ENTERPRISE, FINANCE, HQ_OPS, LEGAL } from "./departments.ts";

export interface HatchAgent {
  id: string;
  name: string;
  description: string;
  /** Workspace used for reads and thread filing. */
  departmentId: string;
  /** Where drafts land. Enterprise is not a write target. */
  writeDepartmentId: string;
}

export const AGENTS: HatchAgent[] = [
  {
    id: "general",
    name: "Hatch",
    description: "General assistant. Reads the firm file room and asks before anything is sent, changed, or deleted.",
    departmentId: ENTERPRISE,
    writeDepartmentId: HQ_OPS,
  },
  {
    id: "operations",
    name: "Operations",
    description: "Day-to-day running of the firm: vendors, checklists, and handoffs between desks.",
    departmentId: HQ_OPS,
    writeDepartmentId: HQ_OPS,
  },
  {
    id: "legal",
    name: "Legal",
    description: "Contracts and engagement notes. Keeps counsel’s file room separate from the rest of the firm.",
    departmentId: LEGAL,
    writeDepartmentId: LEGAL,
  },
  {
    id: "finance",
    name: "Finance",
    description: "Close, cash, and the figures partners ask about. Drafts stay in Finance until you approve them.",
    departmentId: FINANCE,
    writeDepartmentId: FINANCE,
  },
];

export function agentById(id?: string | null): HatchAgent {
  return AGENTS.find((agent) => agent.id === id) || AGENTS[0];
}
