# Interim inference (no appliance yet)

Hatch OS Ask talks to a **local** OpenAI-compatible chat endpoint. Today that is **Ollama on this Mac**. Tomorrow the same env vars point at the appliance (vLLM / OpenAI-compatible).

Firm / library content never goes to OpenAI, Anthropic, or Bedrock.

## Model tags

| When | Ollama tag | Why |
| --- | --- | --- |
| **Tomorrow on Daniel’s 16 GB Mac** | **`qwen3:8b`** | Fits 16 GB RAM. Default in `.env.local.example`. |
| **Appliance / Spark (enough VRAM)** | **`qwen3.8`** | Qwen3.8-27B (~18 GB). Preferred target. Do not default this on the 16 GB laptop. |

Do not point Ask at `llama3.1:8b` even if it is already pulled.

Ask calls `POST {base}/v1/chat/completions` with the configured `HATCH_LLM_MODEL`.

## Env (same shape on the appliance)

```bash
HATCH_LLM_BASE_URL=http://127.0.0.1:11434
HATCH_LLM_MODEL=qwen3:8b
HATCH_LLM_API_KEY=            # unused by Ollama; used later if vLLM requires a key
```

Copy `.env.local.example` → `.env.local`.

When Sparks arrive, change only the model (or the base URL):

```bash
HATCH_LLM_MODEL=qwen3.8
# or
HATCH_LLM_BASE_URL=http://<appliance>:8000
```

## How Ask works

1. Client `POST /api/chat` with `{ roomId, query }`.
2. Server retrieves **this room only** from the Library store (seed + uploads). v0 scoring is keyword overlap on ~700-char chunks.
3. Probe Ollama `GET /api/tags`. Status shows **configured model** and **whether Ollama is reachable**. If down or the configured model is missing, the stream is a **clear error** plus copy-paste Mac install/pull commands. No invented answer.
4. If up: build a Boundaries-only prompt (passages + “cite filenames”) and stream:
   - first try OpenAI-compatible `POST {base}/v1/chat/completions`
   - else native `POST {base}/api/chat`
5. UI streams tokens, then shows **Sources** under the answer.

Nothing in this path calls a frontier API.

## Laptop (today)

```bash
# 1. Ollama (already on Daniel’s Mac)
ollama serve
ollama pull qwen3:8b

# 2. Hatch OS
cd apps/hatch-os
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://127.0.0.1:3000 — pair with `BOUNDARIES` + any six digits.

Status should show configured model `qwen3:8b` and Ollama reachable. First Ask may take ~30–90s on CPU while the 8B loads.

## Appliance (later)

Keep the Ask route and env names. Change only:

```bash
HATCH_LLM_BASE_URL=http://<appliance>:8000   # vLLM OpenAI-compatible root
HATCH_LLM_MODEL=qwen3.8                      # or the served id
HATCH_LLM_API_KEY=<if-required>
```

Hatch OS already prefers `/v1/chat/completions`. No UI rewrite.

## Persistence

Library seed + uploads live under `apps/hatch-os/data/` (`state.json` + `uploads/`). Restart keeps files. Delete `data/state.json` to re-seed DEMO docs.
