# Interim inference

Ask always uses an **OpenAI-compatible** `POST {base}/chat/completions` client. The vendor is not hardcoded.

## Three targets (same env)

| When | `HATCH_LLM_BASE_URL` | Model | Key |
| --- | --- | --- | --- |
| Temporary remote (overnight) | `https://<host>/v1` | `qwen3.8` or the provider id | **Required** (`Authorization: Bearer`) |
| 16 GB Mac fallback | `http://127.0.0.1:11434` | `qwen3:8b` | Not required |
| Appliance / Spark later | `http://<box>:8000/v1` (example) | `qwen3.8` | If the box requires it |

```bash
HATCH_LLM_BASE_URL=https://<host>/v1
HATCH_LLM_MODEL=qwen3.8
HATCH_LLM_API_KEY=...
HATCH_LLM_PROVIDER=openai-compatible
```

- HTTPS remote: Bearer key required. URL may already include `/v1` — do not double it.
- Localhost Ollama: no key. Client tries `/v1/chat/completions`, then native `/api/chat`.
- If remote is set and down, Ask falls back to local Ollama `qwen3:8b` when that is pulled.
- `HATCH_LLM_PROVIDER` defaults to `openai-compatible`. A Bedrock adapter is later — not in this ship.

Status shows **host only** (not the key) and reachability.

## How Ask works

1. `POST /api/chat` `{ roomId, query }`
2. Room-scoped keyword retrieve (seed + uploads)
3. Probe configured endpoint (`GET /models` remote, `GET /api/tags` local)
4. Stream completions. Cite sources.
5. If nothing is up: error + env / `ollama pull` commands. No invented answer.

Firm / library content is not sent to a named public-lab SDK. Temporary remote is an operator-owned OpenAI-compatible URL.

## Persistence

`apps/hatch-os/data/` — `state.json` + `uploads/`. Delete `state.json` to re-seed DEMO docs.
