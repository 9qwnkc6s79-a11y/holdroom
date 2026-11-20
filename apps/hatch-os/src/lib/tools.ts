import { canWriteDepartment, knownDepartmentId, writeDeniedHandoffHint } from "./acl.ts";
import { findVaultByName } from "./vault.ts";
import { DEPARTMENT_IDS, migrateWorkspaceId, workspaceLabel } from "./departments.ts";
import {
  createHandoff,
  fileListing,
  findFilesByName,
  readFileRecord,
  retrieveFirm,
  writeDraft,
} from "./store.ts";
import {
  parseHermesToolCalls,
  parseToolCalls,
  parseToolTrailer,
  stripToolMarkup,
  stripToolTrailer,
  type ToolCall,
} from "./tool-parse.ts";
import type { DepartmentId, Source, ToolEvent } from "./types.ts";

export {
  parseHermesToolCalls,
  parseToolCalls,
  parseToolTrailer,
  stripToolMarkup,
  stripToolTrailer,
};
export type { ToolCall };

export const TOOL_NAMES = [
  "search_library",
  "list_files",
  "read_file",
  "write_draft",
  "handoff_to_department",
  "use_vault",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_SCHEMAS = [
  {
    name: "search_library",
    description: "Search the firm-wide Library corpus. Not limited to the active department UX.",
    parameters: { query: "string" },
  },
  {
    name: "list_files",
    description: "List Files in a department or the Enterprise union view.",
    parameters: { departmentId: "little-elm | prosper | hq-ops | enterprise" },
  },
  {
    name: "read_file",
    description: "Read extracted text for a Files/Library document by id or exact name.",
    parameters: { fileId: "string" },
  },
  {
    name: "write_draft",
    description:
      "Write a markdown draft into Files for a department the user can open. ACL-checked. Never writes Enterprise or a peer department the user cannot open.",
    parameters: { departmentId: "little-elm | prosper | hq-ops", filename: "string", text: "string" },
  },
  {
    name: "handoff_to_department",
    description:
      "Notify a peer department inbox and record what was learned. Does not write their Files. Waits for approval on Hatch OS.",
    parameters: { toDepartmentId: "little-elm | prosper | hq-ops | legal | finance", summary: "string", facts: "string" },
  },
  {
    name: "use_vault",
    description:
      "Ask to reference a vault item by name. You never receive the password, token, or card number. Say which item and why. A person must approve. Autofill is not applied.",
    parameters: { itemName: "string", purpose: "string" },
  },
];

export interface ToolContext {
  workspaceId: DepartmentId;
  accessibleDepartments: string[];
  enterprise?: boolean;
  defaultDepartmentId?: string;
  /** Set only after a person approves a vault reference. Still does not return the secret. */
  vaultApproved?: boolean;
}

export interface OpenAiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
  };
}

export function openaiToolSchemas(extra: OpenAiTool[] = []): OpenAiTool[] {
  return [...TOOL_SCHEMAS.map((t) => {
    const properties = Object.fromEntries(
      Object.entries(t.parameters).map(([key, desc]) => [
        key,
        { type: "string", description: String(desc) },
      ]),
    );
    return {
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object" as const,
          properties,
          required: Object.keys(properties),
        },
      },
    };
  }), ...extra];
}

export function connectorSchemas(kinds: Set<string>): OpenAiTool[] {
  const has = (...names: string[]) => names.some((name) => kinds.has(name));
  const specs: { name: string; description: string; parameters: string[]; when: boolean }[] = [
    { name: "email_search", description: "Search the connected mailbox. Does not send anything.", parameters: ["query"], when: has("email", "google", "microsoft") },
    { name: "email_read", description: "Read matching mailbox headers. Does not send anything.", parameters: ["query"], when: has("email", "google", "microsoft") },
    { name: "email_draft", description: "Prepare an email draft. Does not send it.", parameters: ["to", "subject", "body"], when: has("email", "google", "microsoft") },
    { name: "email_send", description: "Send an email. Always waits for approval. Never claim it was sent before approval.", parameters: ["to", "subject", "body"], when: has("email", "google", "microsoft") },
    { name: "calendar_list", description: "List upcoming calendar events.", parameters: ["query"], when: has("google", "microsoft") },
    { name: "calendar_create", description: "Create a calendar event. Waits for approval.", parameters: ["title", "start", "end"], when: has("google", "microsoft") },
    { name: "cloud_files_search", description: "Search Drive or OneDrive by name.", parameters: ["query"], when: has("google", "microsoft") },
    { name: "cloud_files_read", description: "Read cloud file names that match a query.", parameters: ["query"], when: has("google", "microsoft") },
    { name: "slack_list_channels", description: "List Slack channels.", parameters: ["query"], when: has("slack") },
    { name: "slack_read_messages", description: "Read recent Slack messages in a channel.", parameters: ["channel"], when: has("slack") },
    { name: "slack_post_message", description: "Post a Slack message. Waits for approval.", parameters: ["channel", "text"], when: has("slack") },
    { name: "notion_search", description: "Search Notion pages.", parameters: ["query"], when: has("notion") },
    { name: "notion_read_page", description: "Find a Notion page by query.", parameters: ["query"], when: has("notion") },
    { name: "notion_create_page", description: "Create a Notion page. Waits for approval.", parameters: ["title", "parentId"], when: has("notion") },
    { name: "github_search", description: "Search GitHub issues.", parameters: ["query"], when: has("github") },
    { name: "github_create_issue", description: "Create a GitHub issue. Waits for approval.", parameters: ["repo", "title", "body"], when: has("github") },
    { name: "linear_search", description: "Search Linear issues.", parameters: ["query"], when: has("linear") },
    { name: "linear_create_issue", description: "Create a Linear issue. Waits for approval.", parameters: ["title", "body"], when: has("linear") },
    { name: "mcp_call", description: "Call a tool on the connected MCP server. Writes wait for approval.", parameters: ["name", "arguments"], when: has("mcp") },
  ];
  return specs.filter((spec) => spec.when).map((spec) => ({
    type: "function" as const,
    function: {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: "object" as const,
        properties: Object.fromEntries(spec.parameters.map((key) => [key, { type: "string" }])),
        required: spec.parameters,
      },
    },
  }));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function executeTool(call: ToolCall, ctx: ToolContext): { event: ToolEvent; sources?: Source[]; extra?: string } {
  const name = call.name;
  const args = call.arguments || {};

  if (name === "search_library") {
    const query = asString(args.query) || asString(args.q);
    const sources = retrieveFirm(query || "library", 6);
    return {
      event: {
        name,
        ok: true,
        detail: sources.length
          ? `Firm-wide library: ${sources.map((s) => `${s.file} (${s.room})`).join(", ")}`
          : "No library passages matched.",
        input: query.slice(0, 200),
      },
      sources,
    };
  }

  if (name === "list_files") {
    const departmentId = asString(args.departmentId) || ctx.workspaceId;
    const listing = fileListing(departmentId);
    return {
      event: {
        name,
        ok: true,
        detail: `Files in ${workspaceLabel(departmentId)}`,
        departmentId,
      },
      extra: listing,
    };
  }

  if (name === "read_file") {
    const fileId = asString(args.fileId) || asString(args.id) || asString(args.filename);
    const hit = readFileRecord(fileId) || (() => {
      const named = findFilesByName(fileId)[0];
      return named ? readFileRecord(named.id) : null;
    })();
    if (!hit) {
      return { event: { name, ok: false, detail: `No file matched “${fileId}”.` } };
    }
    return {
      event: {
        name,
        ok: true,
        detail: `Read ${hit.file.name} (${workspaceLabel(hit.file.departmentId)})`,
        departmentId: hit.file.departmentId,
        fileId: hit.file.id,
      },
      extra: hit.text.slice(0, 4000),
    };
  }

  if (name === "write_draft") {
    const fallback =
      ctx.defaultDepartmentId && ctx.defaultDepartmentId !== "enterprise"
        ? ctx.defaultDepartmentId
        : ctx.workspaceId === "enterprise"
          ? ""
          : ctx.workspaceId;
    const departmentId = asString(args.departmentId) || fallback;
    const filename = asString(args.filename) || "draft.md";
    const text = asString(args.text) || asString(args.body);
    if (!departmentId) {
      return {
        event: {
          name,
          ok: false,
          detail: "write_draft needs a departmentId (little-elm, prosper, or hq-ops). Enterprise is not a write target.",
        },
      };
    }
    const result = writeDraft({
      departmentId,
      filename,
      text: text || `# Draft\n\n(empty)`,
      accessibleDepartments: ctx.accessibleDepartments,
    });
    if (!result.event.ok) {
      result.event.detail = `${result.event.detail} ${writeDeniedHandoffHint(departmentId)}`;
    }
    return { event: result.event, extra: result.file ? `fileId=${result.file.id}` : undefined };
  }

  if (name === "use_vault") {
    const itemName = asString(args.itemName) || asString(args.name);
    if (!ctx.vaultApproved) {
      return {
        event: {
          name,
          ok: false,
          detail: "Vault access is waiting on approval. The secret was not read.",
          input: `item: ${itemName.slice(0, 80)}`,
        },
      };
    }
    const item = findVaultByName(itemName);
    if (!item) {
      return {
        event: {
          name,
          ok: false,
          detail: `No vault item matched “${itemName.slice(0, 80)}”. The secret was not read.`,
          input: `item: ${itemName.slice(0, 80)}`,
        },
      };
    }
    return {
      event: {
        name,
        ok: true,
        detail: `Referenced “${item.name}” (${item.kind}). Secret withheld. Autofill is not applied in this version.`,
        input: `item: ${item.name}`,
      },
    };
  }

  if (name === "handoff_to_department") {
    const to = asString(args.toDepartmentId) || asString(args.departmentId);
    if (!knownDepartmentId(to)) {
      return {
        event: {
          name,
          ok: false,
          detail: `Unknown department “${to}”. Use little-elm, prosper, or hq-ops.`,
        },
      };
    }
    const result = createHandoff({
      fromDepartmentId: ctx.workspaceId,
      toDepartmentId: to,
      summary: asString(args.summary) || asString(args.message),
      facts: asString(args.facts),
    });
    return { event: result.event };
  }

  return { event: { name, ok: false, detail: `Unknown tool “${name}”.` } };
}

export function mentionedReads(query: string): { event: ToolEvent; extra: string }[] {
  const hits = findFilesByName(query);
  return hits.slice(0, 2).map((file) => {
    const rec = readFileRecord(file.id);
    return {
      event: {
        name: "read_file",
        ok: Boolean(rec),
        detail: rec ? `Opened ${file.name} (${workspaceLabel(file.departmentId)})` : `Missing ${file.name}`,
        departmentId: file.departmentId,
        fileId: file.id,
      },
      extra: rec?.text.slice(0, 2500) || "",
    };
  });
}

export function aclPreview(accessibleDepartments: string[]): string {
  const allowed = accessibleDepartments.map((id) => workspaceLabel(migrateWorkspaceId(id))).join(", ") || "none";
  return `User write ACL: ${allowed}. Known departments: ${DEPARTMENT_IDS.map(workspaceLabel).join(", ")}.`;
}

export function canUserWrite(departmentId: string, accessibleDepartments: string[]) {
  return canWriteDepartment({ departmentId, accessibleDepartments });
}
