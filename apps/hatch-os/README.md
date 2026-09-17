# Hatch OS — Boundaries Coffee dry-run

Software dry-run. Appliance not connected. Ask uses a **temporary OpenAI-compatible** endpoint if configured, then **local Ollama** on this Mac. No named public-lab SDK. Firm files stay in Hatch OS.

## Morning retest (Daniel)

```bash
cd apps/hatch-os
cp .env.local.example .env.local
# If overnight remote is up, set in .env.local:
#   HATCH_LLM_BASE_URL=https://<host>/v1
#   HATCH_LLM_MODEL=qwen3.8
#   HATCH_LLM_API_KEY=...
#   HATCH_LLM_PROVIDER=openai-compatible
# Otherwise leave localhost + qwen3:8b.

# Local fallback (always useful):
ollama serve
ollama pull qwen3:8b

npm i && npm run dev
```

Open http://127.0.0.1:3000

1. Pair **`BOUNDARIES`** + any six digits.
2. Navy/red shell, Little Elm / Prosper / HQ / Ops, banner **Software dry-run — appliance not connected**.
3. Library: DEMO files + upload a `.md` / PDF / image (persists).
4. Ask in Little Elm: **How does loyalty work?** → TapMango **or** text **COFFEE**, source `DEMO_loyalty.md`.
5. Status: **endpoint host** (never the API key) + **reachable**. Remote down → local Ollama fallback.

If nothing is reachable, Ask prints copy-paste env / `ollama pull` commands. It will not invent an answer.

```
HATCH_LLM_BASE_URL=https://<host>/v1    # or http://127.0.0.1:11434
HATCH_LLM_MODEL=qwen3.8                 # remote; local default qwen3:8b
HATCH_LLM_API_KEY=                      # required for https
HATCH_LLM_PROVIDER=openai-compatible
```

**Swap later:** same four vars → appliance vLLM (`http://<box>:8000/v1`). No Ask rewrite. `qwen3.8` is the Spark target. Do not commit `.env.local`.

See [INTERIM_INFERENCE.md](./INTERIM_INFERENCE.md).

## What’s in the box

- Invite: `BOUNDARIES` / `HATCH-BETA` / `COFFEE` = all rooms. `HATCH-ASSOC` = Little Elm only.
- Seed (DEMO): catering, loyalty, open/close, GM stubs Rafael / Heath.
- Ask = room-scoped keyword RAG + stream. Uploads persist under `data/`.
- Marketing site at repo root is untouched.

Non-goals: no Toast, no invented $, no hardware-ships claim, no hardcoded cloud vendor.
