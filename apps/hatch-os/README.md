# Hatch OS (Phase 1 UI)

ChatGPT-simple firm AI on the box: login, files, chat. This app is the Hatch-owned UI — not Open WebUI, not a Hatch cloud, not the marketing site.

Inference and files stay on the firm box. Remote access is over the **firm’s VPN / WireGuard** only. Encrypted logs. No frontier API for firm content.

The public marketing site (`hatchsystems.ai` / Vercel project **holdroom**) stays a static site at the repo root. Do not deploy this Next.js app as that project’s root.

## Run

```bash
cd apps/hatch-os
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

```bash
npm run build
npm start
```

## Pair (mock auth)

| Invite | Result |
| --- | --- |
| `HATCH-BETA` | Partner. Fund A + Fund B. TOTP = any six digits. |
| `HATCH-ASSOC` | Associate. Fund A only. |
| `HATCH-NOSEAT` | “No seat for this invite — admin can add one.” |
| Passkey button | Registers a passkey on this box when the browser supports it; otherwise a demo pair. |

SSO is later. No SMS. No “sign in with Google.”

## Screens

Ask · Rooms · Library · Status · Admin · Settings. Phone tabs: Ask · Rooms · Library · More.

- **Ask** — composer, streaming from `/api/chat`, room chip, Sources under answers.
- **Rooms** — Fund A / Fund B isolation. No cross-room search.
- **Library** — upload to the current room, queued → extracting → indexed → ready, designed empty/error copy.
- **Status** — box health. **FAIL=blocked** is good. **PASS=reachable** is an error. Unchecked is not live.
- **Admin** — seats/invites, room grants, backup and signed-update placeholders.
- **Settings** — devices, sign out, remote how-to (firm tunnel; never Hatch cloud).

PWA: add to home screen. Offline page: “Can’t reach Hatch…”. The service worker caches only `offline.html` — never the corpus.

## Mock API + optional adapters

Synthetic Fund A (Northshore CIM / QoE) and Fund B (Harbor CIM) live in `src/lib/mock-data.ts`.

| Route | Role |
| --- | --- |
| `POST /api/auth/pair` | Invite + TOTP or passkey |
| `POST /api/chat` | Streaming answer, room-scoped |
| `GET /api/rooms` | Room list, `crossRoomSearch: false` |
| `GET /api/library?room=` | Files in one room |
| `GET /api/search?q=&room=` | Room-scoped retrieve |
| `POST /api/ingest` | Queue ingest for a room |
| `GET /api/status` | Health + egress. `?egress=pass` / `?egress=unknown` demos |
| `GET/POST /api/admin` | Seats, backup, updates |

Copy `.env.example` to `.env.local` to point at the dry-run box:

- `STATUS_URL` (default `http://127.0.0.1:8090`) — `GET /status`
- `RAG_URL` (default `http://127.0.0.1:8091`) — `/search`, `/ingest`

If those ports are down, the UI keeps the synthetic mock. RAG hits are still filtered to the current room.

## Non-goals

Open WebUI white-label, Hatch-cloud chat, BYO frontier keys, App Store, spend, inventing BOM dollars, ontology on day one.

## Brand

Cream `#f5f2ed`, ink `#111`, violet `#7c6aef`, Inter. Name is Hatch / Hatch OS only.
