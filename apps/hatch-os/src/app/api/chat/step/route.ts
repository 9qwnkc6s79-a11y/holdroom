import { saveRecord } from "@/lib/beta-store";
import { advanceLiveTurn, type LiveTurnState } from "@/lib/chat-live";
import { advanceHarnessTurn, type HarnessLiveState } from "@/lib/harness/live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { state?: LiveTurnState | HarnessLiveState } | null;
  if (!body?.state || (body.state.version !== 1 && body.state.version !== 2) || !body.state.threadId) {
    return Response.json({ error: "Missing the model job." }, { status: 400 });
  }
  try {
    const result = body.state.version === 2 ? await advanceHarnessTurn(body.state) : await advanceLiveTurn(body.state);
    if (result.phase === "done" && body.state.startedAt) {
      void saveRecord(`events/${new Date().toISOString().slice(0, 10)}`, `${Date.now()}-lat`, {
        kind: result.error ? "error" : "latency",
        code: body.state.testerCode || "staff",
        latencyMs: Date.now() - body.state.startedAt,
        at: new Date().toISOString(),
      }).catch(() => undefined);
    }
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
