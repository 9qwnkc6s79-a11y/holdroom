import { probeLlm, streamLlm, connectHelp } from "@/lib/llm";
import { buildAskMessages } from "@/lib/prompt";
import { retrieve } from "@/lib/store";
import { LITTLE_ELM, migrateRoomId } from "@/lib/rooms";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    roomId?: string;
    query?: string;
  } | null;

  const roomId = migrateRoomId(body?.roomId || LITTLE_ELM);
  const query = (body?.query || "").trim();
  if (!query) {
    return Response.json({ error: "Ask a question." }, { status: 400 });
  }

  const sources = retrieve(roomId, query);
  const probe = await probeLlm();
  const encoder = new TextEncoder();

  if (!probe.connected) {
    const help = connectHelp(probe);
    const detail = probe.error ? `${probe.error}\n\n${help}` : help;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: true, delta: detail })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, sources: [], error: true })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const messages = buildAskMessages(roomId, query, sources);
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await streamLlm(messages, (delta) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
        });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, sources })}\n\n`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "LLM failed";
        const help = `${msg}\n\n${connectHelp(probe)}`;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: true, delta: help })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, sources: [], error: true })}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
