import type { Agent, ChatThread } from "@/api/types";

/**
 * Sample firm data for EXPO_PUBLIC_HATCH_DEMO only.
 * It is not loaded from the host and it is not included in production builds.
 * The assistants mirror the host's built-in roles, with the general assistant
 * labeled so it is not a second "Hatch".
 */
export const DEMO_AGENTS: Agent[] = [
  {
    id: "general",
    name: "General assistant",
    title: "General assistant",
    description: "Reads the firm file room and asks before anything is sent, changed, or deleted.",
    departmentId: "enterprise",
    writeDepartmentId: "hq-ops",
    icon: "brackets",
  },
  {
    id: "operations",
    name: "Operations",
    title: "Operations",
    description: "Day-to-day running of the firm: vendors, checklists, and handoffs between desks.",
    departmentId: "hq-ops",
    writeDepartmentId: "hq-ops",
    icon: "layers",
  },
  {
    id: "legal",
    name: "Legal",
    title: "Counsel",
    description: "Contracts and engagement notes. Keeps counsel’s file room separate from the rest of the firm.",
    departmentId: "legal",
    writeDepartmentId: "legal",
    icon: "scale",
  },
  {
    id: "finance",
    name: "Finance",
    title: "Finance",
    description: "Close, cash, and the figures partners ask about. Drafts stay in Finance until you approve them.",
    departmentId: "finance",
    writeDepartmentId: "finance",
    icon: "trending-up",
  },
];

export function demoThreads(now = new Date().toISOString()): ChatThread[] {
  return [
    {
      id: "demo-draft",
      title: "Draft ready for your review",
      departmentId: "legal",
      agentId: "legal",
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: "demo-user",
          role: "user",
          text: "Produce a dossier on this guy",
          done: true,
          attachments: [{ fileId: "demo-photo", name: "IMG_2067.png", kind: "Image", previewUri: "/demo-photo.png" }],
        },
        {
          id: "demo-assistant",
          role: "assistant",
          text: "The draft is ready. Nothing leaves your firm’s host until you approve.",
          done: true,
          tools: [{ name: "read", ok: true, detail: "Read the file room" }],
          approval: {
            id: "demo-approval",
            tool: "email_send",
            title: "Send an email",
            summary: "Nothing is sent until you approve.",
            inputs: [
              { label: "To", value: "Your firm’s list" },
              { label: "Subject", value: "Draft" },
            ],
            status: "pending",
          },
        },
      ],
    },
    {
      id: "demo-general",
      title: "Ready when you are",
      departmentId: "enterprise",
      agentId: "general",
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: "demo-general-assistant",
          role: "assistant",
          text: "I’m here when you want to start.",
          done: true,
        },
      ],
    },
  ];
}
