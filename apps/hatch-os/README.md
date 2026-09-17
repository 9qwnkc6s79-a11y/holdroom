# Hatch OS — Boundaries Coffee dry-run

ChatGPT-simple firm AI: login, files, chat. This app is the Hatch-owned UI — not Open WebUI, not a Hatch cloud, not the marketing site.

**This checkout is a software dry-run.** The DGX Spark / appliance is not connected. Daniel’s Mac has **16 GB RAM**, so tomorrow’s default is **`qwen3:8b`**. **`qwen3.8`** (Qwen3.8-27B, ~18 GB) is the appliance / Spark target once there is enough VRAM. Same `HATCH_LLM_*` shape either way.

Inference and files stay on this machine. No frontier API (OpenAI / Anthropic / Bedrock) for firm or library content.

The public marketing site (`hatchsystems.ai` / Vercel project **holdroom**) stays a static site at the repo root. Do not deploy this Next.js app as that project’s root.

## Mac setup (Daniel — tomorrow)

```bash
# 1. Local Qwen (required for Ask)
#    https://ollama.com/download   or   brew install ollama
ollama serve
ollama pull qwen3:8b

# 2. App
cd apps/hatch-os
cp .env.local.example .env.local
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

If Ollama is down, Ask shows copy-paste install/pull commands and does **not** invent answers.

Daniel’s Mac already has Ollama (and `llama3.1:8b`). Pull **`qwen3:8b`** separately — do not point Ask at Llama. First Ask can take a minute on CPU while the 8B loads.

**Later (Spark / enough VRAM):** `ollama pull qwen3.8` and set `HATCH_LLM_MODEL=qwen3.8`. That is the preferred appliance target. Do not use `qwen3.8` as the 16 GB laptop default.

See [INTERIM_INFERENCE.md](./INTERIM_INFERENCE.md) for the later appliance swap.

## Pair (mock auth)

| Invite | Result |
| --- | --- |
| `BOUNDARIES` or `HATCH-BETA` or `COFFEE` | Partner. Little Elm + Prosper + HQ / Ops. TOTP = any six digits. |
| `HATCH-ASSOC` | Associate. Little Elm only. |
| `HATCH-NOSEAT` | “No seat for this invite — admin can add one.” |
| Passkey button | Registers a passkey on this box when the browser supports it; otherwise a demo pair. |

SSO is later. No SMS. No “sign in with Google.”

## Tenant (dogfood)

- **Boundaries Coffee** — navy `#0c2340`, accent `#E1523F`, logo in `public/brand/`.
- Rooms: **Little Elm** (27078 East University Drive, Little Elm, TX 76227), **Prosper** (1450 Frontier Pkwy., Prosper, TX 75078), **HQ / Ops**.
- Banner: “Software dry-run — appliance not connected”.
- “Powered by Hatch OS” only in the desktop footer and Settings.

## Seed library (DEMO)

Labeled DEMO. Catering protocol, loyalty (TapMango tiers **or** text **COFFEE** → next house drip free), open/close checklists, GM stubs (Rafael / Little Elm, Heath / Prosper). Image + PDF + markdown. Uploads persist under `data/`.

## Screens

Ask · Rooms · Library · Status · Admin · Settings. Phone tabs: Ask · Rooms · Library · More.

- **Ask** — composer, stream from `/api/chat` → local Qwen, room chip, Sources under answers.
- **Rooms** — Little Elm / Prosper / HQ isolation. No cross-store search.
- **Library** — upload to the current room (PDF, Office, markdown, PNG / JPEG / WebP / GIF). Persisted. Image OCR stubbed.
- **Status** — LLM connected / disconnected + dry-run. **FAIL=blocked** is good. **PASS=reachable** is an error.
- **Admin** — seats/invites, room grants, backup and signed-update placeholders.
- **Settings** — devices, sign out, remote how-to (firm tunnel; never Hatch cloud).

PWA: add to home screen. Offline page: “Can’t reach Hatch…”. The service worker caches only `offline.html` — never the corpus.

## Env

`.env.local.example`:

```bash
HATCH_LLM_BASE_URL=http://127.0.0.1:11434
HATCH_LLM_MODEL=qwen3:8b
HATCH_LLM_API_KEY=
```

Optional adapters: `STATUS_URL` `:8090`, `RAG_URL` `:8091`. If those ports are down, the UI uses the on-disk store.

## API

| Route | Role |
| --- | --- |
| `POST /api/auth/pair` | Invite + TOTP or passkey |
| `POST /api/chat` | Room-scoped RAG + stream from local LLM |
| `GET /api/rooms` | Room list, `crossRoomSearch: false` |
| `GET /api/library?room=` | Files in one room |
| `GET /api/search?q=&room=` | Room-scoped retrieve |
| `POST /api/ingest` | Multipart upload **or** JSON delete |
| `GET /api/status` | Health + LLM probe + egress demos |
| `GET/POST /api/admin` | Seats, backup, updates |

## Non-goals

No real Toast connectors. No invented dollar amounts. No marketing-site changes. No claim that hardware ships. No Open WebUI white-label, Hatch-cloud chat, BYO frontier keys, App Store, or ontology on day one.
