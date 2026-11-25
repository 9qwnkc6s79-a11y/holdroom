# Hatch OS Mobile — Presence v4 Implementation Spec

**Target:** Expo / React Native iOS app (EAS TestFlight build)  
**Design System:** Concept C v4 ("Presence" — Periwinkle Sky on Obsidian, Quiet Chrome)  
**Visual Mode (v1):** **Dark-only (`#09090B`)**  
**Repo Placement:** Commit this document and the accompanying `assets/` directory to `apps/hatch-os-mobile/design/` (or alongside the Expo app root as `design/HATCH_OS_PRESENCE_SPEC.md` and `design/assets/`).

---

## 1. Core Thesis & Brand Rules

Hatch OS is a private AI workspace for 50–250 person professional firms, used primarily on iPhone. The visual system pairs **2-second partner simplicity** (one primary prompt/action per screen, plain copy, zero settings clutter) with **palpable intelligence** carried by one living Periwinkle Sky sphere.

1. **The sphere is the only luminous element on screen.** Cards, inputs, badges, dock tabs, and avatars are matte dark surfaces with crisp `1px` hairline borders and zero glow or gradient strokes.
2. **Zero AI-ish pills.** Status lines under the sphere, privacy indicators in the header, and agent statuses on the roster are plain typography paired with at most a `6px` circular dot or a `12px` lock glyph—never outlined, tinted, or glowing capsule tags.
3. **Warm amber for approvals only.** `Needs your approval` cards and rows use a flat card surface with a thin `2.5px` amber (`#F59E0B`) left rule and `6px` amber dot, while the primary `Approve` CTA uses solid Periwinkle CTA Blue (`#406AD6`) with `#FFFFFF` text (`4.94:1` contrast).
4. **Hatch copy & honesty rules:**
   - Product name is **Hatch** or **Hatch OS** only. Never write `Holdroom`, `Stillroom`, `Airlock`, or the retired public host.
   - Always use **second-person copy** ("Ask anything", "From your firm’s work", "Needs your approval", "Your firm’s host").
   - **Never invent** customer names, firm names, usage metrics, or compliance certifications (no SOC 2, HIPAA, or ISO 27001 claims), and never name an external technical partner.
   - All agent names, file counts, and thread titles in the mockups below (`Associates`, `Counsel`, `Records`, `Briefing`, `Intake`, `Q4 audit committee memo`, `Mercer NDA redlines`) are **example data** for UI demonstration—replace with live firm-host data at runtime.

---

## 2. Appearance, Light-Mode Rule & Typography Choice

### 2.1 Light-Mode Rule (v1)
**v1 is strictly dark-only (`#09090B` canvas).** Do not enable iOS Automatic Light Appearance (`userInterfaceStyle: "dark"` in `app.json`) and do not render unstyled white cards on sign-in or sheets. Keeping v1 obsidian preserves the single luminous Periwinkle Sky sphere and aligns the mobile app with the `hatchsystems.ai` dark field.

### 2.2 Font Choice: SF Pro (iOS System) + JetBrains Mono
While the static HTML/WebGL mockups use `Inter-Variable.ttf`, the native Expo iOS build **should use the iOS system font (SF Pro)** for all UI and display copy and bundle **JetBrains Mono** strictly for invite codes, monotonic counters, and technical meta labels:

| Role | Font Family | Rationale |
| --- | --- | --- |
| **Display & UI** | `System` (SF Pro Display ≥ 20pt; SF Pro Text < 20pt) | Matches the Inter geometric proportions of the v4 mockups while giving native iOS Dynamic Type scaling, optical sizing, zero font-load flicker, and true native polish. |
| **Technical Meta & Codes** | `JetBrainsMono-Medium` / `JetBrainsMono-Regular` (bundled via `expo-font`) | Used sparingly for invite code inputs (`XXXX-XXXX`), build stamps (`Hatch OS · Presence v4`), and numeric counters; never used for routine body labels. |
| **Tabular Figures** | `fontVariant: ['tabular-nums']` | Mandatory on every clock (`9:41`), timestamp (`9:38`), file counter (`2 of 2 files`), and progress readout. |

---

## 3. Design Tokens (TypeScript Theme Object)

All hex values below come directly from `shared-c-v4.css`, `orb-shader-v4.js`, and the v4 screen sources.

```ts
// apps/hatch-os-mobile/src/theme/presenceTokens.ts

export const presenceTheme = {
  mode: 'dark' as const,

  colors: {
    // Surfaces & Borders (Matte Obsidian)
    bg: '#09090B',          // Root screen canvas
    surface: '#131316',     // Primary card, task row, grouped settings card, assistant bubble (#131317)
    surfaceInput: '#141418',// Ask box, composer, approval card, dock pill, search bar, sign-in field
    surfaceButton: '#16161B',// Quiet modal buttons (Close, Mute)
    surfaceRaised: '#18181D',// Elevated secondary surface
    avatarBg: '#1B1B22',    // Matte geometric shape avatar fill
    denyBg: '#1C1C22',      // Deny button fill
    micBg: '#1D1D24',       // Home Ask-box mic square fill
    dockActiveBg: '#202026',// Subtle active dock tab fill (zero glow)
    bubbleUser: '#222228',  // Sent user chat bubble (matte graphite — NEVER navy)
    switchOff: '#272730',   // Off toggle track

    // Hairline Borders (1px solid, zero glow)
    lineSubtle: '#202026',  // Inner row divider inside grouped Settings cards
    lineProgress: '#222229',// File progress inner box border
    line: '#232329',        // Standard card / dock / task row border
    lineSearch: '#24242C',  // Search bar border
    lineCard: '#26262E',    // Approval card / composer / Close button border
    lineInput: '#282830',   // Home Ask box border
    lineInputFocus: '#2A2A32',// Sign-in invite input border
    lineAvatar: '#2D2D36',  // Matte shape avatar border
    lineStrong: '#2E2E36',  // User bubble & Deny button border

    // Text
    fg: '#FAFAFA',          // Primary headings, titles, active dock label
    fgSecondary: '#E4E4E7', // Ask placeholder, avatar glyph, file count value
    fgBody: '#D4D4D8',      // Roster secondary line, cycle status line
    muted: '#A1A1AA',       // Subcopy, status lines, timestamps, section headers (7.8:1 on #09090B)
    dockInactive: '#8E8E98',// Inactive dock tab icon & label
    dim: '#71717A',         // Placeholders, disclosure chevrons, subtle footer caption

    // Periwinkle Sky (Blue Accents — NEVER #007AFF link blue or cold cyan)
    blueCore: '#BDD8FF',    // Sphere inner core highlight (Idle)
    blueSky: '#84B6FF',     // 6px status dots, progress fill, Hatch logo lid light, cursor bar
    blueSoft: '#9CC7FF',    // Mic icon tint, + compose icon tint
    blueMid: '#5584E6',     // Sphere mid-body caustic filament
    blueDeep: '#3559B8',    // Sphere outer cobalt-indigo body
    blueEdge: '#131E42',    // Sphere deep edge shadow
    blueButton: '#406AD6',  // Solid Approve & Continue CTA, active toggle track (4.94:1 with #FFFFFF)
    white: '#FFFFFF',       // Button label on #406AD6 & End voice label base

    // Calm Amber (Needs-approval ONLY)
    amber: '#F59E0B',       // 2.5px left rule, 6px urgent status dot
    amberSoft: '#FDE68A',   // "Needs approval" / "Needs your approval" text, sphere amber core
  },

  typography: {
    greeting:       { fontSize: 32,   lineHeight: 34.5, fontWeight: '500' as const, letterSpacing: -0.96 },
    pageTitle:      { fontSize: 30,   lineHeight: 33,   fontWeight: '500' as const, letterSpacing: -0.90 },
    signInTitle:    { fontSize: 28,   lineHeight: 31,   fontWeight: '500' as const, letterSpacing: -0.84 },
    transcript:     { fontSize: 22,   lineHeight: 31,   fontWeight: '400' as const, letterSpacing: -0.44 },
    splashMark:     { fontSize: 21,   lineHeight: 25,   fontWeight: '600' as const, letterSpacing: -0.52 },
    headerBrand:    { fontSize: 16,   lineHeight: 20,   fontWeight: '600' as const, letterSpacing: -0.32 },
    cardHeading:    { fontSize: 16,   lineHeight: 21,   fontWeight: '600' as const, letterSpacing: -0.32 },
    inputText:      { fontSize: 15.5, lineHeight: 21,   fontWeight: '400' as const, letterSpacing: -0.15 },
    ctaLabel:       { fontSize: 15.5, lineHeight: 20,   fontWeight: '600' as const, letterSpacing: -0.15 },
    rowTitle:       { fontSize: 15,   lineHeight: 20,   fontWeight: '600' as const, letterSpacing: -0.22 },
    body:           { fontSize: 14.5, lineHeight: 21,   fontWeight: '400' as const, letterSpacing: 0 },
    subcopy:        { fontSize: 14,   lineHeight: 19.5, fontWeight: '400' as const, letterSpacing: 0 },
    cardSubcopy:    { fontSize: 13.5, lineHeight: 19,   fontWeight: '400' as const, letterSpacing: 0 },
    statusLine:     { fontSize: 13,   lineHeight: 17,   fontWeight: '400' as const, letterSpacing: 0 },
    metaLabel:      { fontSize: 12.5, lineHeight: 17,   fontWeight: '500' as const, letterSpacing: 0 },
    dockLabel:      { fontSize: 12.5, lineHeight: 16,   fontWeight: '500' as const, letterSpacing: 0 },
    timestamp:      { fontSize: 12,   lineHeight: 16,   fontWeight: '400' as const, letterSpacing: 0 },
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
    pill: 99,       // Dock outer shell, active dock tab, Close/End voice/Mute, toggle switch
    card: 16,       // Home Ask box, chat bubbles, approval card, roster row, thread row, settings group
    cardCompact: 14,// Home task card, chat composer, sign-in invite input & Continue CTA, notice card
    squircle: 13,   // Associates squircle avatar
    control: 12,    // Ask mic square, search bar, Deny/Approve buttons, top-nav icon button
    inset: 10,      // File-progress inset card, Send button, Briefing rect avatar
    diamond: 9,     // Intake rotated diamond avatar
    rule: 2,        // Right corners on 2.5px amber left bar
  },

  touchTargetMin: 44,
} as const;
```

---

## 4. The Living Periwinkle Sky Sphere

### 4.1 Technology Stack & Fallback
- **Primary Renderer:** `@shopify/react-native-skia` (`Canvas` + `Fill` + `Shader` compiled once with `Skia.RuntimeEffect.Make(ORB_SKSL)`).
- **Animation Driver:** `react-native-reanimated` (`useSharedValue`, `useFrameCallback`, `useDerivedValue` passing uniforms cleanly on the UI thread at 60/120fps without JS bridge churn).
- **Audio Reactivity (Listening & Speaking):** Feed smoothed normalized microphone / TTS RMS amplitude (`0.0` to `1.0`, EMA-smoothed with 60–90ms attack/release) into `uAudio`.
- **Reduce Motion & Fallback:** Check `AccessibilityInfo.isReduceMotionEnabled()` on mount and subscribe to `reduceMotionChanged`. When Reduce Motion is `true`—or if `Skia.RuntimeEffect.Make` returns `null`—set `uReduced = 1.0` (freezes shader at `t = 2.4`, zero breath oscillation) OR render a pre-baked static `@3x` PNG of the Periwinkle Sky idle sphere (plus a fixed `2px` `#F59E0B` outer ring at `0.42` opacity when `state === 'approval'`).
- **Canvas Sizing Rule:** Always size the Skia canvas **~1.57× larger** than the layout slot (`overflow: 'visible'`) so the tight `exp(-distOut * 10.5)` halo never clips at square bounds:
  - Home (`104pt` slot) → `164pt × 164pt` canvas (`uRadius = 0.315`)
  - Voice (`148pt` slot) → `230pt × 230pt` canvas (`uRadius = 0.315`)
  - Splash (`112pt` slot) → `176pt × 176pt` canvas (`uRadius = 0.315`)
  - Sign-in (`80pt` slot) → `132pt × 132pt` canvas (`uRadius = 0.315`)
  - Dock (`42pt` slot) → `58pt × 58pt` canvas (`uRadius = 0.280`)
  - Chat Header & Threads Composer (`34pt` slot) → `54pt × 54pt` / `50pt × 50pt` canvas (`uRadius = 0.290` / `0.280`)

### 4.2 Five Sphere States & Parameters

| State | Visual Behavior | `cCore` → `cHi` → `cMid` → `cDeep` → `cEdge` | `speed` | `swirl` | `bloom` | `breathAmp` / `Freq` | `ringPulse` | `audioLevel` | `coreFocus` / `Power` / `filamentGain` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`idle`** | Gentle living internal drift; calm rest | `#BDD8FF` → `#84B6FF` → `#5584E6` → `#3559B8` → `#131E42` | `0.24` | `1.05` | `0.26` | `0.015` / `1.40` | `0.00` | `0.00` | `10.5` / `0.44` / `0.50` |
| **`listening`** | Soft sky lift, subtle outer ring, reactive to mic RMS | `#D2E5FF` → `#9CC7FF` → `#6798F2` → `#3D68CC` → `#17254E` | `0.58` | `1.35` | `0.44` | `0.042` / `3.80` | `0.32` | Live RMS (`0.15..0.75`, demo `0.52`) | `8.5` / `0.56` / `0.62` |
| **`thinking`** | Tighter orbital swirl while reading files/tools | `#C7DEFF` → `#8EC0FF` → `#5B8BEB` → `#385EC2` → `#142046` | `1.05` | `1.65` | `0.34` | `0.012` / `2.60` | `0.00` | `0.08` | `9.5` / `0.48` / `0.60` |
| **`speaking`** | Luminous sky cadence tracking TTS output amplitude | `#D2E5FF` → `#9CC7FF` → `#5E90EE` → `#3A63C6` → `#15224A` | `0.68` | `1.28` | `0.38` | `0.028` / `3.10` | `0.18` | Live TTS RMS (`0.12..0.60`) | `9.0` / `0.52` / `0.58` |
| **`needsApproval`** | Calm warm amber shift + deliberate halo ring pulse | `#FDE68A` → `#EB9E1F` → `#B8610B` → `#6B3006` → `#250F03` | `0.22` | `1.10` | `0.30` | `0.015` / `1.80` | `0.30` | `0.00` | `10.0` / `0.44` / `0.50` |

### 4.3 State Transitions & Motion Timing
- **Transition curve:** `Easing.out(Easing.cubic)` (`cubic-bezier(0.23, 1, 0.32, 1)`), **never** `ease-in` or default `ease-in-out`.
- **State cross-lerp duration:** `250ms` (`idle` ↔ `listening` / `thinking` / `speaking`), `280ms` (into `needsApproval`). Accumulate time phase continuously (`phase += dt * lerpedSpeed`) rather than multiplying `uTime * speed` so transitions never snap backwards.
- **UI chrome motion:** Status label crossfade `180ms` ease-out; button press `scale: 0.97` over `110ms` ease-out; sheets/voice modal presentation `320ms` ease-out.
- **Background lifecycle:** Pause `useFrameCallback` when `AppState.currentState !== 'active'` so GPU stays idle in background.

---

## 5. Component Specifications

### 5.1 Matte Bottom Pill Dock (`PresenceDock`)
- **Outer container:** `marginHorizontal: 14`, `marginBottom: 4` (above iOS home indicator / safe area), `paddingVertical: 6`, `paddingHorizontal: 8`, `borderRadius: 99`, `backgroundColor: '#141418'`, `borderWidth: 1`, `borderColor: '#232329'`.
- **Left orb anchor:** `42pt × 42pt` slot (`58pt` Skia canvas inside, `uRadius = 0.28`), `44pt+` tap target that launches **Voice Mode** (`Haptics.impactAsync(Light)`).
- **Tab grid:** `flex: 1`, `marginLeft: 8`, 3 equal columns (`Home`, `Agents`, `Files`), `gap: 2`.
- **Tab item:** `height: 42` (`minWidth: 44` hitSlop), `borderRadius: 99`, `flexDirection: 'row'`, `gap: 6`, `16pt` `1.75px`-stroke icon + `12.5pt` `500`-weight label.
  - **Active:** `backgroundColor: '#202026'`, color `#FAFAFA` (**zero border glow, zero shadow**).
  - **Inactive:** transparent background, color `#8E8E98`.

### 5.2 Task Row (`TaskCard`)
- **Container:** `backgroundColor: '#131316'`, `borderWidth: 1`, `borderColor: '#232329'`, `borderRadius: 14`, `paddingVertical: 14`, `paddingHorizontal: 15`, `minHeight: 68`.
- **Urgent / Needs-approval variant:** `paddingLeft: 17`, absolute left accent bar (`left: 0, top: 10, bottom: 10, width: 2.5, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: '#F59E0B'`). **No gradient fill or amber border.**
- **Content:** Title `15pt` weight `600` (`#FAFAFA`), `3pt` gap below to metadata row (`6px` dot `#F59E0B` or `#84B6FF` + `12.5pt` `#A1A1AA` plain text). Right `16pt` chevron (`#A1A1AA`).

### 5.3 Inline Approval Card (`ApprovalCard`)
- **Container:** `backgroundColor: '#141418'`, `borderWidth: 1`, `borderColor: '#26262E'`, `borderRadius: 16`, `paddingTop: 15`, `paddingRight: 16`, `paddingBottom: 15`, `paddingLeft: 18`.
- **Left rule:** `left: 0, top: 14, bottom: 14, width: 2.5, backgroundColor: '#F59E0B'`.
- **Header eyebrow:** `6px` `#F59E0B` dot + `12.5pt` weight `600` `#FDE68A` (`Needs your approval`). Plain text—no chip background.
- **Title & subtitle:** `16pt` weight `600` `#FAFAFA` (`Send email via Gmail`), `4pt` gap to `13.5pt` `#A1A1AA`.
- **File progress inset:** `backgroundColor: '#0E0E12'`, `borderWidth: 1`, `borderColor: '#222229'`, `borderRadius: 10`, `paddingVertical: 9`, `paddingHorizontal: 11`, `marginBottom: 13`. Top row `12pt` (`#A1A1AA` label + `#E4E4E7` `tabular-nums` count); track `height: 3.5`, `borderRadius: 99`, `#232329`; fill `#84B6FF`.
- **Action pair:** `flexDirection: 'row'`, `gap: 10`:
  - `Deny`: `flex: 1`, `height: 46`, `borderRadius: 12`, `backgroundColor: '#1C1C22'`, `borderWidth: 1`, `borderColor: '#2E2E36'`, text `#FAFAFA` `14.5pt` `600`.
  - `Approve`: `flex: 1.25`, `height: 46`, `borderRadius: 12`, `backgroundColor: '#406AD6'`, text `#FFFFFF` `14.5pt` `600` (`4.94:1` contrast).

### 5.4 Chat Composer (`ChatComposer`, Attach + Voice/Send)
- **Outer bar:** `paddingTop: 8`, `paddingHorizontal: 16`, `paddingBottom: 10`, `borderTopWidth: 1`, `borderTopColor: '#232329'`, `backgroundColor: '#09090B'`.
- **Input container:** `minHeight: 48`, `maxHeight: 132`, `borderRadius: 14`, `backgroundColor: '#141418'`, `borderWidth: 1`, `borderColor: '#26262E'`, `paddingHorizontal: 7`, `flexDirection: 'row'`, `alignItems: 'flex-end'`, `gap: 6`.
- **Left Attach button (`+`):** `34pt × 34pt` visual (`44pt` hitSlop), `borderRadius: 10`, `#1D1D24` fill when pressed, `#A1A1AA` `+` icon (`18pt`). Opens native swipe-down attach sheet (Files, Photo Library, Camera).
- **TextInput:** `flex: 1`, `fontSize: 15.5`, `color: '#FAFAFA'`, `placeholderTextColor: '#A1A1AA'`, `paddingVertical: 12`.
- **Right Voice / Send button:** `34pt × 34pt` visual (`44pt` hitSlop), `borderRadius: 10`.
  - **When input is empty & no attachment:** `#1D1D24` square with `#9CC7FF` mic icon (`18pt`) → enters Voice Mode.
  - **When text or attachment is present:** `#FAFAFA` square with `#09090B` `↑` arrow (`16pt`) → sends message optimistically.

### 5.5 Status Line & Lock Label (Plain Typography)
- **Orb status line:** `flexDirection: 'row'`, `alignItems: 'center'`, `gap: 7`. `6px` circular dot (`#84B6FF` or `#F59E0B`) + `13pt` `#A1A1AA` plain text. Crossfades in `180ms` when steps update. **Zero border, zero background fill.**
- **Privacy label:** `12pt` lock SVG (`#A1A1AA`) + `5pt` gap + `12pt` `#A1A1AA` text (`Firm vault · Private`).

### 5.6 Shape Avatars (`ShapeAvatar`)
Used on the Agents roster so the sphere remains singular:
- Outer box `44pt × 44pt`, matte fill `#1B1B22`, `borderWidth: 1`, `borderColor: '#2D2D36'`, centered `16pt` `600`-weight `#E4E4E7` initial.
- Variants: `squircle` (`borderRadius: 13`), `circle` (`borderRadius: 22`), `hexagon` (SVG polygon `22,2 40,12 40,32 22,42 4,32 4,12`), `rect` (`borderRadius: 10`), `diamond` (`35pt × 35pt`, `borderRadius: 9`, rotated `45deg`, inner text `-45deg`).
- **Role icon placement:** `14pt` monochrome `#A1A1AA` role glyph sits `7pt` to the right of the agent’s name—never inside or overlapping the avatar.

### 5.7 Message Bubbles (`MessageBubble`)
- **User (sent):** `alignSelf: 'flex-end'`, `maxWidth: '85%'`, `backgroundColor: '#222228'`, `borderWidth: 1`, `borderColor: '#2E2E36'`, `borderRadius: 16`, `borderBottomRightRadius: 5`, `paddingVertical: 11`, `paddingHorizontal: 14`, text `14.5pt` `#FAFAFA`.
- **Assistant (received):** `alignSelf: 'flex-start'`, `maxWidth: '85%'`, `backgroundColor: '#131317'`, `borderWidth: 1`, `borderColor: '#232329'`, `borderRadius: 16`, `borderBottomLeftRadius: 5`.
- **Tool trace row:** `flexDirection: 'row'`, `alignItems: 'center'`, `gap: 8`, `paddingHorizontal: 4`, `6px` `#84B6FF` dot + `12.5pt` `#A1A1AA`.

---

## 6. Screen Layouts & Asset Map

All reference mockups (`390×844 @3x`) live in `./assets/`.

| Screen | Asset File | Layout & Exact Measurements |
| --- | --- | --- |
| **First-Run Splash** | `assets/presence-splash-v4.png` | Centered `112pt` orb (`176pt` canvas) above `22pt` Open Hatch mark + `Hatch` (`21pt` `600`, `9pt` gap) + `13.5pt` `#A1A1AA` tagline. **Animation (<1.5s total):** `0ms` Open Hatch mark centered → `450ms` lid light expands (`cubic-bezier(0.23,1,0.32,1)`) → `950ms` resolves into `112pt` Periwinkle Sky sphere + wordmark → `1350ms` transitions to Sign-in or Home. Reduce Motion: skips morph, shows static splash for `400ms`, crossfades. |
| **Sign-in** | `assets/presence-signin-v4.png` | Top bar `paddingTop: 18, paddingHorizontal: 24` with Open Hatch mark + `Hatch`. Body (`paddingTop: 28, paddingHorizontal: 24`): `80pt` idle sphere (`132pt` canvas), `28pt` `Sign in to your firm`, `14.5pt` `#A1A1AA` subcopy, `13pt` `Invite code` label, `52pt`-tall `14pt`-radius input (`#141418`, `1px #2A2A32`, `JetBrains Mono` `XXXX-XXXX`), `50pt`-tall `14pt`-radius `#406AD6` `Continue` button (`#FFFFFF`). Bottom `TestFlight preview` notice card (`14pt` radius, `2.5px` `#F59E0B` left rule). |
| **Home** | `assets/presence-home-v4.png` | Header (`padding: 8/20/0`): Open Hatch mark + `Hatch` left; lock glyph + `Firm vault · Private` right. Orb stage (`padding: 18/20/10`): `104pt` sphere (`164pt` canvas), `14pt` gap, plain `6px` dot + status line. Greeting (`32pt` `Good morning`), `56pt`-tall `16pt`-radius `Ask Hatch…` box with `40pt × 40pt` `#1D1D24` mic square (`12pt` radius), `From your firm’s work` (`12.5pt` `#A1A1AA`), 3 task rows (`10pt` gap), matte pill dock. |
| **Voice Mode** | `assets/presence-voice-v4.png` | Top bar: `6px` `#84B6FF` dot + `Listening` left; `36pt`-tall `#16161B` `Close` pill right (`44pt` hitSlop); lock + `Private · Never sent to OpenAI or Anthropic` below. Centered `148pt` `listening` sphere (`230pt` canvas), plain `6px` dot search step, `22pt` balanced transcript (`maxWidth: 324`) with `2px × 20pt` `#84B6FF` cursor bar. Bottom controls: `56pt` `#16161B` mute circle + `56pt` `#FAFAFA` `End voice` capsule (`#09090B` text). |
| **Chat & Approval** | `assets/presence-chat-v4.png` | Header (`padding: 8/16/12`, `1px` bottom `#232329`): `<` back (`44pt` hitSlop), `34pt` `thinking` orb (`54pt` canvas), agent name (`16pt` `600`) + `6px` dot status line. Thread (`padding: 16`, `12pt` gap) with graphite user bubble, trace row, assistant bubble, and inline `ApprovalCard`. Bottom `ChatComposer` with `+` attach and mic/send. |
| **Agent Roster** | `assets/presence-roster-v4.png` | `Agents` (`30pt` `500`), subcopy (`14pt`), `44pt`-tall `12pt`-radius search bar (`#141418`), `8pt`-gapped agent rows (`16pt` radius, `ShapeAvatar` + role icon beside name + plain `6px` dot `Needs approval` / `Working` text), matte pill dock with `Agents` active. |
| **Threads List** | `assets/presence-threads-v4.png` | Top nav: `<` back + `44pt` `+` new-thread square (`#141418`, `#26262E`, `#9CC7FF` icon). `Threads` (`30pt` `500`), `44pt` search bar, `8pt`-gapped thread rows (`16pt` radius, `tnum` timestamp, 1-line snippet, plain `6px` dot meta). Bottom quick-ask bar with `34pt` sphere + `Start a new thread…` input + mic. |
| **Settings** | `assets/presence-settings-v4.png` | `<` back, `Settings` (`30pt` `500`), `18pt` gap between 3 grouped `#131316` `16pt`-radius cards (`Your firm’s host`, `Voice & motion`, `Account`) with `50pt` min row height and `1px #202026` inner dividers. Switches use `#406AD6` active track (`46pt × 28pt`, `22pt` `#FFFFFF` knob). Footer: `Hatch OS · Presence v4` (`12pt` JetBrains Mono `#71717A`). |

*(4-screen overview: `assets/presence-screens-board-v4.png`; animated cycle: `assets/orb-cycle-v4.mp4`; Periwinkle Sky swatch comparison: `assets/blue-swatches-v3.png`.)*

---

## 7. Haptics & Accessibility

### 7.1 Haptics (`expo-haptics`)
Respect user toggle in Settings (`Voice & motion → Haptics`):
- **Dock tab switch / row press:** `Haptics.selectionAsync()`
- **Enter Voice Mode / tap Attach `+`:** `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
- **Send message:** `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)`
- **Tap `Approve` (optimistic confirmation):** `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`
- **Tap `Deny`:** `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)`
- **New `Needs approval` card surfaces:** `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)`

### 7.2 Contrast & Screen Reader Rules
- **Verified contrast pairs:** `#FAFAFA` on `#09090B` (`19.3:1`), `#A1A1AA` on `#09090B` (`7.8:1`), `#FFFFFF` on `#406AD6` (`4.94:1`), `#FDE68A` on `#131316` (`14.8:1`). Keep `#71717A` strictly for placeholders and decorative/footer stamps—never use `#71717A` for actionable labels.
- **VoiceOver:** Every icon-only control (`<` back, `+` attach, mic, mute, `+` new thread) requires an explicit `accessibilityLabel` and `accessibilityRole="button"`. The sphere button on Home/Dock uses `accessibilityLabel="Talk to Hatch"` and `accessibilityHint="Opens voice mode"`.
- **Dynamic Type:** Support system font scaling across all screens; cap `maxFontSizeMultiplier={1.25}` only on the 3 dock tab labels and top status/nav items so chrome never truncates, while leaving message bubbles, tasks, and approval cards uncapped (`ScrollView`-safe).
- **Touch targets:** Minimum `44pt × 44pt` via `hitSlop` on `34pt`/`36pt`/`40pt` buttons (`Close`, `+` attach, `Send`, `Ask` mic).

---

## 8. Explicit "Do Not" List

- **DO NOT** render glowing, outlined, or tinted status pills/chips anywhere (no border/fill capsules around `Reading 3 engagement letters`, `Firm vault · Private`, `Needs approval`, or `Working`).
- **DO NOT** add gradient borders, shadow blooms, or amber washes to cards, inputs, or avatars—only the sphere emits soft light.
- **DO NOT** use `#007AFF` browser-link blue controls, cold neon cyan, navy chat bubbles, beige/cream backgrounds, swamp green, or `Fraunces`.
- **DO NOT** stamp repeating mini-spheres on the Agents or Threads list rows; keep one focal sphere + the dock anchor.
- **DO NOT** ship a light mode in v1 or an unstyled white sign-in screen.
- **DO NOT** invent firm names, customer quotes, user counts, compliance badges, or name an external technical partner.

---

## Appendix A: Skia SkSL Shader (`orbShader.sksl`)

Drop this directly into `Skia.RuntimeEffect.Make(ORB_SKSL)` in `@shopify/react-native-skia`. It is a faithful 1:1 port of `orb-shader-v4.js` using SkSL types (`float2`, `float3`, `half4`, `float2x2`, `iResolution`, and `fragCoord`).

```glsl
uniform float2 uRes;
uniform float  uTime;
uniform float  uRadius;
uniform float3 uCore;
uniform float3 uHi;
uniform float3 uMid;
uniform float3 uDeep;
uniform float3 uEdge;
uniform float  uSpeed;
uniform float  uSwirl;
uniform float  uBloom;
uniform float  uBreathAmp;
uniform float  uBreathFreq;
uniform float  uRingPulse;
uniform float  uAudio;
uniform float  uCoreFocus;
uniform float  uCorePower;
uniform float  uFilamentGain;
uniform float  uReduced;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  float2x2 rot = float2x2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.05 + float2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

float dither(float2 coord) {
  float n1 = hash(coord);
  float n2 = hash(coord + 17.3);
  return (n1 + n2 - 1.0) / 255.0;
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / uRes;
  float2 p = float2(uv.x - 0.5, 0.5 - uv.y); // upright orientation matching WebGL vUv
  float d = length(p);

  float t = uReduced > 0.5 ? 2.4 : uTime;
  float breath = uReduced > 0.5 ? 0.0 : sin(t * uBreathFreq) * uBreathAmp;
  float r = uRadius * (1.0 + breath + uAudio * 0.032);

  float distOut = max(d - r, 0.0) / max(0.5 - r, 0.001);
  float bloom1 = exp(-distOut * 10.5) * 0.34 * uBloom;
  float bloom2 = exp(-distOut * 4.8) * 0.11 * uBloom;
  float outerFade = smoothstep(0.49, r * 0.90, d);

  float ringRadius = r * (1.13 + 0.025 * sin(t * uBreathFreq));
  float ringD = abs(d - ringRadius);
  float ringAlpha = exp(-ringD * 260.0) * uRingPulse * (0.42 + 0.28 * sin(t * uBreathFreq));
  if (uReduced > 0.5 && uRingPulse > 0.25) {
    ringAlpha = smoothstep(0.008, 0.0, abs(d - r * 1.14)) * 0.42;
  } else if (uReduced > 0.5) {
    ringAlpha = 0.0;
  }

  float3 bloomCol = mix(uDeep, uMid, 0.55) * bloom2 + mix(uMid, uHi, 0.25) * bloom1;
  bloomCol += uHi * ringAlpha;
  float outAlpha = clamp((bloom1 + bloom2) * outerFade + ringAlpha, 0.0, 1.0);

  float sphereMask = 1.0 - smoothstep(r - 0.004, r + 0.004, d);
  if (sphereMask > 0.001) {
    float2 np = p / r;
    float nd = length(np);
    float z = sqrt(max(1.0 - nd * nd, 0.0));
    float3 normal = normalize(float3(np, z));

    float2 sp = np * (1.30 - 0.38 * z);
    float ang = atan(sp.y, sp.x) + (1.0 - nd) * 1.0 + t * 0.38 * uSpeed;
    float rad = length(sp);
    float2 q = float2(cos(ang), sin(ang)) * rad * uSwirl;

    float f1 = fbm(q * 2.3 + float2(t * 0.26 * uSpeed, -t * 0.20 * uSpeed));
    float f2 = fbm(q * 3.4 + float2(f1 * 2.2 - t * 0.34 * uSpeed, f1 * 1.7));
    float f3 = fbm(q * 4.8 - float2(f2 * 1.9, t * 0.46 * uSpeed));

    float ridge1 = pow(clamp(1.0 - abs(f2 * 2.0 - 1.0), 0.0, 1.0), 4.8);
    float ridge2 = pow(clamp(1.0 - abs(f3 * 2.0 - 1.0), 0.0, 1.0), 6.0);

    float coreTight = exp(-nd * nd * uCoreFocus);
    float midBody = exp(-nd * nd * 2.6);

    float3 col = mix(uEdge, uDeep, smoothstep(0.95, 0.30, nd) * (0.35 + 0.65 * f1));
    col = mix(col, uMid, clamp(midBody * 0.28 + f1 * 0.24 * midBody, 0.0, 0.68));
    col += uMid * ridge1 * 0.58 * uFilamentGain;
    col += uHi * (ridge1 * 0.40 + ridge2 * 0.68) * (0.35 + 0.50 * midBody) * uFilamentGain;
    col += uCore * (coreTight * uCorePower + ridge1 * ridge2 * 0.45 * uFilamentGain);

    float fresnel = pow(1.0 - z, 3.6);
    col += mix(uMid, uHi, 0.5) * fresnel * 0.48;

    float2 lightDir = normalize(float2(-0.56, 0.64));
    float specDot = max(dot(normalize(normal.xy), lightDir), 0.0);
    float specArc = smoothstep(0.60, 0.94, nd) * smoothstep(1.0, 0.88, nd) * pow(specDot, 5.5);
    col += float3(0.95, 0.97, 1.00) * specArc * 0.34;

    col *= mix(1.0, 0.62, smoothstep(0.84, 0.99, nd) * (1.0 - fresnel * 0.85));

    col = mix(bloomCol, col, sphereMask);
    float alpha = max(outAlpha, sphereMask);
    col += dither(fragCoord);
    col = clamp(col, 0.0, 1.0);
    // Skia expects premultiplied alpha output
    return half4(half3(col * alpha), half(alpha));
  }

  float3 finalBloom = clamp(bloomCol + dither(fragCoord), 0.0, 1.0);
  return half4(half3(finalBloom * outAlpha), half(outAlpha));
}
```
