# Fieldio PWA

Fieldio's web app (`apps/web`) is an installable, offline-first PWA built on the
existing hand-written service worker + React Query persistence + idb-keyval
offline mutation queue. This document covers what ships, the Lighthouse PWA
checklist status, and how to later wrap the app as a native shell (Capacitor or
Bubblewrap/TWA).

## What ships

### Manifest — `public/manifest.json`

- `name` "Fieldio", `short_name` "Fieldio", `id`/`start_url`/`scope` "/"
- `display: standalone` (+ `display_override`), `orientation: portrait`
- `theme_color` / `background_color` `#0f172a` (matches the app's `--primary`
  navy in `globals.css`)
- `categories`, `description`, `lang`, `dir`
- Icon set: 192, 512, maskable 192/512 (see icons below)

Referenced from the root layout via Next's metadata API (`metadata.manifest`).

### Icons — `public/icons/`

Generated programmatically by `scripts/generate-pwa-icons.mjs` (uses `sharp`
from the monorepo root). Outputs:

| File | Size | Purpose |
| --- | --- | --- |
| `icon-192.png` | 192 | any |
| `icon-512.png` | 512 | any |
| `icon-maskable-192.png` | 192 | maskable (14% safe zone, full-bleed) |
| `icon-maskable-512.png` | 512 | maskable |
| `apple-touch-icon.png` | 180 | iOS home screen |
| `favicon-32.png` | 32 | browser tab |

> **⚠ Placeholder branding.** The mark (an "F" + droplet on a blue→indigo
> gradient) is a generated placeholder that mirrors the in-app brand tile. It is
> **not** an official logo. Replace with a real brand asset before store
> submission — either drop new PNGs into `public/icons/` or edit the SVG in the
> generator and re-run `node scripts/generate-pwa-icons.mjs`.

### Meta / viewport — `src/app/layout.tsx`

- `theme-color` `#0f172a`
- `apple-mobile-web-app-capable` + status bar style `black-translucent` (via
  `appleWebApp`)
- apple-touch-icon + favicon links (via `metadata.icons`)
- `viewport-fit=cover` for notch/safe-area rendering
- Safe-area insets handled in `globals.css` (body padding + `.pb-safe` util) so
  content clears the notch and home indicator when standalone.

### Service worker — `public/sw.js` (`fieldio-v3`)

Extends the existing hand-written SW (no workbox/next-pwa). Strategies retained:

- **Navigations:** network-first → cached page → cached shell (`/`) →
  `/offline.html`. A cold, signal-less launch now shows the Fieldio offline
  frame instead of a browser error.
- **Same-origin static assets:** stale-while-revalidate.
- **Non-GET / cross-origin:** passthrough — the RQ persister and idb-keyval
  offline queue still own read caching and mutation replay.

Precache (app shell): `/`, `/offline.html`, `/manifest.json`, and all icons.

**Update flow:** the SW no longer auto-`skipWaiting()`. A new worker parks in
`waiting`; `PwaLifecycle` detects it and shows an "Update available — Reload"
toast. Accepting posts `{ type: 'SKIP_WAITING' }`; the SW activates,
`clientsClaim()`s, and the `controllerchange` listener reloads once.

### Install experience — `src/components/offline/install-prompt.tsx`

- Chromium (Android/desktop): captures `beforeinstallprompt`, shows a
  dismissible "Install" banner, triggers the native dialog on tap.
- iOS Safari: shows an "Add to Home Screen" hint (no `beforeinstallprompt`).
- Dismissal remembered in `localStorage` (`fieldio-install-dismissed`).
- Hidden when already running standalone.
- Mounted once from `dashboard-layout.tsx`.

### Lifecycle — `src/components/offline/pwa-lifecycle.tsx`

Registers `/sw.js` (production only), drives the update toast, reloads on
`controllerchange`. Replaces the old inline registration `<Script>`.

## Lighthouse PWA checklist

| Check | Status |
| --- | --- |
| Registers a service worker | ✅ `PwaLifecycle` (production) |
| Web app manifest meets installability | ✅ name, icons (192+512), start_url, display, scope |
| Manifest has maskable icon | ✅ maskable 192 + 512 |
| Themed address bar (`theme_color`) | ✅ `#0f172a` |
| `viewport` meta + `viewport-fit=cover` | ✅ |
| apple-touch-icon | ✅ `/icons/apple-touch-icon.png` |
| Offline start (200 when offline) | ✅ SW nav fallback → cached `/` / `offline.html` |
| Content sized correctly / no horizontal scroll | ✅ (existing responsive layout) |
| HTTPS | ⚠ deployment concern (localhost is treated as secure) |
| Real (non-placeholder) icons | ⚠ **manual** — see placeholder note above |

Run locally: `npm run build && npm run start` in `apps/web`, then Lighthouse
(the SW only registers in a production build).

## Wrapping later

### Android TWA (Bubblewrap)

1. Deploy the PWA to HTTPS.
2. `npm i -g @bubblewrap/cli && bubblewrap init --manifest https://<host>/manifest.json`
3. Add Digital Asset Links so the URL bar is hidden:
   - Get the signing-key SHA-256 fingerprint from Bubblewrap.
   - **TODO:** serve `/.well-known/assetlinks.json` from `apps/web/public/.well-known/assetlinks.json`:
     ```json
     [{
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.fieldio.app",
         "sha256_cert_fingerprints": ["<SHA256 from Bubblewrap>"]
       }
     }]
     ```
4. `bubblewrap build` → signed AAB for Play.

### Capacitor (iOS + Android)

1. `npm i @capacitor/core @capacitor/cli && npx cap init Fieldio com.fieldio.app`
2. Point `server.url` (or bundle the exported build) at the deployed PWA.
3. `npx cap add ios && npx cap add android`, then open in Xcode / Android Studio.
4. The SW + offline queue keep working inside the WebView; native plugins
   (camera, geolocation, push) can be layered on incrementally.

### Remaining manual steps

- Replace placeholder icons with real Fieldio branding.
- Provide `assetlinks.json` with the real signing fingerprint (TWA).
- Optional: add `screenshots` + `shortcuts` to the manifest for richer install
  UI and app shortcuts.
- Serve over HTTPS in production for installability.
