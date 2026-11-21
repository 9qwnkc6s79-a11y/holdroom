import { visionLlmConfig } from "@/lib/llm";

export const dynamic = "force-dynamic";

/** Whether this deployment can send pictures to an open-weight vision model. No secrets. */
export function GET() {
  const cfg = visionLlmConfig();
  return Response.json({
    enabled: cfg.enabled,
    model: cfg.endpoint?.model || "",
  });
}
