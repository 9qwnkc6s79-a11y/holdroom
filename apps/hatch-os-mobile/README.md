# Hatch OS for iPhone

Presence v4, the dark iPhone app for Hatch OS. It is an Expo SDK 55 project and it talks to the Hatch OS host that already serves the web app. The Next.js app in `apps/hatch-os` is unchanged. This package is not a workspace of the repo root, so the static site and the `hatch-os` Vercel project do not build it.

## Run

```bash
cd apps/hatch-os-mobile
npm install
npx expo start
```

Press `i` for the iOS simulator. `npx expo start --web` runs the same UI in a browser. The browser build needs CanvasKit for the live sphere:

```bash
mkdir -p public
cp node_modules/canvaskit-wasm/bin/full/canvaskit.wasm public/canvaskit.wasm
```

Without that file, the sphere uses the still frame from the design. The iPhone build uses Skia directly and does not need the file. A browser on another origin is also subject to CORS. The installed app is not: it calls the host the way any native client does.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_HATCH_API_BASE` | `https://hatch-os-beta.vercel.app` | Firm host. Same routes the web app uses. |
| `EXPO_PUBLIC_HATCH_DEMO` | unset | `1` shows the on-device seed in `src/demo/seed.ts` instead of the host. Production EAS profiles do not set it. |

Copy `.env.example` to `.env` to override it. EAS profiles in `eas.json` set the same default.

## Sign-in

The phone stores the invite session on the device (SecureStore on iOS, local storage on web) and sends the same JSON the web app sends. `/api/auth/pair`, `/api/chat`, `/api/chat/step`, `/api/extract`, `/api/ingest`, `/api/transcribe`, `/api/agents`, `/api/threads`, `/api/files`, `/api/approvals`, and `/api/status` do not use a cookie. The only cookie in the host is the browser OAuth handoff for connected apps, which this version does not open.

Invite codes are whatever your firm’s host already accepts, including codes longer than the `XXXX-XXXX` placeholder.

Image attachments use `/api/extract` and `/api/ingest`, the same path as the web app. That extract route does not OCR images. It returns a note, and the file is still saved on the host by filename.

Voice uses on-device speech recognition on iPhone. If that returns no words, the clip is posted to `/api/transcribe`. The host currently answers that route with a stub and does not transcribe audio.

## TestFlight

Do not commit a real App Store Connect id. `eas.json` → `submit.production.ios.ascAppId` is `REPLACE_WITH_APP_STORE_CONNECT_APP_ID`. Replace it after the app record exists. The first `eas build` also links an EAS project id for the `djkeene` account. This repo does not invent one.

```bash
cd apps/hatch-os-mobile
npx eas login
npx eas build --platform ios --profile production
npx eas submit --platform ios --profile production
```

`preview` is an internal install. `development` is a dev client. `appVersionSource` is `local`. The iOS build number is `1` and the bundle id is `ai.hatchsystems.os`.

`ITSAppUsesNonExemptEncryption` is false. The app uses HTTPS only.

## Checks

```bash
npm test
npm run typecheck
npm run lint
```
