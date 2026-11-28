/**
 * Preview-only config for automated QA and model trials. Never applies in production.
 * Edit preview-overrides.json on a branch and redeploy the preview to point the
 * harness at a trial RunPod endpoint or flip harness flags. Only non-secret keys are
 * allowed; the RunPod key stays in Vercel env.
 */
import { PREVIEW_OVERRIDES, PREVIEW_PROFILES } from "./preview-overrides.config.ts";

const ALLOWED = new Set([
  "HATCH_LLM_BASE_URL",
  "HATCH_LLM_MODEL",
  "HATCH_ASK_TOOL_PROTOCOL",
  "HATCH_VERIFY_CLAIMS",
  "HATCH_THINK_ON_TOOLS",
  "HATCH_TOOL_STRICT",
  "HATCH_DAILY_MESSAGE_CAP",
  "HATCH_ASK_CONTEXT_TOKENS",
  "HATCH_AGENT_TOOL_LANE",
  "HATCH_AGENT_TOOL_PROTOCOL",
]);

export function applyPreviewOverrides(env: NodeJS.ProcessEnv = process.env, table: Record<string, string> = PREVIEW_OVERRIDES): string[] {
  if (env.VERCEL_ENV !== "preview") return [];
  const applied: string[] = [];
  for (const [key, value] of Object.entries(table || {})) {
    if (!ALLOWED.has(key) || typeof value !== "string") continue;
    if (key === "HATCH_LLM_BASE_URL" && !/^https:\/\/api\.runpod\.ai\/v2\/[a-z0-9]+\/openai\/v1$/.test(value)) continue;
    env[key] = value;
    applied.push(key);
  }
  return applied;
}

applyPreviewOverrides();

/** A named QA profile's settings, or null outside preview / for unknown names. */
export function previewProfile(name: string | undefined | null, env: NodeJS.ProcessEnv = process.env, table = PREVIEW_PROFILES): Record<string, string> | null {
  if (!name || env.VERCEL_ENV !== "preview") return null;
  const raw = table[name];
  if (!raw) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED.has(key) || typeof value !== "string") continue;
    if (key === "HATCH_LLM_BASE_URL" && !/^https:\/\/api\.runpod\.ai\/v2\/[a-z0-9]+\/openai\/v1$/.test(value)) continue;
    out[key] = value;
  }
  return out;
}
