# Routines

Routines are saved asks that Hatch runs on a schedule ("every weekday at 7am brief me on open vendor threads") or when something happens ("tell me when Robert replies"). They work like Grok Bot routines, with two Hatch rules:

- **Nothing is saved silently.** Asking in chat shows a routine card (Save / Edit / Cancel). Nothing is saved until the user taps Save.
- **Writes are never automatic.** A routine runs through the normal harness. Any send or change becomes a pending approval card in the routine's thread and on the Routines screen. Approving it there works the same way as in chat.

## Kinds

| Mode | What runs | Model / GPU |
| --- | --- | --- |
| `agent` | The prompt runs through the harness (`startHarnessTurn` / `advanceHarnessTurn`) | Firm model (RunPod), counted against the daily cap |
| `reminder` | Posts `Reminder: <prompt>` | None |
| `notify` | Email trigger posts the sender and subject of new matching mail | None (Gmail API only) |

When:
- **Schedule:** a 5-field cron in the user's time zone (default `America/Chicago`). Daylight saving time is handled. The minimum gap between runs is 15 minutes; tighter crons are rejected.
- **One-time:** `runAt`, for example "tomorrow at 9" or "in 2 hours". A one-time routine turns itself off after it runs.
- **Trigger:** `{ type: "email", query }`. The trigger polls Gmail `messages.list` with `<query> -from:me newer_than:3d` and fetches metadata only. The first check only records the mail already there, so existing mail never fires. After that, only ids it hasn't seen fire.

Natural-language parsing (`src/lib/routines/parse.ts`) uses rules only and makes no model call. Ambiguous asks are left to the regular chat flow.

## Data

All data is stored per session scope (tester code) through `beta-store` (Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise `HATCH_BETA_DIR`):

- `routines/<scope>/doc.json`: `{ version, scope, routines[], active[], usage{day, agentRuns} }`. Each routine has name, prompt, mode, cron/runAt/timezone or trigger, enabled, lastRunAt, nextRunAt, threadId, and its last 20 runs.
- `routines-index/index.json`: the next due time per scope, plus flags for triggers and active runs, so an idle tick costs one Blob read.
- `push/<scope>/tokens`: Expo push tokens. Unused unless push is on.

Results go to a dedicated thread per routine (`agentId: "routines"`, title `Routine · <name>`). Runs start unread. Web and iPhone show them under **Results** on the Routines screen.

## Scheduler

`apps/hatch-os/vercel.json`:

```json
{ "crons": [{ "path": "/api/routines/tick", "schedule": "*/5 * * * *" }] }
```

- `GET /api/routines/tick` requires `Authorization: Bearer $CRON_SECRET`. Vercel sends this header automatically when `CRON_SECRET` is set. Without the secret the route returns 503, and it returns 401 on a mismatch. maxDuration is 300s; the tick works for about 270s.
- Each tick:
  1. Reads the index.
  2. For each scope that is due: checks email triggers (at most every ~15 minutes), posts reminders and notifications, and starts the agent runs that are due.
  3. Polls in-flight agent runs round-robin until its time is up. Leases (55s) stop overlapping ticks from double-advancing a run. A run stuck for more than 30 minutes is marked failed.
- Agent runs that come due in the same tick start together, so they share one GPU wake.
- The tick runs every 5 minutes, not every 15, so a multi-turn harness run moves on while the worker is still warm (600s idle timeout). The 15-minute minimum is enforced per routine, not by the cron.
- Vercel Cron only fires on **production** deployments. Previews never run the scheduler. On a preview, use **Run now**.
- Plan: the hatch-os project is on Vercel Pro, which allows per-minute crons. No plan change is needed.

## Cost guards

- Reminder and email-alert routines never touch the GPU.
- At most `HATCH_ROUTINE_DAILY_RUNS` (default 12) firm-model routine runs per scope per day. Past the cap, runs are recorded as `skipped`.
- 15-minute minimum interval. Agent runs need a firm-model endpoint to be configured; with none configured, runs are `skipped` and no other provider is used.
- `HATCH_ROUTINES=off` turns off the scheduler, chat proposals, and Run now.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /api/routines` | List routines, results, unread count, limits |
| `POST /api/routines` | Create/update (`when` accepts plain English or cron) |
| `PATCH /api/routines` | `{id, enabled}` or `{action: "read", runIds?}` |
| `DELETE /api/routines?id=` | Delete |
| `POST /api/routines/run` | Run now (`{id}`); blocked for the App Review account |
| `POST /api/routines/advance` | Poll in-flight runs while the screen is open |
| `GET /api/routines/tick` | Cron only (`CRON_SECRET`) |
| `POST /api/push/register` | Store an Expo push token (no-op unless `HATCH_PUSH=on`) |
| `POST /api/approvals` | Also handles `routine_create` cards; accepts `edits` from the card's Edit mode |

## Environment

| Var | Default | Notes |
| --- | --- | --- |
| `CRON_SECRET` | unset | **Required for the scheduler.** Set it in Vercel production. Never print it. |
| `HATCH_ROUTINES` | `on` | `off` turns off the whole feature |
| `HATCH_ROUTINE_CHAT` | `on` | `off` turns off the chat proposal card only |
| `HATCH_ROUTINE_DAILY_RUNS` | `12` | Firm-model runs per scope per day |
| `HATCH_ROUTINES_MAX` | `25` | Routines per scope |
| `HATCH_TIME_ZONE` | `America/Chicago` | Default zone for new routines |
| `HATCH_PUSH` | `off` | `on` sends Expo push for new results (generic text, no content) |

## Clients

- **Web:** `/routines` (Routines screen) and the chat card (`RoutineProposalCard`). Routines is also in the apps popover and the agent menu.
- **iPhone:** `app/routines.tsx`, the Profile → Routines row, the Routines entry in the apps sheet, and the `ApprovalCard` routine variant with inline edit.
- **Build 6 compatibility:** chat-created routines work as soon as the server ships. Build 6 shows the card as a generic Approve/Deny, and Approve saves the routine. The Routines screen and the Save/Edit card on iPhone need build 7.

## Push (stub)

The server side is in place (`src/lib/routines/push.ts`, `/api/push/register`), and it stays off unless `HATCH_PUSH=on`. The client needs `expo-notifications`, the APNs push entitlement, and a token registration call. That needs a new EAS build, so it is not wired yet. Push text is always generic ("A routine result is ready in Hatch.") and never includes firm content.

## Tests

`npm test` covers `src/lib/routines/routines.test.ts`: the cron parser and DST, the plain-language parser, store validation, the runner with fake deps (batching, approvals held, daily cap, minimum interval, no model, one-time, email first check and notify, manual run), proposal save/cancel/edit, and push.
