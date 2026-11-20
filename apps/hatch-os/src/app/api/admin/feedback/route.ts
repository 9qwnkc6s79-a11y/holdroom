import { readRecords } from "@/lib/beta-store";

export const dynamic = "force-dynamic";

function allowed(req: Request) {
  const expected = process.env.HATCH_ADMIN_CODE || "";
  const given = req.headers.get("x-hatch-admin") || "";
  return Boolean(expected) && given === expected;
}

export async function GET(req: Request) {
  if (!allowed(req)) return Response.json({ error: "That admin code is not recognized." }, { status: 401 });
  const [feedback, events] = await Promise.all([
    readRecords<Record<string, unknown>>("feedback"),
    readRecords<Record<string, unknown>>("events"),
  ]);
  feedback.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const sessions = events.filter((event) => event.kind === "session").length;
  const messages = events.filter((event) => event.kind === "message").length;
  const errors = events.filter((event) => event.kind === "error").length;
  const latencies = events
    .filter((event) => event.kind === "latency" && typeof event.latencyMs === "number")
    .map((event) => event.latencyMs as number);
  const latencyMs = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null;
  return Response.json({
    feedback: feedback.slice(0, 100),
    usage: { sessions, messages, errors, replies: latencies.length, latencyMs },
  });
}
