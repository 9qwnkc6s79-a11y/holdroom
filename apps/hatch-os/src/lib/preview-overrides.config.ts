/** Preview-only overrides (see preview-overrides.ts). Keep empty on main. */
export const PREVIEW_OVERRIDES: Record<string, string> = {
  HATCH_DAILY_MESSAGE_CAP: "2000",
};

/** Named configs the persona QA picks per request with the x-hatch-qa-profile header (preview only). */
export const PREVIEW_PROFILES: Record<string, Record<string, string>> = {
  before: { HATCH_VERIFY_CLAIMS: "off", HATCH_ASK_TOOL_PROTOCOL: "text" },
  after: { HATCH_VERIFY_CLAIMS: "on", HATCH_ASK_TOOL_PROTOCOL: "text" },
  "hermes36b-native": { HATCH_AGENT_TOOL_LANE: "agent", HATCH_AGENT_TOOL_PROTOCOL: "native", HATCH_VERIFY_CLAIMS: "on" },
  "qwen27b-native": {
    HATCH_LLM_BASE_URL: "https://api.runpod.ai/v2/0sr9gxadk8ns9f/openai/v1",
    HATCH_LLM_MODEL: "Qwen/Qwen3.8-27B-FP8",
    HATCH_ASK_TOOL_PROTOCOL: "native",
    HATCH_VERIFY_CLAIMS: "on",
  },
  "qwen27b-native-think": {
    HATCH_LLM_BASE_URL: "https://api.runpod.ai/v2/0sr9gxadk8ns9f/openai/v1",
    HATCH_LLM_MODEL: "Qwen/Qwen3.8-27B-FP8",
    HATCH_ASK_TOOL_PROTOCOL: "native",
    HATCH_THINK_ON_TOOLS: "on",
    HATCH_VERIFY_CLAIMS: "on",
  },
};
