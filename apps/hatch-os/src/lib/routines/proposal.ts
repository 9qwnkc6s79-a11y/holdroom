/**
 * Chat → routine. "every weekday 7am brief me on vendor threads" becomes a
 * proposal card (Save / Edit / Cancel). Nothing is saved until the user saves.
 * The card is a normal approval card (tool `routine_create`), so build 6 of
 * the iPhone app shows it with Approve / Deny and approving saves it.
 */
import { randomBytes } from "node:crypto";
import type { ApprovalCard } from "../types.ts";
import { DEFAULT_TZ, describeCron, formatWhen, validateCron } from "./cron.ts";
import { parseRoutineAsk, parseWhen, type RoutineProposal } from "./parse.ts";
import { applyInput, saveDoc, loadDoc } from "./store.ts";
import type { RoutineRecord } from "./types.ts";

export const ROUTINE_TOOL = "routine_create";

function modeLine(p: Pick<RoutineProposal, "mode">) {
  if (p.mode === "reminder") return "Posts your reminder. Does not use the firm model.";
  if (p.mode === "notify") return "Posts who wrote and the subject. Does not use the firm model.";
  return "Runs the firm model each time (can wake the GPU). Anything it wants to send waits for your approval.";
}

export function proposalCard(p: RoutineProposal, agentId?: string): ApprovalCard {
  const inputs = [
    { label: "Name", value: p.name },
    { label: "When", value: p.when },
    { label: "Does", value: p.prompt.slice(0, 700) },
    { label: "Model", value: p.mode === "agent" ? "Firm model" : "No model" },
  ];
  if (p.assumptions.length) inputs.push({ label: "Note", value: p.assumptions.join(" ").slice(0, 700) });
  return {
    id: `appr-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
    tool: ROUTINE_TOOL,
    title: "Save this routine?",
    summary: modeLine(p),
    inputs,
    call: {
      name: ROUTINE_TOOL,
      arguments: {
        name: p.name,
        prompt: p.prompt,
        mode: p.mode,
        when: p.when,
        cron: p.cron || "",
        runAt: p.runAt || "",
        timezone: p.timezone,
        triggerQuery: p.triggerQuery || "",
        agentId: agentId || "",
      },
    },
    status: "pending",
    agentId,
  };
}

export function proposalText(p: RoutineProposal): string {
  return `I can set that up as a routine: **${p.name}**, ${p.when.charAt(0).toLowerCase()}${p.when.slice(1)}. Save it, edit it, or cancel. Nothing is saved until you do.`;
}

/** Edits from the card. `when` is plain language ("fridays at 4pm") and wins over cron/runAt. */
export interface ProposalEdits {
  name?: string;
  prompt?: string;
  when?: string;
  mode?: string;
  triggerQuery?: string;
}

export function mergeEdits(args: Record<string, string>, edits?: ProposalEdits | null, now = new Date()): { ok: true; args: Record<string, string> } | { ok: false; error: string } {
  const next = { ...args };
  if (!edits) return { ok: true, args: next };
  if (typeof edits.name === "string" && edits.name.trim()) next.name = edits.name.trim().slice(0, 80);
  if (typeof edits.prompt === "string" && edits.prompt.trim()) next.prompt = edits.prompt.trim().slice(0, 2000);
  if (edits.mode === "agent" || edits.mode === "reminder" || edits.mode === "notify") next.mode = edits.mode;
  if (typeof edits.triggerQuery === "string" && edits.triggerQuery.trim()) {
    next.triggerQuery = edits.triggerQuery.trim().slice(0, 300);
    next.cron = "";
    next.runAt = "";
  }
  if (typeof edits.when === "string" && edits.when.trim() && edits.when.trim() !== (args.when || "").trim()) {
    const parsed = parseWhen(edits.when, { now, timezone: args.timezone || DEFAULT_TZ });
    if (!parsed) return { ok: false, error: `I couldn't read “${edits.when.trim()}” as a time. Try “weekdays at 7am” or “every Monday at 9”.` };
    next.cron = parsed.cron || "";
    next.runAt = parsed.runAt || "";
    next.triggerQuery = "";
    if (next.mode === "notify") next.mode = "agent";
  }
  return { ok: true, args: next };
}

/** Save a routine from (possibly edited) card arguments. */
export async function saveProposal(scope: string, args: Record<string, string>, now = new Date()): Promise<{ ok: true; routine: RoutineRecord } | { ok: false; error: string }> {
  const doc = await loadDoc(scope);
  const applied = applyInput(
    doc,
    {
      name: args.name,
      prompt: args.prompt,
      mode: args.mode,
      cron: args.cron || undefined,
      runAt: args.runAt || undefined,
      triggerQuery: args.triggerQuery || undefined,
      timezone: args.timezone || DEFAULT_TZ,
      agentId: args.agentId || undefined,
      enabled: true,
      source: "chat",
    },
    now,
  );
  if (!applied.ok) return { ok: false, error: applied.error };
  await saveDoc(doc);
  return { ok: true, routine: applied.routine };
}

export function savedDetail(routine: RoutineRecord): string {
  const next = routine.nextRunAt ? ` Next run: ${formatWhen(routine.nextRunAt, routine.timezone)}.` : routine.trigger ? " Checking email every 15 minutes." : "";
  return `Saved “${routine.name}” (${routine.schedule}).${next} You can pause, edit, or delete it in Routines.`;
}

/** Card rows after a save, so the card shows what was actually saved. */
export function savedInputs(routine: RoutineRecord): ApprovalCard["inputs"] {
  return [
    { label: "Name", value: routine.name },
    { label: "When", value: routine.schedule },
    { label: "Does", value: routine.prompt.slice(0, 700) },
    { label: "Model", value: routine.mode === "agent" ? "Firm model" : "No model" },
  ];
}

export { parseRoutineAsk, describeCron, validateCron };
