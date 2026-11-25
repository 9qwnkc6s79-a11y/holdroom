// Tokens from the Presence v4 spec. Do not drift these hex values.

export const presenceTheme = {
  mode: "dark" as const,

  colors: {
    bg: "#09090B",
    surface: "#131316",
    surfaceInput: "#141418",
    surfaceButton: "#16161B",
    surfaceRaised: "#18181D",
    avatarBg: "#1B1B22",
    denyBg: "#1C1C22",
    micBg: "#1D1D24",
    dockActiveBg: "#202026",
    bubbleUser: "#222228",
    switchOff: "#272730",

    lineSubtle: "#202026",
    lineProgress: "#222229",
    line: "#232329",
    lineSearch: "#24242C",
    lineCard: "#26262E",
    lineInput: "#282830",
    lineInputFocus: "#2A2A32",
    lineAvatar: "#2D2D36",
    lineStrong: "#2E2E36",

    fg: "#FAFAFA",
    fgSecondary: "#E4E4E7",
    fgBody: "#D4D4D8",
    muted: "#A1A1AA",
    dockInactive: "#8E8E98",
    dim: "#71717A",

    blueCore: "#BDD8FF",
    blueSky: "#84B6FF",
    blueSoft: "#9CC7FF",
    blueMid: "#5584E6",
    blueDeep: "#3559B8",
    blueEdge: "#131E42",
    blueButton: "#406AD6",
    white: "#FFFFFF",

    amber: "#F59E0B",
    amberSoft: "#FDE68A",

    progressTrack: "#0E0E12",
    assistantBubble: "#131317",
  },

  typography: {
    greeting: { fontSize: 32, lineHeight: 34.5, fontWeight: "500" as const, letterSpacing: -0.96 },
    pageTitle: { fontSize: 30, lineHeight: 33, fontWeight: "500" as const, letterSpacing: -0.9 },
    signInTitle: { fontSize: 28, lineHeight: 31, fontWeight: "500" as const, letterSpacing: -0.84 },
    transcript: { fontSize: 22, lineHeight: 31, fontWeight: "400" as const, letterSpacing: -0.44 },
    splashMark: { fontSize: 21, lineHeight: 25, fontWeight: "600" as const, letterSpacing: -0.52 },
    headerBrand: { fontSize: 16, lineHeight: 20, fontWeight: "600" as const, letterSpacing: -0.32 },
    cardHeading: { fontSize: 16, lineHeight: 21, fontWeight: "600" as const, letterSpacing: -0.32 },
    inputText: { fontSize: 15.5, lineHeight: 21, fontWeight: "400" as const, letterSpacing: -0.15 },
    ctaLabel: { fontSize: 15.5, lineHeight: 20, fontWeight: "600" as const, letterSpacing: -0.15 },
    rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, letterSpacing: -0.22 },
    body: { fontSize: 14.5, lineHeight: 21, fontWeight: "400" as const, letterSpacing: 0 },
    subcopy: { fontSize: 14, lineHeight: 19.5, fontWeight: "400" as const, letterSpacing: 0 },
    cardSubcopy: { fontSize: 13.5, lineHeight: 19, fontWeight: "400" as const, letterSpacing: 0 },
    statusLine: { fontSize: 13, lineHeight: 17, fontWeight: "400" as const, letterSpacing: 0 },
    metaLabel: { fontSize: 12.5, lineHeight: 17, fontWeight: "500" as const, letterSpacing: 0 },
    dockLabel: { fontSize: 12.5, lineHeight: 16, fontWeight: "500" as const, letterSpacing: 0 },
    timestamp: { fontSize: 12, lineHeight: 16, fontWeight: "400" as const, letterSpacing: 0 },
  },

  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    base: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 28,
  },

  radii: {
    pill: 99,
    card: 16,
    cardCompact: 14,
    squircle: 13,
    control: 12,
    inset: 10,
    diamond: 9,
    rule: 2,
  },

  touchTargetMin: 44,
} as const;

export const colors = presenceTheme.colors;
export const type = presenceTheme.typography;
export const radii = presenceTheme.radii;
