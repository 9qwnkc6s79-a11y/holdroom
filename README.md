# Holdroom

Ready local AI: a box you own. Compute, memory, and a model already on it. Plug into the network. Labs never see the files.

- Live: https://holdroom.vercel.app
- Brand / canonical: https://holdroom.ai (domain intended; not required to resolve)
- Visual system inspired by go.ai (cream, dark nav, violet period, Inter, pills). Not affiliated. Do not copy their claims or copy.

## Offer (do not blur)

| Item | Price |
| --- | --- |
| Hold S | $1,999 |
| Hold M (default) | $3,749 |
| Hold L | $7,499 |
| Software, solo | $29/mo |
| Software, firm (up to 8 seats) | $149/mo |

Pre-launch inquiries only. No checkout. No token bill. Setup is quoted after fit.

## Site

Static multi-page HTML. No build step. No paid APIs.

| Path | Page |
| --- | --- |
| `/` | Home — offer above the fold |
| `/product/` | What ships, stack, S/M/L |
| `/how-it-works/` | Unbox → plug in → ask; egress; status page |
| `/pricing/` | Hardware, software, setup, honest compare |
| `/security/` | Local data; what we will / will not say |
| `/for/` | Law, PE/deal, operators |
| `/faq/` | Straight answers |
| `/inquire/` | Locked form |

Shared sticky nav, footer, mobile menu, subtle scroll reveal.

## Claims locks

Do not add: HIPAA, SOC 2, “beats Claude/GPT”, invented customers, checkout, paid APIs, or cold-outreach copy.

Inquiry form: `localStorage` key `holdroom_inquiries` + `mailto:daniel.keene223@gmail.com`. Fields stay as on `/inquire/` (name, firm, role, email, phone, headcount, concurrent, secret, message).

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
