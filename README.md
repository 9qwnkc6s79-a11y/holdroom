# Holdroom

AI that stays in the building. A ready local AI appliance you own. Work stays on your network. Your files stay yours — they do not go to the frontier labs or data companies.

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

## What they get

White-label mini workstation, imaged before ship; encrypted disk; local open-weight models (chat + fast); LAN app (chat, upload, watched folder / document retrieval); owner login then seat invites; default-deny outbound; optional signed updates they can disable; status / connections page; backup is the encrypted disk they own. Same software on S/M/L, sized by busy-hour concurrent use.

## Site

Static multi-page HTML. No build step. No paid APIs.

| Path | Page |
| --- | --- |
| `/` | Home — offer above the fold |
| `/product/` | What you get, documents, S/M/L |
| `/how-it-works/` | Unbox → plug in → ask; network; status; backup |
| `/pricing/` | Hardware, software, setup, honest compare |
| `/security/` | Data stays with you; what we will / will not say |
| `/for/` | Law, PE/deal, operators |
| `/faq/` | Straight answers |
| `/inquire/` | Locked form |

Shared sticky nav, footer, mobile menu, subtle scroll reveal.

Copy prefers ownership / room language (“stays with you”, “in the room”, “not to the labs”). The product may still be called an appliance or unit. Tagline: “AI that stays in the building.”

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
