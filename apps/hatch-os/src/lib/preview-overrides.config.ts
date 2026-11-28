/** Preview-only overrides (see preview-overrides.ts). Keep empty on main. */
export const PREVIEW_OVERRIDES: Record<string, string> = {
  // Preview usage is stored separately from production. Raise the preview cap so
  // HAT-12 feature tests can finish after today's automated QA exhausted the default 200.
  HATCH_DAILY_MESSAGE_CAP: "600",
};

/** Named configs the persona QA picks per request with the x-hatch-qa-profile header (preview only). */
export const PREVIEW_PROFILES: Record<string, Record<string, string>> = {};
