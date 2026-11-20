# Hatch

In-house AI. Secure data that stays with you. Customized to the firm’s needs and knowledge base. Encrypted cluster + Hatch OS so employees work without feeding frontier labs (OpenAI / Anthropic / Bedrock).

- Live: https://hatchsystems.ai
- Working name: **Hatch** / **Hatch OS**
- Visual system inspired by go.ai (cream, dark nav, violet period, Inter, pills). Not affiliated. Do not copy their claims or copy.

## Offer (locked)

| Item | Role | Price |
| --- | --- | --- |
| **Firm** | Office / draft public number | **$18k hardware + $24k/yr platform** (draft) |
| **Enterprise** | Larger shop | **$28k hardware + $48k/yr platform** |
| Corporation | Custom | Inquire / talk to us |

Public homepage must **not** show dollars or a price grid — soft-CTA to `/pricing/`. Do not gate on headcount. No Team / Company / Campus language.

- Hardware = how they believe us (encrypted cluster in their environment)
- Platform = the business (Hatch OS + packs + house model on their data)

Dead — do not quote: Hold S/M/L at $1,999 / $3,749 / $7,499; software $29 / $149.

Pre-launch inquiries only. No checkout. No token bill.

## What they get

Encrypted cluster you own, in your environment; Hatch OS (ChatGPT-like login, files, secure remote over **your** VPN); house model adapted on **your** knowledge; moral pack; legal pack. Not a Hatch cloud LLM as the product. Public sizes: Firm, Enterprise, Corporation.

## Site

Static multi-page HTML. No build step. No paid APIs.

| Path | Page |
| --- | --- |
| `/` | Home — hero (secure in-house AI on your knowledge), no pricing, CTA |
| `/product/` | Secure in-house AI on your knowledge, stack, packs, remote |
| `/how-it-works/` | Unbox → plug in → ask; status; remote; backup |
| `/pricing/` | Firm / Enterprise / Corporation only |
| `/security/` | What we will / will not claim (incl. remote) |
| `/for/` | Firms that will not leak the file — law, PE/deal, operators as beachheads |
| `/faq/` | Straight answers |
| `/beta/` | Beta access request. Same form as inquire, preset to beta |
| `/inquire/` | Beta access or general / firm inquiry |
| `/admin/requests/` | Private review queue. Not linked in the nav |
| `/app/` | Internal Phase 1 UI wireframe (clickable HTML/CSS/JS, fake Fund A / Fund B data, not live) |

Shared sticky nav, footer, mobile menu, subtle scroll reveal.

`/app/` is a Hatch OS product wireframe (hash routes, PWA manifest). It is not a production box, not Open WebUI, and not indexed as a marketing page.

Copy prefers ownership / room language (“stays with you”, “in the room”, “not to the labs”). Tagline: secure in-house AI on your knowledge. Do not use: Holdroom (live brand), Stillroom, Airlock, Strongroom, inCamera, or Palantir.

## Claims locks

Do not add: HIPAA, SOC 2, “beats Claude/GPT”, invented customers, checkout, paid APIs, or cold-outreach copy.

Inquiry form posts JSON to `/api/inquire`. Fields: name, work email, firm, role, firm size, notes, plus a honeypot. Records are private Blob objects under `site-requests/`. `/admin/requests` is gated by the `HATCH_SITE_ADMIN_CODE` environment variable.

## Local

```bash
python3 -m http.server 4173
```

Open http://127.0.0.1:4173/

## Deploy

The Vercel project `holdroom` is linked to this repo with **no framework** (`framework: null`) and the repo root as the project root. Push to `main` updates https://hatchsystems.ai. Keep the marketing pages static — do not add a build command. Files in `/api` are zero-config Node functions on that same project, and `package.json` only supplies their dependencies.

`vercel.json` uses clean URLs and trailing slashes so `/product` and `/product/` both resolve.

## Design tokens

- Cream `#f5f2ed`
- Nav `#111111`
- Violet `#7c6aef`
- Inter
- Pill buttons
