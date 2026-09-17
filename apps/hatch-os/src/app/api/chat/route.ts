import { probeLlm, streamLlm, connectHelp, llmConfig, isRunpodUrl } from "@/lib/llm";
import { LITTLE_ELM, migrateWorkspaceId } from "@/lib/departments";
import { buildAskMessages } from "@/lib/prompt";
import {
  appendThreadMessages,
  createThread,
  fileListing,
  getThread,
  retrieveFirm,
} from "@/lib/store";
import { executeTool, mentionedReads, parseToolTrailer, stripToolTrailer } from "@/lib/tools";
import type { ChatAttachment, ChatMessage, ToolEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

function newMsg(role: ChatMessage["role"], text: string, extra?: Partial<ChatMessage>): ChatMessage {
  return {
    id: `${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    text,
    done: role === "user",
    sources: [],
    ...extra,
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    roomId?: string;
    departmentId?: string;
    threadId?: string;
    query?: string;
    accessibleDepartments?: string[];
    enterprise?: boolean;
    attachments?: ChatAttachment[];
  } | null;

  const workspaceId = migrateWorkspaceId(body?.departmentId || body?.roomId || LITTLE_ELM);
  const query = (body?.query || "").trim();
  const accessibleDepartments = body?.accessibleDepartments || [];
  if (!query) {
    return Response.json({ error: "Ask a question." }, { status: 400 });
  }

  const thread = body?.threadId ? getThread(body.threadId) : createThread(workspaceId, query.slice(0, 42));
  const active = thread || createThread(workspaceId, query.slice(0, 42));

  const sources = retrieveFirm(query);
  const listing = fileListing(workspaceId);
  const reads = mentionedReads(query);
  const toolResults: ToolEvent[] = reads.map((r) => r.event);
  const extra = reads.map((r) => r.extra).filter(Boolean);

  const userMsg = newMsg("user", query, {
    attachments: Array.isArray(body?.attachments) ? body.attachments : undefined,
  });
  const assistantMsg = newMsg("assistant", "", { done: false });
  appendThreadMessages(active.id, [userMsg]);

  const probe = await probeLlm();
  const encoder = new TextEncoder();
  const { primary } = llmConfig();
  const runpodReady = isRunpodUrl(primary.rawBase) && Boolean(primary.apiKey);

  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
  };

  function failStream(detail: string) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: true, delta: detail, threadId: active.id })}\n\n`));
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, sources: [], tools: toolResults, threadId: active.id, error: true })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    return new Response(stream, { headers });
  }

  if (!probe.connected && !runpodReady) {
    const help = connectHelp(probe);
    const detail = probe.error ? `${probe.error}\n\n${help}` : help;
    appendThreadMessages(active.id, [{ ...assistantMsg, text: detail, done: true, sources: [], tools: toolResults }]);
    return failStream(detail);
  }

  const messages = buildAskMessages({
    workspaceId,
    query,
    sources,
    fileListing: listing,
    toolResults,
    extra,
    accessibleDepartments,
  });

  const stream = new ReadableStream({
    async start(controller) {
      let text = "";
      try {
        await streamLlm(messages, (delta) => {
          text += delta;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta, threadId: active.id })}\n\n`));
        });
        const call = parseToolTrailer(text);
        const visible = stripToolTrailer(text);
        if (call) {
          const result = executeTool(call, {
            workspaceId,
            accessibleDepartments,
            enterprise: body?.enterprise,
          });
          toolResults.push(result.event);
          if (result.sources?.length) sources.push(...result.sources);
        }
        const final: ChatMessage = {
          ...assistantMsg,
          text: visible || text,
          done: true,
          sources,
          tools: toolResults,
        };
        appendThreadMessages(active.id, [final]);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              sources,
              tools: toolResults,
              threadId: active.id,
              title: getThread(active.id)?.title,
            })}\n\n`,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "LLM failed";
        const help = `${msg}\n\n${connectHelp(probe)}`;
        appendThreadMessages(active.id, [{ ...assistantMsg, text: help, done: true, sources: [], tools: toolResults }]);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: true, delta: help, threadId: active.id })}\n\n`));
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, sources: [], tools: toolResults, threadId: active.id, error: true })}\n\n`),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, { headers });
}
