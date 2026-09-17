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

1. Room-scoped keyword RAG (seed + uploads)
2. `POST .../openai/v1/chat/completions` with `model: Qwen/Qwen3.8-27B-FP8` (A100 FP8; `qwen/qwen3.8-27b` 500s)
3. Cite sources
4. If nothing is up: env / `ollama pull` commands. No invented answer
