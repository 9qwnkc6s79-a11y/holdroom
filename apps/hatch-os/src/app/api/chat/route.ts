import { pickAnswer } from "@/lib/answers";
import { ragSearch } from "@/lib/adapters";
import { FUND_A, FUND_B } from "@/lib/mock-data";
import type { Source } from "@/lib/types";

export const dynamic = "force-dynamic";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function belongsToRoom(source: Source, roomId: string): boolean {
  const room = source.room.toLowerCase();
  if (roomId === FUND_A) return room.includes("fund a") || room.includes("alpha") || room === "fund-a";
  if (roomId === FUND_B) return room.includes("fund b") || room === "fund-b";
  return false;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    roomId?: string;
    query?: string;
  } | null;

  const roomId = body?.roomId || FUND_A;
  const query = (body?.query || "").trim();
  if (!query) {
    return Response.json({ error: "Ask a question." }, { status: 400 });
  }

  let pack = pickAnswer(roomId, query);
  const isolated = /not in this room|will not retrieve the other fund/.test(pack.text);

  const rag = await ragSearch(query);
  if (rag && rag.length && !isolated && pack.sources.length === 0) {
    const scoped = rag.filter((s) => belongsToRoom(s, roomId));
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
