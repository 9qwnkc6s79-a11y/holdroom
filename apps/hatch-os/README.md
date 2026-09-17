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

Open http://127.0.0.1:3000

1. Pair **`BOUNDARIES`** + any six digits → lands in **Enterprise → Chat**.
2. Navy/red. Switcher: Enterprise | Little Elm | Prosper | HQ Ops. Banner **Software dry-run — appliance not connected**.
3. Tabs Chat (threads: new / rename / archive) · Files (folders, upload, Drive stub) · Library (Add to Library).
4. In Little Elm Chat: **How does loyalty work?** → TapMango or text **COFFEE**, source `DEMO_loyalty.md` (firm-wide read). First RunPod Ask can take **2–3 minutes** (cold start).
5. Associate path: **`HATCH-ASSOC`** → Little Elm only, no Enterprise. Writes to HQ Ops are denied; use Handoff.
6. Status: **RunPod / Qwen3.8** when the base URL contains `runpod.ai`. Host shown, never the key.

Fallback: comment the RunPod lines and use `http://127.0.0.1:11434` + `qwen3:8b`. Later: same env → appliance vLLM. See [INTERIM_INFERENCE.md](./INTERIM_INFERENCE.md).

Invite: `BOUNDARIES` / `HATCH-BETA` / `COFFEE` = all departments + Enterprise. `HATCH-ASSOC` = Little Elm only. Marketing site untouched. No Toast. No invented $.
