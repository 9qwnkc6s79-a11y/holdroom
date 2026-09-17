# Interim inference

Ask uses OpenAI **`chat.completions`** (`POST {base}/chat/completions`, streaming). Not `/completions`.

## Tonight: RunPod Serverless Qwen3.8-27B

```
HATCH_LLM_BASE_URL=https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1
HATCH_LLM_MODEL=Qwen/Qwen3.8-27B-FP8
HATCH_LLM_API_KEY=<RunPod API key>
HATCH_LLM_PROVIDER=openai-compatible
```

A100 FP8 path. Working model id is **`Qwen/Qwen3.8-27B-FP8`**. `qwen/qwen3.8-27b` 500s on `diqb3ykkxo0i16`.

Bearer on HTTPS. Cold start: Ask waits up to **180s**. Status shows **RunPod / Qwen3.8** when the URL contains `runpod.ai` (host only, no key).

## Fallback (16 GB Mac)

```
HATCH_LLM_BASE_URL=http://127.0.0.1:11434
HATCH_LLM_MODEL=qwen3:8b
```

`ollama serve` + `ollama pull qwen3:8b`. No key. Used when RunPod is unset or the chat call hard-fails.

## Later: appliance / Spark

Same four vars → box vLLM OpenAI-compatible `/v1`. Preferred local-box model remains `qwen3.8` when VRAM allows.

## Ask path

1. Firm-wide keyword RAG over Library files (`inLibrary`) — department UX is not an LLM firewall
2. File listing + optional `read_file` for names mentioned in the query
3. `POST .../openai/v1/chat/completions` with `model: Qwen/Qwen3.8-27B-FP8` (A100 FP8; `qwen/qwen3.8-27b` 500s)
4. Optional trailing `TOOL {…}` line → `write_draft` (ACL) or `handoff_to_department` (no remote write)
5. Cite sources
6. If nothing is up: env / `ollama pull` commands. No invented answer

Keep `HATCH_LLM_BASE_URL`, `HATCH_LLM_MODEL`, `HATCH_LLM_API_KEY`, `HATCH_LLM_PROVIDER`.

## Agent / tools — Hermes (paste endpoint id)

Chat tool loops (`/api/tools`, `write_draft`, tool-calling turns) use a second OpenAI-compatible client. Ask stays on Qwen (`HATCH_LLM_*`).

```
HATCH_AGENT_LLM_BASE_URL=https://api.runpod.ai/v2/<HERMES_ENDPOINT>/openai/v1
HATCH_AGENT_LLM_MODEL=NousResearch/Hermes-4.3-36B
HATCH_AGENT_LLM_API_KEY=<same RunPod key or dedicated>
HATCH_AGENT_LLM_PROVIDER=openai-compatible
```

Replace `<HERMES_ENDPOINT>` with the RunPod Serverless endpoint id when Hermes is up. Prefer vLLM `--tool-call-parser hermes`. If these vars are unset, agent turns fall back to `HATCH_LLM_*`.

Telegram dogfood (`npm run telegram`, [@Hatchboundariesbot](https://t.me/Hatchboundariesbot)) uses this same Ask / agent path. See `apps/hatch-os/README.md`.

