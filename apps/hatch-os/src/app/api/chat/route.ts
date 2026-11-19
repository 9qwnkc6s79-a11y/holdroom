import { runChatTurn } from "@/lib/chat";
import { liveRunpodReady, startLiveTurn } from "@/lib/chat-live";
import { demoModeEnabled } from "@/lib/demo";

export const dynamic = "force-dynamic";
// Each request only submits or checks a RunPod job. The browser polls, so a
// cold start can outlast this limit without the function sitting on it.
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    roomId?: string;
    departmentId?: string;
    threadId?: string;
    query?: string;
    accessibleDepartments?: string[];
    enterprise?: boolean;
    attachments?: { fileId: string; name: string; kind: "PDF" | "Office" | "Markdown" | "Image" }[];
    agent?: boolean;
    agentId?: string;
    actor?: string;
    failFast?: boolean;
    approvals?: "wait" | "immediate";
    defaultDepartmentId?: string;
    replyTo?: { text: string };
  } | null;

  const query = (body?.query || "").trim();
  if (!query) {
    return Response.json({ error: "Ask a question." }, { status: 400 });
  }

  if (!demoModeEnabled() && liveRunpodReady()) {
    try {
      const result = await startLiveTurn({
        query,
        departmentId: body?.departmentId,
        roomId: body?.roomId,
        threadId: body?.threadId,
        accessibleDepartments: body?.accessibleDepartments,
        enterprise: body?.enterprise,
        attachments: body?.attachments,
        agent: body?.agent,
        agentId: body?.agentId,
        actor: body?.actor,
        defaultDepartmentId: body?.defaultDepartmentId,
        replyTo: body?.replyTo,
      });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The firm model could not be reached.";
      return Response.json({
        phase: "done",
        error: true,
        modelOffline: true,
        text: `The model is offline. ${message} Nothing was sent to an outside AI lab.`,
      });
    }
  }

  const encoder = new TextEncoder();
  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
  };

  const stream = new ReadableStream({
    async start(controller) {
      let threadId = body?.threadId || "";
      try {
        const result = await runChatTurn(
          {
            query,
            departmentId: body?.departmentId,
            roomId: body?.roomId,
            threadId: body?.threadId,
            accessibleDepartments: body?.accessibleDepartments,
            enterprise: body?.enterprise,
            attachments: body?.attachments,
            agent: body?.agent,
            agentId: body?.agentId,
            actor: body?.actor,
            failFast: body?.failFast !== false,
            approvals: body?.approvals || "wait",
            defaultDepartmentId: body?.defaultDepartmentId,
            replyTo: body?.replyTo,
          },
          {
            onStart: (info) => {
              threadId = info.threadId;
            },
            onDelta: (delta) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta, threadId })}\n\n`));
            },
          },
        );
        threadId = result.threadId;
        if (result.error && result.text) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: true, delta: result.text, threadId })}\n\n`),
          );
        }
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              text: result.text,
              sources: result.sources,
              tools: result.tools,
              threadId: result.threadId,
              title: result.title,
              messageId: result.messageId,
              approval: result.pendingApproval,
              demo: result.demo || undefined,
              modelOffline: result.modelOffline || undefined,
              error: result.error || undefined,
            })}\n\n`,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "LLM failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: true, delta: msg, threadId })}\n\n`),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, sources: [], tools: [], threadId, error: true })}\n\n`,
          ),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, { headers });
}
