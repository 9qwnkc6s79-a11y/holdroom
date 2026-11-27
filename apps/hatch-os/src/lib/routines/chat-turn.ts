/** The chat side: detect a routine ask and answer with a proposal card, without a model call. */
import { newChatMessage } from "../chat.ts";
import { NORTH_DESK, migrateWorkspaceId } from "../departments.ts";
import { loadMemory } from "../harness/memory-store.ts";
import { appendThreadMessages, getThread, resolveAgent } from "../store.ts";
import { createThreadScoped, getThreadScoped, saveThreadScoped } from "../thread-store.ts";
import type { ApprovalCard } from "../types.ts";
import { DEFAULT_TZ } from "./cron.ts";
import { looksLikeRoutine, parseRoutineAsk } from "./parse.ts";
import { proposalCard, proposalText } from "./proposal.ts";

export interface RoutineChatResult {
  phase: "done";
  harness: true;
  routineProposal: true;
  threadId: string;
  messageId: string;
  text: string;
  approval: ApprovalCard;
  tools: [];
  sources: [];
  activity: [];
  status: string;
  title?: string;
}

/** Off with HATCH_ROUTINE_CHAT=off. */
export function routineChatEnabled() {
  return (process.env.HATCH_ROUTINE_CHAT || "on").toLowerCase() !== "off" && (process.env.HATCH_ROUTINES || "on").toLowerCase() !== "off";
}

export async function maybeProposeRoutine(input: {
  scope: string;
  query: string;
  threadId?: string;
  agentId?: string;
  departmentId?: string;
  replyTo?: { text: string };
  hasAttachments?: boolean;
  now?: Date;
}): Promise<RoutineChatResult | null> {
  if (!routineChatEnabled() || input.hasAttachments) return null;
  if (!looksLikeRoutine(input.query)) return null;
  const memory = await loadMemory(input.scope).catch(() => null);
  const proposal = parseRoutineAsk(input.query, {
    now: input.now,
    timezone: process.env.HATCH_TIME_ZONE || DEFAULT_TZ,
    people: memory?.people?.map((p) => ({ name: p.name, aliases: p.aliases, email: p.email })),
  });
  if (!proposal) return null;
  const agent = resolveAgent(input.agentId);
  const existing = input.threadId ? await getThreadScoped(input.scope, input.threadId) : null;
  const thread = existing || (await createThreadScoped(input.scope, migrateWorkspaceId(input.departmentId || agent.departmentId || NORTH_DESK), input.query.slice(0, 42), agent.id));
  const card = proposalCard(proposal, agent.id);
  const text = proposalText(proposal);
  const user = newChatMessage("user", input.query, { replyTo: input.replyTo });
  const reply = { ...newChatMessage("assistant", text), done: true, approval: card };
  appendThreadMessages(thread.id, [user, reply]);
  await saveThreadScoped(input.scope, getThread(thread.id));
  return {
    phase: "done",
    harness: true,
    routineProposal: true,
    threadId: thread.id,
    messageId: reply.id,
    text,
    approval: card,
    tools: [],
    sources: [],
    activity: [],
    status: "",
    title: getThread(thread.id)?.title,
  };
}
