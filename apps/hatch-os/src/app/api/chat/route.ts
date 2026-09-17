import { pickAnswer, type LibraryHint } from "@/lib/answers";
import { ragSearch } from "@/lib/adapters";
import { MATTER_ALPHA } from "@/lib/mock-data";
import { belongsToRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    roomId?: string;
    query?: string;
    files?: LibraryHint[];
  } | null;

  const roomId = body?.roomId || MATTER_ALPHA;
  const query = (body?.query || "").trim();
  if (!query) {
    return Response.json({ error: "Ask a question." }, { status: 400 });
  }

  let pack = pickAnswer(roomId, query, body?.files);
  const isolated = /not in this room|will not retrieve the other matter|will not retrieve the other fund/.test(
    pack.text,
  );

  const rag = await ragSearch(query);
  if (rag && rag.length && !isolated && pack.sources.length === 0) {
    const scoped = rag.filter((s) => belongsToRoom(s.room, roomId));
    if (scoped.length) {
      pack = {
        text: `From this room’s library only: ${scoped[0].snippet}`,
        sources: scoped,
      };
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const chunks = pack.text.match(/\S+\s*/g) ?? [pack.text];
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
        await delay(18);
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ done: true, sources: pack.sources })}\n\n`),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
