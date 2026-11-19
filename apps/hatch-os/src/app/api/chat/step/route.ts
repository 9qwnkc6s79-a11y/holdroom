import { advanceLiveTurn, type LiveTurnState } from "@/lib/chat-live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { state?: LiveTurnState } | null;
  if (!body?.state || body.state.version !== 1 || !body.state.threadId) {
    return Response.json({ error: "Missing the model job." }, { status: 400 });
  }
  try {
    const result = await advanceLiveTurn(body.state);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The firm model could not be reached.";
    return Response.json(
      {
        phase: "done",
        threadId: body.state.threadId,
        messageId: body.state.messageId,
        text: `The model is offline. ${message} Nothing was sent to an outside AI lab.`,
        error: true,
        modelOffline: true,
      },
      { status: 200 },
    );
  }
}
