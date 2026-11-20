import { randomBytes } from "crypto";
import { toolNeedsApproval } from "./action-cards.ts";
import { resolveAgent } from "./store.ts";
import { workspaceLabel } from "./departments.ts";
import { getThread, recordAuditEntry, removeFile, replaceThreadMessage } from "./store.ts";
import { connectorToolNeedsApproval, runConnectorTool } from "./connectors.ts";
import { executeTool, type ToolCall, type ToolContext } from "./tools.ts";
import type { ApprovalCard, ChatMessage, ToolEvent } from "./types.ts";
import { findVaultByName, scrubVaultSecrets, secretStrings } from "./vault.ts";

const SECRET_KEY = /pass(word)?|secret|token|cvv|cvc|pan|card|credential|api[_-]?key/i;

export { toolNeedsApproval };

function approvalCopy(name: string): { title: string; summary: string } {
  switch (name) {
    case "write_draft":
      return {
        title: "Write a draft",
        summary: "This saves a file into the file room. Nothing is written until you approve.",
      };
    case "handoff_to_department":
      return {
        title: "Send a handoff",
        summary: "This notifies another desk. Nothing is sent until you approve.",
      };
    case "delete_file":
      return {
        title: "Delete a file",
        summary: "This removes a file from the file room. Nothing is deleted until you approve.",
      };
    case "use_vault":
      return {
        title: "Use a vault item",
        summary:
          "The agent may reference this item by name. The secret stays in the vault and is not sent to the model.",
      };
    case "email_send":
      return { title: "Send an email", summary: "This sends an email from the connected mailbox. Nothing is sent until you approve." };
    case "calendar_create":
      return { title: "Create a calendar event", summary: "This writes to the connected calendar. Nothing is created until you approve." };
    case "slack_post_message":
      return { title: "Post to Slack", summary: "This posts a message. Nothing is posted until you approve." };
    case "notion_create_page":
      return { title: "Create a Notion page", summary: "This creates a page. Nothing is created until you approve." };
    case "github_create_issue":
      return { title: "Create a GitHub issue", summary: "This opens an issue. Nothing is created until you approve." };
    case "linear_create_issue":
      return { title: "Create a Linear issue", summary: "This opens an issue. Nothing is created until you approve." };
    default:
      return {
        title: "Approve this action",
        summary: "This changes something. It waits until you approve.",
      };
  }
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    departmentId: "File room",
    toDepartmentId: "Send to",
    filename: "File",
    text: "Draft",
    itemName: "Item",
    purpose: "Why",
    summary: "Summary",
    facts: "Facts",
    fileId: "File",
    reason: "Request",
    query: "Query",
  };
  return labels[key] || key;
}

function scrub(text: string, secrets: string[]) {
  return scrubVaultSecrets(
    secrets.reduce((out, secret) => (secret.length >= 4 ? out.split(secret).join("••••") : out), text || ""),
  );
}

/** Card safe to store on a message and show in chat. Secret arguments are dropped. */
export function approvalCardForCall(
  call: ToolCall,
  opts?: { agentId?: string; secrets?: string[] },
): ApprovalCard {
  const secrets = opts?.secrets || secretStrings();
  const copy = approvalCopy(call.name);
  const cleanArgs: Record<string, string> = {};
  const inputs: ApprovalCard["inputs"] = [];
  for (const [key, value] of Object.entries(call.arguments || {})) {
    const raw = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
    const hidden = SECRET_KEY.test(key);
    const label = fieldLabel(key);
    if (hidden) {
      inputs.push({ label, value: "Hidden — not sent to the model or the log" });
      continue;
    }
    const pretty = key === "departmentId" || key === "toDepartmentId" ? workspaceLabel(raw) : raw;
    const shown = scrub(pretty, secrets).slice(0, 700);
    cleanArgs[key] = scrub(raw, secrets).slice(0, 8000);
    inputs.push({ label, value: shown || "—" });
  }
  if (call.name === "use_vault") {
    inputs.push({ label: "Secret", value: "Hidden — not sent to the model or the log" });
  }
  if (!inputs.length) inputs.push({ label: "Request", value: "No details." });
  return {
    id: `appr-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
    tool: call.name,
    title: copy.title,
    summary: copy.summary,
    inputs,
    call: { name: call.name, arguments: cleanArgs },
    status: "pending",
    agentId: opts?.agentId,
  };
}

export function executeApprovedCall(
  call: { name: string; arguments: Record<string, string> },
  ctx: ToolContext,
): ToolEvent {
  if (call.name === "use_vault") {
    const itemName = call.arguments.itemName || call.arguments.name || "";
    const item = findVaultByName(itemName);
    if (!item) {
      return {
        name: "use_vault",
        ok: false,
        detail: `No vault item matched “${scrub(itemName, secretStrings()).slice(0, 80)}”. The secret was not read.`,
        input: `item: ${scrub(itemName, secretStrings()).slice(0, 80)}`,
      };
    }
    return {
      name: "use_vault",
      ok: true,
      detail: `Referenced “${item.name}” (${item.kind}). Secret withheld. Autofill is not applied in this version — use the reference in the form, then reveal the value in Vault if you need to type it.`,
      input: `item: ${item.name}`,
    };
  }
  if (call.name === "delete_file") {
    const fileId = call.arguments.fileId || "";
    if (!fileId || fileId === "unspecified") {
      return {
        name: "delete_file",
        ok: false,
        detail: "No file was named, so nothing was deleted.",
        input: "file: (none)",
      };
    }
    removeFile(ctx.workspaceId, fileId);
    return {
      name: "delete_file",
      ok: true,
      detail: `Deleted file ${fileId}.`,
      fileId,
      departmentId: ctx.workspaceId,
      input: `file: ${fileId}`,
    };
  }
  const result = executeTool(
    { name: call.name, arguments: call.arguments },
    { ...ctx, vaultApproved: call.name === "use_vault" },
  );
  return { ...result.event, input: result.event.input || publicInput(call.arguments) };
}

function publicInput(args: Record<string, string>) {
  return Object.entries(args)
    .filter(([key]) => !SECRET_KEY.test(key))
    .map(([key, value]) => `${key}: ${String(value).slice(0, 160)}`)
    .join("\n")
    .slice(0, 500);
}

export async function applyApprovalDecision(input: {
  threadId: string;
  messageId: string;
  decision: "approved" | "cancelled";
  actor?: string;
  accessibleDepartments?: string[];
  enterprise?: boolean;
  testerCode?: string;
}): Promise<{ ok: true; message: ChatMessage; event?: ToolEvent } | { ok: false; error: string }> {
  const thread = getThread(input.threadId);
  if (!thread) return { ok: false, error: "Unknown thread." };
  const message = thread.messages.find((item) => item.id === input.messageId);
  if (!message?.approval) return { ok: false, error: "This message has no approval." };
  if (message.approval.status !== "pending") {
    return { ok: false, error: "This approval was already decided." };
  }
  const agent = resolveAgent(message.approval.agentId || thread.agentId);
  const actor = (input.actor || "signed-in").slice(0, 80);
  if (input.decision === "cancelled") {
    const next: ChatMessage = {
      ...message,
      approval: { ...message.approval, status: "cancelled" },
      text: `${message.text}\n\nCancelled. Nothing was sent, changed, or deleted.`.trim(),
      done: true,
    };
    replaceThreadMessage(thread.id, next);
    recordAuditEntry(
      {
        name: message.approval.tool,
        ok: false,
        detail: scrubVaultSecrets(`Cancelled ${message.approval.title}. Nothing was sent, changed, or deleted.`),
        departmentId: agent.writeDepartmentId,
      },
      { actor, agentId: agent.id, kind: message.approval.tool === "use_vault" ? "vault" : "approval" },
    );
    return { ok: true, message: next };
  }

  const call = message.approval.call;
  const connector = /^(email_|calendar_|cloud_files_|slack_|notion_|github_|linear_|mcp_)/.test(call.name);
  const event = connector
    ? (await runConnectorTool(
        input.testerCode || "staff",
        call.name,
        call.arguments,
        input.decision === "approved" && (toolNeedsApproval(call.name) || connectorToolNeedsApproval(call.name, call.arguments)),
      )).event
    : executeApprovedCall(call, {
        workspaceId: agent.departmentId,
        accessibleDepartments: input.accessibleDepartments || [],
        enterprise: input.enterprise,
        defaultDepartmentId: agent.writeDepartmentId,
        vaultApproved: true,
      });
  event.detail = scrubVaultSecrets(event.detail);
  const next: ChatMessage = {
    ...message,
    approval: { ...message.approval, status: "approved" },
    text: `${message.text}\n\n${event.detail}`.trim(),
    tools: [...(message.tools || []), event],
    done: true,
  };
  replaceThreadMessage(thread.id, next);
  recordAuditEntry(
    {
      name: event.name,
      ok: event.ok,
      detail: scrubVaultSecrets(`Approved ${message.approval.title}. ${event.detail}`),
      departmentId: event.departmentId || agent.writeDepartmentId,
      fileId: event.fileId,
    },
    { actor, agentId: agent.id, kind: event.name === "use_vault" ? "vault" : "approval" },
  );
  return { ok: true, message: next, event };
}
