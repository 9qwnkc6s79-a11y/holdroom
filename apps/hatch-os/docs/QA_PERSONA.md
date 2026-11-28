# Persona QA (`npm run qa:persona`)

A scripted "Daniel" types realistic, sloppy asks into the **real Hatch web UI** with Playwright
(phone 390×844 and desktop 1280×800) against a deployed Hatch with real connected Gmail/Drive/Calendar,
then grades every reply with **deterministic checks**. No model grades anything, so no firm content
leaves the firm.

```bash
QA_BASE_URL=https://<preview>.vercel.app \
QA_CODE=<invite code> \
QA_CASES=/private/persona-daniel.json \   # real asks + ground truth, never committed
QA_PROFILE=qwen27b-native \               # optional, preview-only server profile
npm run qa:persona
```

Other env: `QA_VIEWPORTS=phone,desktop`, `QA_ONLY=id1,id2`, `QA_OUT=dir` (default `qa/persona/results`, git-ignored),
`QA_BROWSER=webkit`, `QA_MIN_PASS=0.9` (exit 1 below), `QA_REPORT_TEXT=1` (answers in the report).

## Cases

`qa/persona/cases.example.json` shows the format with fictional asks. Each scenario is a fresh thread
(server history is hidden from the test browser, like a new device); turns inside a scenario are
follow-ups. Turn kinds: `chat`, `lookup`, `draft`, `schedule`, `notfound`. Optional `facts` (regexes a
correct answer contains), `forbid` (wrong thread, invented status, misattribution), `anchor` (proves a
follow-up stayed on the thread), `maxSeconds`.

## Checks (all must pass)

| check | how |
| --- | --- |
| answered | `/api/chat` or `/api/chat/step` returned `phase: done` with text or a draft |
| routing | casual asks did not search; lookups/drafts/schedule did (activity events) |
| facts / noForbidden / anchored | regexes from the case file |
| honestNotFound | not-found asks say so plainly |
| draftCard | `.email-draft-card` visible in the newest turn with a body |
| grounded | server claim check (`verification`) shows no unsupported quote/date/amount/ID left in the reply |
| noToolLog | no raw tool names, `<tool_call>`, or "Used a tool" rows anywhere in the chat |
| latency | warm turn under budget (chat 20s, lookup 75s, draft 90s, schedule 60s); cold starts are marked, not graded |
| layout | no horizontal scroll, composer on screen, newest turn visible (or jump button), no bubble/pill/card overflow |

## Preview profiles

`src/lib/preview-overrides.config.ts` holds named server configs (model endpoint, tool protocol,
claim check, thinking). The runner sends `x-hatch-qa-profile`; the server honors it **only when
`VERCEL_ENV=preview`** and only for allow-listed, non-secret keys pointing at the firm's RunPod.
Keep `PREVIEW_OVERRIDES` / `PREVIEW_PROFILES` empty on main.

## UX sweep (`npm run qa:ux`)

`qa/persona/ux.ts` walks every web surface at 390x844 and 1280x800 and writes `report.md` (pass/fail per
check, with a screenshot per surface) and `report.json` to `qa/persona/results/ux-*` (or `QA_OUT`).

```
QA_BASE_URL=https://hatch-os.vercel.app QA_CODE=<invite> npm run qa:ux
```

It signs in for real, but every write is intercepted by Playwright and answered by the test, so it is safe on
production: email send/save/discard, connector disconnect and OAuth start, routines writes (in-memory
fake), Model & Ethics saves, approvals, and thread saves. Chat replies for the card, citation, loading and
error states are mocked with fictional `[QA]` data, so the sweep uses no GPU time.

Surfaces: sign-in (bad code, good code), empty chat, loading line, citations and source pills, email
draft card (edit, Save as Gmail draft, Send only on press, Discard, missing-scope reconnect), server error
Retry, expired session Sign in, long-thread scroll and Jump to latest, settings home, light/dark contrast
(WCAG 4.5:1, computed), Model & Ethics save, Connect apps (healthy, missing gmail.compose, expired
Microsoft, API error, Disconnect, Connect Microsoft), routines (empty, create, cap message, pause, edit,
delete), sign-out (cookie rejected afterwards) and the Bearer flow (pair token works, tampered and
missing tokens get 401; the token is never printed). `QA_ONLY=routines,connect` limits the run.
