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
