# Hatch

Operating layer for the firm’s knowledge. In-house AI on your network. An ontology over the knowledge base — not chat-on-docs. Encrypted cluster + Hatch OS so employees work without feeding frontier labs (OpenAI / Anthropic / Bedrock).

- Live: https://holdroom.vercel.app (legacy project host; DNS cutover is separate)
- User-facing brand: **Hatch** / **Hatch OS**
- Visual system: dark / precise / diagrammatic (IBM Plex Sans + Mono, cool violet). Do not copy another company’s claims or copy.

## Offer (locked)

| Item | Role | Price |
| --- | --- | --- |
| **Firm** | Smallest public size | Talk to us — dollars not locked yet |
| **Enterprise** | Mid-size / featured | **$28k hardware + $48k/yr platform** |
| **Corporation** | Largest | Talk to us — no public price |

Public homepage must **not** gate on headcount. Soft ranges OK (Enterprise often 50–250). Do not use “floor”, “default”, or “hero SKU” in public UI. Do not use Team / Company / Campus as public size names.

- Hardware = how they believe us (encrypted cluster in their environment)
- Platform = the business (Hatch OS + ontology + knowledge base + packs + house model on their data)

Dead — do not quote: Hold S/M/L at $1,999 / $3,749 / $7,499; software $29 / $149.

Pre-launch inquiries only. No checkout. No token bill.

## What they get

Encrypted cluster (firm-owned / in their environment); Hatch OS (login, files, secure remote over **their** VPN); ontology imaged to how they work; knowledge base customized to **their** corpus; house model; moral pack; legal pack. Not a Hatch cloud LLM as the product. Published price: Enterprise. Firm and Corporation are talk to us until dollars are locked.

Selling trajectory: **ontology across the board** — not just chat-on-docs.

## Site

Static multi-page HTML. No build step. No paid APIs.

| Path | Page |
| --- | --- |
| `/` | Home — operating layer + stack viz, inclusive hero, size cards, compare, CTA |
| `/product/` | Ontology-centered stack, knowledge-base customization, remote, sizes |
| `/how-it-works/` | Unbox → plug in → ask; status; remote; backup |
| `/pricing/` | Firm / Enterprise / Corporation, honest compare |
| `/security/` | What we will / will not claim (incl. remote) |
| `/for/` | Firms that will not leak the file — law, PE/deal, operators as beachheads |
| `/faq/` | Straight answers |
| `/inquire/` | Locked form |
| `/app/` | Internal Phase 1 UI wireframe (clickable HTML/CSS/JS, fake Fund A / Fund B data, not live) |

Shared sticky nav, footer, mobile menu, subtle scroll reveal.

`/app/` is a Hatch OS product wireframe (hash routes, PWA manifest). It is not a production box, not Open WebUI, and not indexed as a marketing page.

Copy prefers platform / operating-layer language. Tagline: operating layer for the firm’s knowledge. Do not use: Holdroom (live brand), Stillroom, Airlock, Strongroom, or inCamera. Do not name a giant-enterprise platform competitor. User-facing titles and footer copy say Hatch — do not print the legacy host URL as visible marketing text. DNS cutover is out of scope for site PRs.

## Claims locks

Do not add: HIPAA, SOC 2, “beats Claude/GPT”, invented customers, checkout, paid APIs, or cold-outreach copy. Do not invent a Hatch cloud.

Inquiry form: `localStorage` key `hatch_inquiries` + `mailto:daniel.keene223@gmail.com`. Fields stay as on `/inquire/` (name, firm, role, email, phone, headcount, tier, secret, message).

## Local

```bash
python3 -m http.server 4173
```

Open http://127.0.0.1:4173/

## Deploy

The Vercel project `holdroom` is linked to this repo with **no framework** (`framework: null`). Push to `main` updates https://holdroom.vercel.app. Keep the site static — do not add a build unless you also set a Vercel build command.

`vercel.json` uses clean URLs and trailing slashes so `/product` and `/product/` both resolve.

## Design tokens

- Void `#07080a`
- Panel `#101216`
- Ink `#eceae4`
- Accent `#8b9cff`
- IBM Plex Sans + IBM Plex Mono
- Sharp 6–8px radii (not pill brochure)
