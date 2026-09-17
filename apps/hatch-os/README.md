# Hatch OS — Boundaries Coffee dry-run

Software dry-run. Appliance not connected.

**Temp inference: RunPod Serverless Qwen3.8-27B** via OpenAI `chat.completions` (not completions-only). Local Ollama `qwen3:8b` is the documented fallback.

## Morning retest (Daniel)

```bash
cd apps/hatch-os
cp .env.local.example .env.local
# Fill ENDPOINT_ID + HATCH_LLM_API_KEY (RunPod). Never commit the key.

# Fallback if RunPod is cold/down:
ollama serve
ollama pull qwen3:8b

npm i && npm run dev
```

`.env.local`:

```
HATCH_LLM_BASE_URL=https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1
HATCH_LLM_MODEL=qwen/qwen3.8-27b
HATCH_LLM_API_KEY=
HATCH_LLM_PROVIDER=openai-compatible
```

Open http://127.0.0.1:3000

1. Pair **`BOUNDARIES`** + any six digits.
2. Navy/red, Little Elm / Prosper / HQ / Ops, banner **Software dry-run — appliance not connected**.
3. Library: DEMO files + upload persists.
4. Ask in Little Elm: **How does loyalty work?** → TapMango or text **COFFEE**, source `DEMO_loyalty.md`. First RunPod Ask can take **2–3 minutes** (cold start).
5. Status: **RunPod / Qwen3.8** when the base URL contains `runpod.ai`. Host shown, never the key.

Fallback: comment the RunPod lines and use `http://127.0.0.1:11434` + `qwen3:8b`. Later: same env → appliance vLLM. See [INTERIM_INFERENCE.md](./INTERIM_INFERENCE.md).

Invite: `BOUNDARIES` / `HATCH-BETA` = all rooms. `HATCH-ASSOC` = Little Elm only. Marketing site untouched. No Toast. No invented $.
