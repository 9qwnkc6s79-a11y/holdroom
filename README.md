# Hatch

In-house AI. Secure data that stays with you. Customized to the firm’s needs and knowledge base. Encrypted cluster + Hatch OS so employees work without feeding frontier labs (OpenAI / Anthropic / Bedrock).

- Live: https://holdroom.vercel.app (legacy project host)
- Working name: **Hatch** / **Hatch OS**
- Visual system inspired by go.ai (cream, dark nav, violet period, Inter, pills). Not affiliated. Do not copy their claims or copy.

## Offer (locked)

| Item | Role | Price |
| --- | --- | --- |
| Team | Floor / entry — not hero | Talk to us |
| **Firm** | **Default quote — v1 hero** | **$28k hardware + $48k/yr platform** |
| Company | Price card only — not v1 | Talk to us |
| Campus | Price card only — not v1 | Talk to us |

Internal aim: **50–250 person firms** (Firm SKU hero). Public homepage must **not** gate on headcount — Team is the floor; a ~15 person shop is welcome. Keep 50–250 quieter (pricing, FAQ “typical customer,” deep product).

- Hardware = how they believe us (encrypted cluster in their environment)
- Platform = the business (Hatch OS + packs + house model on their data)

Dead — do not quote: Hold S/M/L at $1,999 / $3,749 / $7,499; software $29 / $149.

Pre-launch inquiries only. No checkout. No token bill.

## What they get

Encrypted cluster (firm-owned / in their environment); Hatch OS (ChatGPT-like login, files, secure remote over **their** VPN); house model adapted on **their** knowledge base; moral pack; legal pack. Not a Hatch cloud LLM as the product. Featured quote is Firm; Team is the floor.

## Site

Static multi-page HTML. No build step. No paid APIs.

| Path | Page |
| --- | --- |
| `/` | Home — inclusive hero (in-house / secure / customized), stacked compare, CTA |
| `/product/` | In-house + secure + knowledge-base pitch, stack, packs, remote, tiers |
| `/how-it-works/` | Unbox → plug in → ask; status; remote; backup |
| `/pricing/` | Team / Firm / Company / Campus, honest compare |
| `/security/` | What we will / will not claim (incl. remote) |
| `/for/` | Firms that will not leak the file — law, PE/deal, operators as beachheads |
| `/faq/` | Straight answers |
| `/inquire/` | Locked form |
| `/app/` | Internal Phase 1 UI wireframe (clickable HTML/CSS/JS, fake Fund A / Fund B data, not live) |

Shared sticky nav, footer, mobile menu, subtle scroll reveal.

`/app/` is a Hatch OS product wireframe (hash routes, PWA manifest). It is not a production box, not Open WebUI, and not indexed as a marketing page.

Copy prefers ownership / room language (“stays with you”, “in the room”, “not to the labs”). Tagline: private AI clean room. Do not use: Holdroom (live brand), Stillroom, Airlock, Strongroom, inCamera, or Palantir.

## Claims locks

Do not add: HIPAA, SOC 2, “beats Claude/GPT”, invented customers, checkout, paid APIs, or cold-outreach copy.

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

- Cream `#f5f2ed`
- Nav `#111111`
- Violet `#7c6aef`
- Inter
- Pill buttons
