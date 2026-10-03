# Hatch

In-house AI. Secure data that stays with you. Customized to the firm’s needs and knowledge base. Encrypted cluster + Hatch OS so employees work without feeding frontier labs (OpenAI / Anthropic / Bedrock).

- Public site: https://hatchsystems.ai
- Vercel project name stays `holdroom` (do not rename)
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

Static multi-page HTML. No build step. No paid API in this repo. The inquiry form posts to a Google Apps Script web app.

| Path | Page |
| --- | --- |
| `/` | Home — hero (secure in-house AI on your knowledge), no pricing, CTA |
| `/product/` | Secure in-house AI on your knowledge, stack, packs, remote |
| `/how-it-works/` | Unbox → plug in → ask; status; remote; backup |
| `/pricing/` | Firm / Enterprise / Corporation only |
| `/security/` | What we will / will not claim (incl. remote) |
| `/for/` | Firms that will not leak the file — law, PE/deal, operators as beachheads |
| `/faq/` | Straight answers |
| `/inquire/` | Inquiry form. Posts to Apps Script, which writes a Sheet and sends Gmail |
| `/app/` | Internal Phase 1 UI wireframe (clickable HTML/CSS/JS, fake Fund A / Fund B data, not live) |

Shared sticky nav, footer, mobile menu, subtle scroll reveal.

`/app/` is a Hatch OS product wireframe (hash routes, PWA manifest). It is not a production box, not Open WebUI, and not indexed as a marketing page.

Copy prefers ownership / room language (“stays with you”, “in the room”, “not to the labs”). Tagline: secure in-house AI on your knowledge. Do not use: Holdroom (live brand), Stillroom, Airlock, Strongroom, inCamera, or Palantir.

## Claims locks

Do not add: HIPAA, SOC 2, “beats Claude/GPT”, invented customers, checkout, paid APIs, or cold-outreach copy.

Inquiry form posts to the web app in `integrations/inquiry-apps-script/`. The script appends a row to a Google Sheet tab named `Inquiries` and emails Daniel plus a confirmation to the inquirer via Gmail (`MailApp`). It rejects a filled honeypot, submissions faster than 3 seconds, over-long fields, a bad email, and bursts over 5 per email or 20 overall in 10 minutes. If the Sheet write fails, the notification email still goes out.

`assets/js/inquire.js` reads one constant, `INQUIRY_ENDPOINT`. Until that replaces `REPLACE_WITH_APPS_SCRIPT_URL`, Send inquiry opens a `mailto:daniel.keene223@gmail.com` draft and does not call the network. The form does not use `localStorage`.

Required: name, work email, company, role, firm size, what you want to use private AI for, timeline. Optional: phone, how you heard about Hatch, tier interest, message. Hidden: honeypot and the form-load time.

Inquiry details go to Hatch's Google Workspace (Sheet and Gmail) only and are never sent to AI model providers. Resend can replace `MailApp` later without changing the page, other than the endpoint URL if it moves.

## Local

```bash
python3 -m http.server 4173
```

Open http://127.0.0.1:4173/

## Deploy

The Vercel project `holdroom` is linked to this repo with **no framework** (`framework: null`). Push to `main` updates the deployment served at https://hatchsystems.ai. Keep the site static — do not add a build unless you also set a Vercel build command. Do not rename the repo or the Vercel project.

`vercel.json` uses clean URLs and trailing slashes so `/product` and `/product/` both resolve.

## Design tokens

- Cream `#f5f2ed`
- Nav `#111111`
- Violet `#7c6aef`
- Inter
- Pill buttons
