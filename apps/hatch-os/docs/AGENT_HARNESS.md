# Hatch agent harness

`src/lib/harness/` is the loop that turns a short, sloppy ask into the right
multi-step work: understand → gather (search + open full threads/files) →
model ↔ tools → answer. It runs only on the firm's own models (RunPod today,
the Hatch box later). Nothing here calls OpenAI, Anthropic, Google AI, or any
other outside model API.

## Flow

1. **Understand** (`intent.ts`, no model call). Classifies the ask
   (`status_brief`, `find`, `draft_reply`, `schedule`, `remember`, `chat`),
   resolves names through firm memory (typo-tolerant: "monumnet sign" → the
   Little Elm monument sign project), strips filler ("get up to speed on"),
   and builds a search ladder, strict first:
   `"monument sign" "little elm" boundaries` → `monument sign boundaries little elm`
   → `monument sign boundaries` → `monument OR signage OR …`.
   Everyday questions default to looking things up; only clearly
   general/creative asks (haiku, math, definitions) stay plain chat.
2. **Gather** (`engine.ts` `advance()`, no model call). Searches each
   connected source in order. Empty result → next query on the ladder
   (`retrying` event). Thin result on a status brief → one widening search on
   the topic words. Then opens the top 3 hits per source in full (Gmail
   `threads.get?format=full`, Drive export, calendar window from "tmrw" /
   "this week"). `live-sources.ts` is the read-only live adapter.
3. **Context budget** (`context.ts`). Quoted replies and signatures are
   stripped; the newest messages stay whole, older ones shrink to header +
   first sentences; each thread gets a "Latest message (date, sender): …" line
   so small models weigh recency. Evidence is ranked and fitted to the lane's
   window (Qwen 32k, Hermes 16k on today's endpoints).
4. **Model ↔ tools.** The model gets the core rules (`system-prompt.ts`),
   firm memory, the Model & Ethics rules, the evidence, and the tools it may
   still call (search/read email, files, calendar, library, save an email
   draft). Up to 3 model turns. Writes (send email, create event, write file,
   handoff, vault) are held for approval; nothing is sent automatically.
   A tool-only or empty last reply gets one forced synthesis pass.
5. **Answer.** Lead with the bottom line, concrete specifics, cite subjects /
   file names, at most one question at the end.

The state is plain JSON. Vercel functions stop at 60 s and RunPod jobs are
polled, so `/api/chat` returns `{ phase: "wait", state }` and the client posts
`state` back to `/api/chat/step` every few seconds. Harness state is
`version: 2` and HMAC-signed with the vault key; a tampered state is refused.

## Activity events (for the bottom status line)

Every `/api/chat` and `/api/chat/step` response from the harness includes:

```ts
{
  harness: true,
  status: string,            // one line for the bottom of the chat, e.g. "Reading “Monument sign – revised proof v3”"
  note?: string,             // same as status while waiting (the current UI already shows `note`)
  activity: ActivityEvent[], // full list for this turn, oldest first (max 40)
  phase: "wait" | "done",
  ...                        // text, tools, sources, approval, threadId, messageId as before
}

interface ActivityEvent {
  id: string;                // "a1", "a2", … stable within the turn
  kind: "understanding" | "searching" | "retrying" | "reading" | "thinking"
      | "waking" | "writing" | "remembering" | "waiting_approval" | "done" | "error";
  label: string;             // human, present tense, safe to show as-is (≤120 chars, no secrets)
  source?: "gmail" | "outlook" | "mail" | "drive" | "onedrive" | "calendar" | "library"
         | "slack" | "notion" | "github" | "linear" | "memory" | "model";
  status: "active" | "done" | "failed";  // failed = finished with nothing found / error
  count?: number;            // results found or items read
  at: number;                // epoch ms
}
```

Render `status` in the pinned line above the composer; optionally render
`activity` as a collapsible "What Hatch did" list under the answer
(✓ done, ✗ failed). While the model server is cold the `note` says it is
waking (2–5 minutes after a break).

## Routing

- Plain chat → Ask lane (Qwen3.8-27B), no searching.
- Anything that needs data → the tool lane (default Ask/Qwen with the text
  `<tool_call>` protocol, because the Qwen endpoint runs without vLLM's
  auto tool choice; set `HATCH_AGENT_TOOL_LANE=agent` or pick Hermes in Model
  & Ethics to use Hermes with native tools).
- The web composer sends `agent: true` on every turn. The harness treats that
  as a hint and decides by intent; `agent: false` still forces plain chat.
- Turns with a photo keep the existing vision path (`chat-live.ts`).

## Firm memory

`GET/PUT/POST /api/memory` (scope = tester code, like the other routes).
People, projects (with aliases + search keywords), places, preferences, and
remembered facts. "remember that …" in chat saves a fact. Stored encrypted
with the vault key. Memory feeds entity matching and a short block in the
system prompt.

## Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `HATCH_AGENT_HARNESS` | `on` | `off` falls back to the old `chat-live.ts` loop |
| `HATCH_AGENT_TOOL_LANE` | `ask` (or `agent` when Model & Ethics = Hermes) | lane that runs tool-using turns |
| `HATCH_AGENT_SYNTH_LANE` | `same` | `ask` = Hermes gathers, Qwen writes the final answer (wakes two endpoints) |
| `HATCH_ASK_TOOL_PROTOCOL` | `text` | `native` once the Qwen endpoint has `--enable-auto-tool-choice` |
| `HATCH_AGENT_TOOL_PROTOCOL` | `native` | Hermes uses vLLM's hermes parser |
| `HATCH_ASK_CONTEXT_TOKENS` / `HATCH_AGENT_CONTEXT_TOKENS` | `32768` / `16384` | match MAX_MODEL_LEN on the endpoints |
| `HATCH_TIME_ZONE` | `America/Chicago` | for "today" / "tmrw" |

## Eval

```
npm run eval:agent                       # offline: 21 sloppy asks × 4 pipelines, mocked model
npm run eval:agent -- --verbose          # print answers + activity
npm run eval:agent -- --live --lane ask  # live, cases marked `live`, firm RunPod only
npm run eval:agent -- --live --exchange /tmp/x   # write requests to files, submit with any RunPod client, re-run
```

Fixtures in `eval/agent/fixtures.ts` are fictional and marked `[FIXTURE]`.
The offline mock model is the same for every pipeline and only uses what is in
its prompt, so offline scores measure retrieval/reading/routing/context, not
writing. Live mode measures the real model. Rubric (100/case): routing 15,
facts 40, no needless clarifying question 15, leads with the answer 10,
names its source 10, honesty 10.


## Native tool calls (structured)

When a lane's protocol is `native`, tools go in the OpenAI `tools` field with typed JSON schemas
(`openAiTool()`, `strict: true`), vLLM returns `tool_calls`, and the next turn replays them as an
assistant `tool_calls` message plus one `tool` message per result. Qwen3.8 needs the endpoint started
with `ENABLE_AUTO_TOOL_CHOICE=true`, `TOOL_CALL_PARSER=qwen3_coder`, `REASONING_PARSER=qwen3`. If an
endpoint refuses tools (no auto tool choice), the harness falls back to the text protocol for that
turn automatically. `<function=...><parameter=...>` XML that leaks into text is parsed too.

`HATCH_THINK_ON_TOOLS=on` lets Qwen reason on tool-choice turns only; final answers never think.

## Claim check

`verify.ts` checks every quoted phrase, date, time, amount, percentage, ID and multi-digit number in
the final answer (and in email draft bodies) against what Hatch read this turn, the user's own words,
earlier turns, firm memory and today's date. Unsupported bullets are dropped with a one-line note;
other unsupported claims are flagged inline "(not in your sources)". Drafts lose sentences that
invent an attachment or a "tomorrow"/"tonight" meeting the user did not ask for. Counts (never text)
are returned as `verification` on the turn result. `HATCH_VERIFY_CLAIMS=off` disables it.
