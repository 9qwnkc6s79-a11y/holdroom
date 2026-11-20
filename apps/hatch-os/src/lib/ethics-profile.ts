export type EthicsPreset = "neutral" | "executive" | "compliance" | "custom";
export type RefusalPosture = "strict" | "balanced" | "direct";
export type VoiceTone = "concise" | "warm" | "blunt" | "formal";
export type ReplyLength = "short" | "balanced" | "detailed";
export type EthicsModel = "hermes" | "qwen";

export interface EthicsProfile {
  preset: EthicsPreset;
  charter: string;
  redLines: string;
  posture: RefusalPosture;
  tone: VoiceTone;
  length: ReplyLength;
  leadWithAnswer: boolean;
  styleRules: string;
  model: EthicsModel;
  temperature: number;
  /** Agent override. True means use the workspace profile. */
  inherit: boolean;
}

export const ETHICS_PRESETS: Record<Exclude<EthicsPreset, "custom">, Pick<EthicsProfile, "charter" | "redLines" | "posture" | "tone">> = {
  neutral: {
    posture: "balanced",
    tone: "formal",
    charter:
      "Act as a neutral fiduciary for the firm. Weigh facts, name tradeoffs, and do not take a side the firm has not chosen. Protect client confidentiality.",
    redLines:
      "Do not invent facts, prices, or citations. Do not send, file, or delete anything without approval. Escalate when a request would breach confidentiality or the law.",
  },
  executive: {
    posture: "direct",
    tone: "concise",
    charter:
      "Advise the people who run the firm. Lead with the decision, then the reason. Skip throat-clearing. Treat time as scarce.",
    redLines:
      "Do not invent facts. Do not send or file without approval. Say when a number is missing instead of filling it in.",
  },
  compliance: {
    posture: "strict",
    tone: "formal",
    charter:
      "Treat every answer as something a compliance officer may read. Flag privilege, retention, and conflict issues before the recommendation.",
    redLines:
      "Do not give a workaround for a legal or policy limit. Do not send client material outside the firm. Ask for approval before any external write.",
  },
};

export function defaultEthics(): EthicsProfile {
  const preset = ETHICS_PRESETS.neutral;
  return {
    preset: "neutral",
    charter: preset.charter,
    redLines: preset.redLines,
    posture: preset.posture,
    tone: preset.tone,
    length: "balanced",
    leadWithAnswer: true,
    styleRules: "Use the firm’s words. No slogans. No emoji unless the user uses them.",
    model: "hermes",
    temperature: 0.2,
    inherit: true,
  };
}

export function clampTemperature(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.2;
  return Math.min(0.9, Math.max(0, Math.round(n * 10) / 10));
}

export function normalizeEthics(raw: Partial<EthicsProfile> | null | undefined): EthicsProfile {
  const base = defaultEthics();
  const preset = raw?.preset;
  const tone = raw?.tone;
  const posture = raw?.posture;
  const length = raw?.length;
  const model = raw?.model;
  return {
    preset: preset === "executive" || preset === "compliance" || preset === "custom" || preset === "neutral" ? preset : base.preset,
    charter: typeof raw?.charter === "string" && raw.charter.trim() ? raw.charter.slice(0, 4000) : base.charter,
    redLines: typeof raw?.redLines === "string" ? raw.redLines.slice(0, 4000) : base.redLines,
    posture: posture === "strict" || posture === "balanced" || posture === "direct" ? posture : base.posture,
    tone: tone === "concise" || tone === "warm" || tone === "blunt" || tone === "formal" ? tone : base.tone,
    length: length === "short" || length === "balanced" || length === "detailed" ? length : base.length,
    leadWithAnswer: raw?.leadWithAnswer !== false,
    styleRules: typeof raw?.styleRules === "string" ? raw.styleRules.slice(0, 2000) : base.styleRules,
    model: model === "qwen" || model === "hermes" ? model : base.model,
    temperature: clampTemperature(raw?.temperature ?? base.temperature),
    inherit: raw?.inherit !== false,
  };
}

const POSTURE_LINE: Record<RefusalPosture, string> = {
  strict: "Refusal posture: Strict. Flag real legal, safety, and confidentiality risks before the answer. Do not lecture. Do not use a canned frontier-lab refusal.",
  balanced: "Refusal posture: Balanced. Be professional and direct. Name a real legal or safety risk once, then answer.",
  direct: "Refusal posture: Direct analyst. Do not lecture, scold, or use a canned frontier-lab refusal. Answer legitimate business, legal, political, and analytical questions straight. Still refuse help with crime, and still wait for approval before any external send or write.",
};

const TONE_LINE: Record<VoiceTone, string> = {
  concise: "Voice: concise executive. Short sentences. No preamble.",
  warm: "Voice: warm partner. Plain and human, still precise.",
  blunt: "Voice: blunt analyst. No softening filler.",
  formal: "Voice: formal memo. Complete sentences, no chatter.",
};

const LENGTH_LINE: Record<ReplyLength, string> = {
  short: "Length: short. A few sentences unless the user asks for more.",
  balanced: "Length: balanced. Enough to decide, not an essay.",
  detailed: "Length: detailed when the question needs it. Still structured.",
};

export function compileEthics(profile: EthicsProfile, opts?: { toolTurn?: boolean }) {
  const lines = [
    "Hatch runs open-weight models on dedicated hardware. This firm sets the principles, guardrails, and voice. No outside AI lab’s policy is in force here.",
    `Firm charter: ${profile.charter}`,
    profile.redLines.trim() ? `Firm red lines (always enforce, or stop and ask for approval): ${profile.redLines}` : "",
    POSTURE_LINE[profile.posture],
    TONE_LINE[profile.tone],
    LENGTH_LINE[profile.length],
    profile.leadWithAnswer ? "Lead with the answer, then the support." : "You may set context before the answer when it helps.",
    profile.styleRules.trim() ? `House style: ${profile.styleRules}` : "",
    profile.model === "qwen"
      ? opts?.toolTurn
        ? "Model choice is Qwen for plain drafting. This turn uses tools, so it runs on Hermes."
        : "Model choice is Qwen for this drafting turn."
      : "Model choice is Hermes.",
  ];
  return lines.filter(Boolean).join("\n");
}

