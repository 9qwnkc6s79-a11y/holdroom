# Hatch OS — Boundaries Coffee dry-run

Software dry-run. Appliance not connected.

Department-first UX: **Enterprise | Departments** (Little Elm, Prosper, HQ Ops). Tabs: **Chat** (threads) · **Files** · **Library**. Ask is firm-capable; writes follow the user’s department membership. See [TOOLS.md](./TOOLS.md).

**Temp inference: RunPod Serverless Qwen3.8-27B** via OpenAI `chat.completions` (not completions-only). Local Ollama `qwen3:8b` is the documented fallback.

## Morning retest (Daniel)

```bash
cd apps/hatch-os
git checkout cursor/hatch-os-departments-192d
git pull
cp .env.local.example .env.local
# Fill HATCH_LLM_API_KEY (RunPod). Never commit the key.

# Fallback if RunPod is cold/down:
ollama serve
ollama pull qwen3:8b

npm i && npm run dev
```

`.env.local`:

```
HATCH_LLM_BASE_URL=https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1
HATCH_LLM_MODEL=Qwen/Qwen3.8-27B-FP8
HATCH_LLM_API_KEY=
HATCH_LLM_PROVIDER=openai-compatible
```

A100 FP8 worker. Use **`Qwen/Qwen3.8-27B-FP8`** — `qwen/qwen3.8-27b` 500s on this endpoint.

### Agentic (Hermes) — paste endpoint id

Ask stays on Qwen (`HATCH_LLM_*`). Chat tool loops use Hermes when these are set:

```
HATCH_AGENT_LLM_BASE_URL=https://api.runpod.ai/v2/<HERMES_ENDPOINT>/openai/v1
HATCH_AGENT_LLM_MODEL=NousResearch/Hermes-4.3-36B
HATCH_AGENT_LLM_API_KEY=<same RunPod key or dedicated>
HATCH_AGENT_LLM_PROVIDER=openai-compatible
```

Replace `<HERMES_ENDPOINT>` with the RunPod Serverless endpoint id. If unset, agent turns fall back to `HATCH_LLM_*`.

Open http://127.0.0.1:3000

1. Pair **`BOUNDARIES`** + any six digits → lands in **Enterprise → Chat**.
2. Navy/red. Switcher: Enterprise | Little Elm | Prosper | HQ Ops. Banner **Software dry-run — appliance not connected**.
3. Tabs Chat (threads: new / rename / archive) · Files (folders, upload, Drive stub) · Library (Add to Library).
4. In Little Elm Chat: **How does loyalty work?** → TapMango or text **COFFEE**, source `DEMO_loyalty.md` (firm-wide read). First RunPod Ask can take **2–3 minutes** (cold start).
5. Associate path: **`HATCH-ASSOC`** → Little Elm only, no Enterprise. Writes to HQ Ops are denied; use Handoff.
6. Status: **Ask: Qwen… / Agent: Hermes…** when both endpoints are set. Host shown, never the key. Pair codes and write ACL are unchanged.

Fallback: comment the RunPod lines and use `http://127.0.0.1:11434` + `qwen3:8b`. Later: same env → appliance vLLM. See [INTERIM_INFERENCE.md](./INTERIM_INFERENCE.md).

Invite: `BOUNDARIES` / `HATCH-BETA` / `COFFEE` = all departments + Enterprise. `HATCH-ASSOC` = Little Elm only. Marketing site untouched. No Toast. No invented $.

## Telegram dogfood (@Hatchboundariesbot)

Phone front door while the OS UI is mid-build. Same Ask (Qwen) / agent (Hermes when tools) stack as Chat. Long-polls `getUpdates` on this Mac — no public webhook.

1. In [BotFather](https://t.me/BotFather) copy the token for [@Hatchboundariesbot](https://t.me/Hatchboundariesbot).
2. `cd apps/hatch-os` and `cp .env.local.example .env.local` if you have not already.
3. Set `HATCH_TELEGRAM_BOT_TOKEN=` (required). Never commit it; the worker will not log it.
4. Optional: `HATCH_TELEGRAM_ALLOWLIST=123456789` (Daniel’s Telegram user id). If empty, the first person who sends `/start` is locked and that id is stored in `data/telegram.json`.
5. LLM env is the same as Chat (`HATCH_LLM_*` / `HATCH_AGENT_LLM_*`).
6. Start the bridge (second terminal is fine if `npm run dev` is already up):

```bash
cd apps/hatch-os
npm i
npm run telegram
# same as: npx tsx scripts/telegram-bridge.ts
```

7. On your phone: open https://t.me/Hatchboundariesbot → `/start` → ask like Chat (`How does loyalty work?`). `/help` lists commands. `/new` starts a fresh thread.

The worker talks to the local store + LLM directly. `npm run dev` is optional (OS UI). First Ask can take 2–3 minutes (RunPod cold start). Typing shows while Hatch thinks. Long replies are chunked. Non-allowlisted users get a polite reject. Groups and voice notes are v0 non-goals.
