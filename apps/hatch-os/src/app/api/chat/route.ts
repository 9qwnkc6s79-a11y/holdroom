import { runChatTurn } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

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
  } | null;

  const query = (body?.query || "").trim();
  if (!query) {
    return Response.json({ error: "Ask a question." }, { status: 400 });
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
              sources: result.sources,
              tools: result.tools,
              threadId: result.threadId,
              title: result.title,
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
