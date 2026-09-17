# Hatch OS — Boundaries Coffee dry-run

Software dry-run. Appliance not connected. **16 GB Mac default: `qwen3:8b`.** `qwen3.8` is the Spark / appliance target later. No OpenAI / Anthropic / Bedrock for firm files.

## Morning retest (Daniel)

```bash
# Ollama is already on this Mac. Pull Qwen — do not use llama3.1:8b.
ollama serve
ollama pull qwen3:8b

cd apps/hatch-os
cp .env.local.example .env.local
npm i && npm run dev
```

Open http://127.0.0.1:3000

1. Pair **`BOUNDARIES`** + any six digits (TOTP stub).
2. Confirm navy/red shell, logo, rooms **Little Elm / Prosper / HQ / Ops**, banner **Software dry-run — appliance not connected**.
3. Library: DEMO files listed. Drop a `.md` / PDF / image — it stays after refresh.
4. Ask in Little Elm: **How does loyalty work?** → TapMango **or** text **COFFEE**, source `DEMO_loyalty.md`.
5. Status: configured model `qwen3:8b`, Ollama reachable.

If Ask errors, it prints `ollama serve` + `ollama pull qwen3:8b`. It will not invent an answer.

First Ask can take ~1 minute while the 8B loads. Leave `ollama serve` running.

```
HATCH_LLM_BASE_URL=http://127.0.0.1:11434
HATCH_LLM_MODEL=qwen3:8b
HATCH_LLM_API_KEY=
```

Later (Spark / enough VRAM): `HATCH_LLM_MODEL=qwen3.8` or point `HATCH_LLM_BASE_URL` at appliance vLLM. Same Ask API. See [INTERIM_INFERENCE.md](./INTERIM_INFERENCE.md).

## What’s in the box

- Invite: `BOUNDARIES` / `HATCH-BETA` / `COFFEE` = all rooms. `HATCH-ASSOC` = Little Elm only.
- Seed (DEMO): catering, loyalty (TapMango **or** text COFFEE → next drip free), open/close, GM stubs Rafael / Heath.
- Ask = room-scoped keyword RAG + stream from local Ollama. Uploads persist under `data/`.
- Marketing site at repo root is untouched.

Non-goals: no Toast, no invented $, no hardware-ships claim.
