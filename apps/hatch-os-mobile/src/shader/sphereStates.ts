export const SPHERE_STATES = ["idle", "listening", "thinking", "speaking", "needsApproval"] as const;

export type SphereState = (typeof SPHERE_STATES)[number];

export interface SphereParams {
  core: [number, number, number];
  hi: [number, number, number];
  mid: [number, number, number];
  deep: [number, number, number];
  edge: [number, number, number];
  speed: number;
  swirl: number;
  bloom: number;
  breathAmp: number;
  breathFreq: number;
  ringPulse: number;
  audio: number;
  coreFocus: number;
  corePower: number;
  filamentGain: number;
  /** Rim only. The body never uses this. Needs-approval mixes a little amber in. */
  ring: [number, number, number];
}

export function hexRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function mixRgb(from: [number, number, number], to: [number, number, number], amount: number): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

/** One full rim pulse every 2.8s: sin(clock * freq) has period 2π/freq. */
const APPROVAL_PULSE = (2 * Math.PI) / 2.8;
const AMBER_RIM = 0.24;

const TABLE: Record<SphereState, SphereParams> = {
  idle: {
    core: hexRgb("#BDD8FF"),
    hi: hexRgb("#84B6FF"),
    mid: hexRgb("#5584E6"),
    deep: hexRgb("#3559B8"),
    edge: hexRgb("#131E42"),
    speed: 0.24,
    swirl: 1.05,
    bloom: 0.26,
    breathAmp: 0.015,
    breathFreq: 1.4,
    ringPulse: 0,
    audio: 0,
    coreFocus: 10.5,
    corePower: 0.44,
    filamentGain: 0.5,
    ring: hexRgb("#84B6FF"),
  },
  listening: {
    core: hexRgb("#D2E5FF"),
    hi: hexRgb("#9CC7FF"),
    mid: hexRgb("#6798F2"),
    deep: hexRgb("#3D68CC"),
    edge: hexRgb("#17254E"),
    speed: 0.58,
    swirl: 1.35,
    bloom: 0.44,
    breathAmp: 0.042,
    breathFreq: 3.8,
    ringPulse: 0.32,
    audio: 0.52,
    coreFocus: 8.5,
    corePower: 0.56,
    filamentGain: 0.62,
    ring: hexRgb("#9CC7FF"),
  },
  thinking: {
    core: hexRgb("#C7DEFF"),
    hi: hexRgb("#8EC0FF"),
    mid: hexRgb("#5B8BEB"),
    deep: hexRgb("#385EC2"),
    edge: hexRgb("#142046"),
    speed: 1.05,
    swirl: 1.65,
    bloom: 0.34,
    breathAmp: 0.012,
    breathFreq: 2.6,
    ringPulse: 0,
    audio: 0.08,
    coreFocus: 9.5,
    corePower: 0.48,
    filamentGain: 0.6,
    ring: hexRgb("#8EC0FF"),
  },
  speaking: {
    core: hexRgb("#D2E5FF"),
    hi: hexRgb("#9CC7FF"),
    mid: hexRgb("#5E90EE"),
    deep: hexRgb("#3A63C6"),
    edge: hexRgb("#15224A"),
    speed: 0.68,
    swirl: 1.28,
    bloom: 0.38,
    breathAmp: 0.028,
    breathFreq: 3.1,
    ringPulse: 0.18,
    audio: 0.36,
    coreFocus: 9,
    corePower: 0.52,
    filamentGain: 0.58,
    ring: hexRgb("#9CC7FF"),
  },
  // The body stays the idle periwinkle. Only the rim picks up a little amber.
  needsApproval: {
    core: hexRgb("#BDD8FF"),
    hi: hexRgb("#84B6FF"),
    mid: hexRgb("#5584E6"),
    deep: hexRgb("#3559B8"),
    edge: hexRgb("#131E42"),
    speed: 0.22,
    swirl: 1.05,
    bloom: 0.26,
    breathAmp: 0.012,
    breathFreq: APPROVAL_PULSE,
    ringPulse: 0.85,
    audio: 0,
    coreFocus: 10.5,
    corePower: 0.44,
    filamentGain: 0.5,
    ring: mixRgb(hexRgb("#84B6FF"), hexRgb("#F59E0B"), AMBER_RIM),
  },
};

export function sphereParams(state: SphereState): SphereParams {
  return TABLE[state];
}

/** Flat uniform vector. Index 15 is speed, 21 is the base audio level. */
export function flattenSphere(params: SphereParams): number[] {
  return [
    ...params.core,
    ...params.hi,
    ...params.mid,
    ...params.deep,
    ...params.edge,
    params.speed,
    params.swirl,
    params.bloom,
    params.breathAmp,
    params.breathFreq,
    params.ringPulse,
    params.audio,
    params.coreFocus,
    params.corePower,
    params.filamentGain,
    ...params.ring,
  ];
}

export function lerpSphere(from: number[], to: number[], t: number): number[] {
  const mix = t < 0 ? 0 : t > 1 ? 1 : t;
  const out = new Array<number>(from.length);
  for (let index = 0; index < from.length; index += 1) {
    const a = from[index] ?? 0;
    const b = to[index] ?? a;
    out[index] = a + (b - a) * mix;
  }
  return out;
}

export const SPHERE_PRESETS = {
  home: { slot: 104, canvas: 164, radius: 0.315 },
  voice: { slot: 148, canvas: 230, radius: 0.315 },
  splash: { slot: 112, canvas: 176, radius: 0.315 },
  signIn: { slot: 80, canvas: 132, radius: 0.315 },
  dock: { slot: 42, canvas: 58, radius: 0.28 },
  chat: { slot: 34, canvas: 54, radius: 0.29 },
  threads: { slot: 34, canvas: 50, radius: 0.28 },
} as const;

export type SpherePreset = keyof typeof SPHERE_PRESETS;
