import { canWriteDepartment, knownDepartmentId, writeDeniedHandoffHint } from "./acl";
import { DEPARTMENT_IDS, migrateWorkspaceId, workspaceLabel } from "./departments";
import {
  createHandoff,
  fileListing,
  findFilesByName,
  readFileRecord,
  retrieveFirm,
  writeDraft,
} from "./store";
import type { DepartmentId, Source, ToolEvent } from "./types";

export const TOOL_NAMES = [
  "search_library",
  "list_files",
  "read_file",
  "write_draft",
  "handoff_to_department",
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
      "Notify a peer department inbox and record what was learned. Does not write their Files.",
    parameters: { toDepartmentId: "little-elm | prosper | hq-ops", summary: "string", facts: "string" },
  },
];

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolContext {
  workspaceId: DepartmentId;
  accessibleDepartments: string[];
  enterprise?: boolean;
}

const TOOL_LINE = /(?:^|\n)TOOL\s*(\{[\s\S]*\})\s*$/;

export function parseToolTrailer(text: string): ToolCall | null {
  const match = text.match(TOOL_LINE);
  if (!match) return null;
  try {
    const json = JSON.parse(match[1]) as { name?: string; arguments?: Record<string, unknown>; args?: Record<string, unknown> };
    if (!json.name) return null;
    return { name: json.name, arguments: json.arguments || json.args || {} };
  } catch {
    return null;
  }
}

export function stripToolTrailer(text: string): string {
  return text.replace(TOOL_LINE, "").trim();
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
      },
      extra: hit.text.slice(0, 4000),
    };
  }

  if (name === "write_draft") {
    const departmentId = asString(args.departmentId) || (ctx.workspaceId === "enterprise" ? "" : ctx.workspaceId);
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
    return { event: result.event };
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
