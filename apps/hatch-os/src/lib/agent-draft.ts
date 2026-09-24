import { looksSoftDraft } from "./agent-intent.ts";
import { DEPARTMENT_IDS, HQ_OPS, LITTLE_ELM, PROSPER, migrateWorkspaceId } from "./departments.ts";
import type { ToolCall } from "./tool-parse.ts";
import type { ToolEvent } from "./types.ts";

export const DRAFT_NUDGE =
  "This turn is a draft/write-note. Call write_draft now with departmentId (little-elm, prosper, or hq-ops — not enterprise), a filename, and the note text. Do not answer in prose only.";

export const PROSE_ONLY_DRAFT =
  "No write_draft ran — this stayed as prose. Name Little Elm, Prosper, or HQ Ops (or /dept) and ask again to save the file.";

export function parseMentionedDepartment(text: string): string {
  const raw = text || "";
  if (/\blittle[\s-]?elm\b/i.test(raw)) return LITTLE_ELM;
  if (/\bprosper\b/i.test(raw)) return PROSPER;
  if (/\bhq[\s-]?ops\b|\bhq ops\b/i.test(raw)) return HQ_OPS;
  const id = migrateWorkspaceId(raw.trim().toLowerCase());
  return (DEPARTMENT_IDS as readonly string[]).includes(id) ? id : "";
}

export function resolveDraftDepartment(query: string, fallback?: string): string {
  const mentioned = parseMentionedDepartment(query);
  if (mentioned) return mentioned;
  const fb = fallback ? migrateWorkspaceId(fallback) : "";
  return (DEPARTMENT_IDS as readonly string[]).includes(fb) ? fb : "";
}

export function draftFilename(query: string): string {
  const slug = (query || "")
    .toLowerCase()
    .replace(/\b(draft|write|create|save|a|short|note|notes|file|doc|document|memo|checklist)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "notes"}.md`;
}

export function hasWriteDraft(tools: Array<Pick<ToolEvent, "name">> | undefined): boolean {
  return Boolean(tools?.some((t) => t.name === "write_draft"));
}

export function shouldNudgeSoftDraft(
  turnIndex: number,
  query: string,
  tools: Array<Pick<ToolEvent, "name">> | undefined,
): boolean {
  return turnIndex === 0 && looksSoftDraft(query) && !hasWriteDraft(tools);
}

export function finishSoftDraft(input: {
  query: string;
  text: string;
  tools: Array<Pick<ToolEvent, "name">>;
  defaultDepartmentId?: string;
}): { text: string; toolCall?: ToolCall; notice?: string } {
  const text = (input.text || "").trim();
  if (!looksSoftDraft(input.query) || hasWriteDraft(input.tools)) {
    return { text };
  }
  const departmentId = resolveDraftDepartment(input.query, input.defaultDepartmentId);
  if (departmentId && text) {
    return {
      text,
      toolCall: {
        name: "write_draft",
        arguments: {
          departmentId,
          filename: draftFilename(input.query),
          text,
        },
      },
    };
  }
  return { text, notice: PROSE_ONLY_DRAFT };
}
