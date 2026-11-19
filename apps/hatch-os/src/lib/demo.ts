import { approvalCardForCall } from "./approvals.ts";
import { resolveAgent } from "./store.ts";
import type { ApprovalCard, Source, ToolEvent } from "./types.ts";
import { findVaultByName, listVaultPublic } from "./vault.ts";

export function demoModeEnabled() {
  const value = (process.env.HATCH_DEMO_MODE || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function modelOfflineMessage(detail?: string) {
  const why = detail ? ` (${detail})` : "";
  return `The model is offline${why}. Hatch could not reach the firm’s model, so this reply was not generated. Nothing was sent to an outside AI lab. Restore the RunPod endpoints, or set HATCH_DEMO_MODE=1 to walk the interface.`;
}

export async function streamText(text: string, onDelta?: (delta: string) => void) {
  if (!onDelta) return;
  const size = 18;
  for (let i = 0; i < text.length; i += size) {
    onDelta(text.slice(i, i + size));
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

const VAULT_ASK = /\b(vault|password|api key|token|card number|login)\b/i;
const DELETE_ASK = /\b(delete|erase|remove the file)\b/i;
const SEND_ASK = /\b(send|email|handoff)\b/i;
const DRAFT_ASK = /\b(draft|memo|write|save)\b/i;

export function planDemoReply(input: {
  query: string;
  agentId?: string;
  sources: Source[];
}): { text: string; tools: ToolEvent[]; approval?: ApprovalCard; sources: Source[] } {
  const agent = resolveAgent(input.agentId);
  const query = input.query.trim();
  const sources = input.sources;
  const tools: ToolEvent[] = [
    {
      name: "search_library",
      ok: true,
      detail: sources.length
        ? `Searched the file room: ${sources.map((source) => source.file).join(", ")}`
        : "Searched the file room. No passage matched.",
      input: query.slice(0, 200),
    },
  ];

  if (VAULT_ASK.test(query)) {
    const named = query.match(/vault item\s+["“]?([^"”]+)["”]?/i);
    const item = (named && findVaultByName(named[1])) || listVaultPublic()[0] || null;
    if (!item) {
      return {
        text: "The vault is empty. Add a login, API key, or card in Vault, with a note on when to use it. I will not invent a secret.",
        tools,
        sources,
      };
    }
    const approval = approvalCardForCall(
      {
        name: "use_vault",
        arguments: { itemName: item.name, purpose: query.slice(0, 180) },
      },
      { agentId: agent.id, secrets: [] },
    );
    return {
      text: `I can reference **${item.name}** (${item.kind}) from the vault.\n\n${item.whenToUse}\n\nThe secret stays in the vault. It is not in this chat and it is not sent to a model. Approve below if I should use the reference. Filling it into a form is not automatic in this version.`,
      tools,
      approval,
      sources,
    };
  }

  if (DELETE_ASK.test(query)) {
    const approval = approvalCardForCall(
      {
        name: "delete_file",
        arguments: { fileId: "unspecified", reason: query.slice(0, 180) },
      },
      { agentId: agent.id, secrets: [] },
    );
    return {
      text: "I won’t delete anything until you approve it. No file was removed.",
      tools,
      approval,
      sources,
    };
  }

  if (SEND_ASK.test(query) && !DRAFT_ASK.test(query)) {
    const approval = approvalCardForCall(
      {
        name: "handoff_to_department",
        arguments: {
          toDepartmentId: agent.writeDepartmentId,
          summary: query.slice(0, 180),
          facts: "Prepared in Hatch OS. Not sent until approved.",
        },
      },
      { agentId: agent.id, secrets: [] },
    );
    return {
      text: "Here is the note I would send. It stays here until you approve.",
      tools,
      approval,
      sources,
    };
  }

  if (DRAFT_ASK.test(query)) {
    const body = [`# ${agent.name} draft`, "", query, "", "Prepared for review. Not filed until you approve."].join("\n");
    const approval = approvalCardForCall(
      {
        name: "write_draft",
        arguments: {
          departmentId: agent.writeDepartmentId,
          filename: "memo.md",
          text: body,
        },
      },
      { agentId: agent.id, secrets: [] },
    );
    return {
      text: `I drafted a memo for ${agent.name}. It is not in the file room yet.\n\n> ${query}`,
      tools,
      approval,
      sources,
    };
  }

  const cite = sources[0];
  const text = cite
    ? `From the file room, **${cite.file}** is the closest note.\n\n${cite.snippet.slice(0, 360)}\n\nI can draft from this if you want a memo. I won’t file or send it without approval.`
    : `I looked through the file room and didn’t find a passage on that.\n\n${agent.description}\n\nAttach a file to this agent’s file room, or ask me to draft something.`;
  return { text, tools, sources };
}
