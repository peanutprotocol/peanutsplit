# Native apps (iOS and Android)

The App Store and Google Play apps are the web app's product surface, bundled into a native shell. This
document describes how they are built, the rules that keep the web build unchanged, and how to run each
check. What a person must still do before the first submission is in
[`docs/NATIVE-HANDOFF.md`](../NATIVE-HANDOFF.md).

## The shape in one screen

| Topic        | Decision                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shell        | Capacitor 8.2.0. A static export of the app surface ships inside the binary. No `server.url`, no over-the-air updates.                                                                                                         |
| Build target | One extra branch in `apps/web/next.config.js` on `SPLIT_NATIVE_BUILD=1`. No second config file. The web build stays the same standalone build.                                                                                 |
| Seam         | `IS_NATIVE_APP` in `apps/web/src/lib/platform.ts`, a compile-time constant. Every `@capacitor/*` import lives in `apps/web/src/lib/native/capacitor/`.                                                                         |
| Routes       | `/`, `/app/`, `/new/`, `/room/?slug=`, `/room/import/?slug=`, `/import/`, from `apps/web/src/app/(native)/`.                                                                                                                   |
| API          | `https://peanutsplit.com`, called cross-origin. The server answers CORS for exactly `capacitor://localhost` and `https://localhost`, without credentials.                                                                      |
| Links        | `https://peanutsplit.com/r/<slug>` is the only link anyone shares. Universal links (iOS) and App Links (Android) open it in the app when the app is installed.                                                                 |
| Storage      | localStorage stays the source of truth. Room keys are mirrored into `@capacitor/preferences`. The WebView origin is pinned forever.                                                                                            |
| Push         | APNs on iOS, FCM on Android, through the existing per-room subscription table. Payloads never carry the slug.                                                                                                                  |
| Updates      | A version gate reads `apps/web/public/app-config.json` and fails open. API routes stay backward compatible with every shipped build.                                                                                           |
| Not in v1    | The recap page, offline last-known balances, share-in (share extension), foreground banners, a Terms link, iPad layouts, Mac availability, a custom URL scheme, any room or identity transfer between the browser and the app. |

Store texts, privacy answers and review notes live in `apps/web/store/`. The decisions here were taken in
the planning notes for the native-apps branch (2026-11-14). Those notes are not in the repository, so
this file restates every decision it relies on.

## How the build works

### One branch in `next.config.js`

`apps/web/next.config.js` checks `SPLIT_NATIVE_BUILD === '1'` first. That branch sets:

- `output: 'export'` and `distDir: '.next-native'`;
- `trailingSlash: true`, so each route is a folder with an `index.html`;
- `pageExtensions: ['native.tsx', 'native.ts']`;
- `typescript.tsconfigPath: 'tsconfig.native.json'`, which excludes tests, `e2e*` and the native projects;
- `env: { NEXT_PUBLIC_NATIVE_BUILD: '1' }`.

`pageExtensions` is what keeps the two builds apart. The native build sees only `*.native.tsx` pages, so
no web `page.tsx`, `layout.tsx`, `route.ts`, metadata file or `src/proxy.ts` reaches the binary. The web
build ignores `*.native.tsx`. The web branch defines `NEXT_PUBLIC_NATIVE_BUILD: '0'`. Next inlines a
`NEXT_PUBLIC_*` value only when it is defined at build time, and the seam below needs a literal in both
builds.

The native branch does not set `NEXT_PUBLIC_BASE_URL`. A value in the config `env` block would override
the process environment and send the cross-origin test harness to production.

### `native:build` and `native:sync`

Run both from `apps/web`:

```bash
pnpm native:build   # static export into apps/web/.next-native, then postbuild checks
pnpm native:sync    # native:build, then `cap sync` into apps/web/ios and apps/web/android
```

`native:build` defaults three values when the environment does not set them:

| Variable                       | Default                   | Why                                                                         |
| ------------------------------ | ------------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_BASE_URL`         | `https://peanutsplit.com` | The API origin must be a literal in the chunks. Tests set the local server. |
| `NEXT_PUBLIC_SPLIT_V2_ENABLED` | `1`                       | Same product flags as the production Dockerfile, so receipt scan ships.     |
| `NEXT_PUBLIC_FOSS_RELEASED`    | `1`                       | Same as the Dockerfile.                                                     |

Next always builds an export inside `.next` and only copies it to `.next-native`.
`apps/web/scripts/native/postbuild.mjs` then clears `.next` except `cache`, so a later `next start`
fails loudly instead of serving the app build as the website. **Run `native:build` first and
`pnpm build` last** when one job needs both.

`postbuild.mjs` prunes what the app never loads (press kit, PWA splash images, `sw.js`, `.well-known/`,
`app-config.json`, the 404 pages Next always writes), then fails the build when:

- the HTML files differ from the exact route set (a web page leaked into the binary);
- `cache/`, `server/`, `sw.js` or `manifest.webmanifest` exist;
- a file contains `/split-static/`, `serviceWorker.register` or an ad-tag host;
- the inlined `NEXT_PUBLIC_BASE_URL` is missing from the chunks;
- `NEXT_PUBLIC_SENTRY_DSN` is set and the DSN is missing from the chunks;
- the export is larger than 15 MB (it is about 6 MB).

`cap sync` copies the export into the native projects (`webDir` is `.next-native`; there is no `www/`
copy step). `native:sync` puts `NODE_ENV=production` in front of `cap sync`. That value reaches only
`apps/web/capacitor.config.ts`, which runs in Node, and turns Android WebView debugging off. The debug
job in CI leaves it out, so the emulator smoke can read the WebView console.

### `NODE_ENV` is always `'production'` in the bundle

`next build` inlines `process.env.NODE_ENV` as `'production'` in every export, debug or not. Never gate
behaviour inside the bundle on it. Use a named `NEXT_PUBLIC_*` flag, read as a literal property access so
Next inlines it. Example: the boot CORS self-test runs only when
`process.env.NEXT_PUBLIC_SPLIT_CORS_SELFTEST === '1'`, which only the CI export job sets.

### Build-time variables

| Variable                          | Set by                                     | Effect                                                                            |
| --------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `SPLIT_NATIVE_BUILD`              | `native:build`                             | Selects the native branch of `next.config.js`.                                    |
| `NEXT_PUBLIC_NATIVE_BUILD`        | `next.config.js` (`'1'` app, `'0'` web)    | Drives `IS_NATIVE_APP` and the Capacitor import guard.                            |
| `NEXT_PUBLIC_NATIVE_PUSH`         | release lane `1`; CI debug builds unset    | Compiles the native push client in.                                               |
| `NEXT_PUBLIC_SPLIT_APNS_ENV`      | release lane `production`                  | iOS subscribes as `apns`; anything else subscribes as `apns-sandbox`.             |
| `NEXT_PUBLIC_SPLIT_CORS_SELFTEST` | `native.yml` export job only               | Logs `SPLIT_CORS ok` or `SPLIT_CORS blocked` on boot.                             |
| `NEXT_PUBLIC_IOS_APP_STORE_ID`    | Dokploy build arg, after the listing lives | Web only: the Smart App Banner and the iPhone and iPad store offer. Off if unset. |

## The platform seam

`apps/web/src/lib/platform.ts` holds everything shared code may ask about the platform:

- `IS_NATIVE_APP`: `process.env.NEXT_PUBLIC_NATIVE_BUILD === '1'`. Compile-time, never user-agent
  sniffing.
- `NATIVE_PUSH_ENABLED`: `IS_NATIVE_APP` and `NEXT_PUBLIC_NATIVE_PUSH === '1'`.
- `nativePlatform()`: `'ios'`, `'android'` or `'web'`, read at runtime from the `window.Capacitor` global
  that the native bridge injects. No import.
- `apiUrl(path)`: the path unchanged on web; `siteUrl + path` in the app.
- `roomPath(slug, view?, query?)`: in-app navigation to a room (next section).
- `RECAP_AVAILABLE`: `false` in the app, because the recap page reads the database on the server.

`apps/web/src/lib/native/host.ts` is the one door to Capacitor:

```ts
export function loadHost(): Promise<NativeHost> | null {
  return process.env.NEXT_PUBLIC_NATIVE_BUILD === '1' ? import('./capacitor/index') : null
}
```

**The two rules of the seam:**

1. **No `@capacitor/*` import outside `apps/web/src/lib/native/capacitor/`.** Those wrappers are reached
   only through `loadHost()`. Each wrapper catches a missing bridge or an unimplemented web fallback and
   reports the feature as absent, which is also the safe behaviour on a device.
2. **Shared code imports `apps/web/src/lib/native/` only inside an `IS_NATIVE_APP` branch, or from native
   pages.** A guard that must drop code from the web build uses the inline
   `process.env.NEXT_PUBLIC_NATIVE_BUILD === '1'` comparison, as `loadHost()` does. Webpack folds the
   inlined literal and drops the branch. It does not see through the imported `IS_NATIVE_APP` binding, so
   a guard on the constant still ships the code to every web visitor.

Two gates hold the rules:

- `apps/web/src/native-boundary.test.ts` (Vitest, runs in `ci.yml`) fails on a `@capacitor/` import
  outside the wrappers, on a hand-built `/r/` path outside an exact file allowlist, and when the native
  route list in `apps/web/src/lib/native/links.ts` does not match the `(native)` route tree. It prints each
  offending `file:line`.
- `apps/web/scripts/assert-pwa-build-boundary.mjs` runs after every `pnpm build` (local, `ci.yml`, the
  Docker image, `native.yml`). It fails when the web `.next/static` contains `isNativePlatform`,
  `androidBridge`, `@capacitor/`, `Capacitor.` or the native push client's error text. A bare
  `@capacitor` grep finds nothing in a minified bundle.

### Native routes and hard loads

The routes are client components in `apps/web/src/app/(native)/`:

| Path            | Renders                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `/`             | `NativeEntry`, which decides the first screen. The splash is still up.                      |
| `/app/`         | "Your rooms": recent rooms, paste a link, import, the Privacy link. `?manage=1` stays here. |
| `/new/`         | `CreateRoomForm`, no ad tags.                                                               |
| `/room/`        | `RoomScreen` for `?slug=`. A missing or invalid slug goes to `/app/`.                       |
| `/room/import/` | `ExistingRoomImportScreen` for `?slug=`.                                                    |
| `/import/`      | `SplitwiseImport`.                                                                          |

Capacitor serves the **root** `index.html` for every path whose last segment has no dot, even when a
folder such as `room/index.html` exists. That covers cold starts, a reload after a language switch, and
Android recreating a killed WebView. So `layout.native.tsx` runs a script before hydration that saves the
URL in `window.__splitBootPath` and resets the address to `/`. `NativeEntry` then decides, in this order
(the pure function is `decideEntry` in `apps/web/src/lib/native/native-entry.ts`):

1. A boot path other than `/` restores that screen. A boot path that maps to nothing or to an external URL
   goes to `/app/` and never opens a browser.
2. The launch URL goes through `dispatchNativeLink(url, 'launch')`.
3. A notification tap that started the app (`awaitColdPushTap()`, capped at 500 ms) opens its room.
4. Otherwise `/app/`, where `RecentRoomAppEntry` opens the most recent room, as the installed PWA does.

The launch URL and the push tap are read before `/app/`, so a cold start never flashes another room.

`apps/web/scripts/native/serve-export.mjs` copies Capacitor's rule exactly (a dotted last segment is that
file or a 404; every other path is the root `index.html`). Every local and CI cold-start check uses it,
because a plain static server would hide the bugs this rule causes.

### `roomPath` against `productUrl`

- **`roomPath(slug)`** is for navigation inside the running app. On web it returns exactly the old string
  (`/r/<slug>`, `/r/<slug>/import`, plus a query). In the app it returns `/room/?slug=<slug>` or
  `/room/import/?slug=<slug>`, because a static export has no dynamic routes. The parameter is `slug`,
  not `s`, so the Sentry redaction can match it narrowly.
- **`productUrl('/r/<slug>')`** is for every link a person shares or sees: share sheets, copy buttons, QR
  codes, the room link in settings. It is always the canonical `https://peanutsplit.com/r/<slug>`, from
  the web and from the app. Never share a `roomPath` value.

`apps/web/src/lib/native/links.ts` maps any incoming URL back into the app: `nativePathForUrl()` turns a
room link (also `www.` and `split.peanut.me` for pasted links) into a native path, keeps the query keys
the room understands and the fragment, sends other product pages to the system browser, and rejects
other hosts and invalid slugs. `dispatchNativeLink()` handles a link from the launch URL and from
`appUrlOpen` with one 3-second de-duplication window and a sessionStorage replay key, so a cold start
from a link navigates once.

## The pinned origin

`apps/web/capacitor.config.ts` sets `server.iosScheme: 'capacitor'`, `server.androidScheme: 'https'` and
`server.hostname: 'localhost'`. localStorage is keyed by origin, and localStorage holds every person's
room list and member tokens. **Never change these three values after the first release.** A change makes
every room disappear from every installed app. `apps/web/scripts/native/assert-native-config.mjs` fails
when one of them changes, and when `server.url` appears.

The device is the only store of the room list. WKWebView can evict website data, so
`apps/web/src/lib/native/storage-mirror.ts` mirrors the keys `ps:recent`, `ps:member:*`, `ps:pending:*`
and `ps:push-room:*` into `@capacitor/preferences`:

- On launch, before any screen mounts, it copies back each mirrored key that localStorage is missing. It
  never overwrites a key that is present.
- In the app only, it wraps `localStorage.setItem` and `removeItem` once, so every write to those prefixes
  also goes to Preferences. localStorage stays the synchronous source of truth.

The interceptor exists because these keys are written from many places, including rollback paths in
identity and offline-queue code. Explicit mirror calls would have to follow each one. Android keeps
`android:allowBackup="true"`: the OS backup is the only way to recover a room list on a new phone.

## Plugins

Exact pins in `apps/web/package.json`, all at least 14 days old when added:

| Package                                                                         | Version      | Used for                                                       |
| ------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------- |
| `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, dev `@capacitor/cli` | 8.2.0        | The shell (the line peanut-ui runs in production)              |
| `@capacitor/app`                                                                | 8.1.2        | Launch URL, `appUrlOpen`, resume, Android back, build number   |
| `@capacitor/browser`                                                            | 8.0.5        | External links and `window.open` in SFSafariViewController/Tab |
| `@capacitor/preferences`                                                        | 8.0.1        | The storage mirror                                             |
| `@capacitor/share`, `@capacitor/filesystem`                                     | 8.0.3, 8.1.5 | `navigator.share` polyfill and file saves via the share sheet  |
| `@capacitor/splash-screen`, `@capacitor/status-bar`                             | 8.0.2, 8.0.4 | Splash hidden after the first real screen; solid status bar    |
| `@capacitor/push-notifications`                                                 | 8.1.3        | APNs and FCM tokens and taps                                   |

Deliberately absent: keyboard, haptics, camera and app-launcher plugins, `CapacitorHttp` (off: it does not
patch `EventSource`), and Firebase on iOS.

Behaviour the plugins carry:

- **Share and files.** `apps/web/src/lib/native/polyfills.ts` installs `navigator.share` and
  `navigator.canShare` on both platforms. Files are written to the cache directory and shared by URI.
  `saveFile()` in `apps/web/src/lib/save-file.ts` is `<a download>` on web and the share sheet in the app.
- **External links.** `apps/web/src/lib/native/external-links.ts` intercepts link clicks: a room link
  navigates in the app; any other `http(s)` link opens in the system browser sheet. `window.open` does the
  same, which keeps the peanut.me settle link outside the app's WebView.
- **Camera.** The receipt scanner keeps `getUserMedia`. Capacitor already grants the WebView media prompt,
  so only the OS camera prompt appears.
- **Status bar.** `overlaysWebView: false` with the first-paint surface colour. Older Android WebViews
  report no top inset, so an overlaid status bar would cover the header.

## Push transports

Web push stays exactly as it is. The app uses the same per-room subscription table with another
transport.

**Client** (`apps/web/src/lib/use-push.ts`, `apps/web/src/lib/native/use-native-push.ts`):

- `usePush` picks the web or the native hook at build time. The native hook exists only when
  `NEXT_PUBLIC_NATIVE_PUSH=1`; the release lane always sets it.
- Subscribing is a per-room tap, as on web: request permission, register, wait for the token (10 s
  timeout), then `POST /api/rooms/<slug>/push-subscriptions` with
  `{ transport, token, memberId, memberToken }`. `transport` is `fcm` on Android, `apns` or
  `apns-sandbox` on iOS. The app stores `ps:push-room:<analyticsKey>` so a tap can find the room.
- `ios/App/App/AppDelegate.swift` forwards the two token callbacks to the plugin. Without them
  `register()` resolves and no token ever arrives. `cap sync` never overwrites that file;
  `assert-native-config.mjs` checks both notification names.
- A tap on a notification reads `data.room` (an `analyticsKey`) and opens the room stored for it. An
  unknown key opens `/app/`, where `RecentRoomAppEntry` may then open the most recent room (a known minor
  gap). Taps are de-duplicated by `sendId`.

**Server** (`apps/web/src/server/push.ts`, `apps/web/src/server/push-native/`):

- `PushSubscription.transport` is `webpush`, `apns`, `apns-sandbox` or `fcm`. Native tokens are stored in
  `endpoint` as `<transport>:<token>`, so the unique key, the 30-per-room cap, the membership proof and the
  status endpoint carry over. Web bodies still require `p256dh` and `auth`.
- Both senders leave the container through `SPLIT_PUSH_PROXY_URL`, as web push does. APNs uses a
  provider JWT over HTTP/2 through an HTTP CONNECT tunnel (`tunnel.ts`, because Node's `http2` has no
  proxy option). FCM uses HTTP v1 with a service-account token through `egressFetch`.
- Without credentials for a transport, the route answers `503 NATIVE_PUSH_UNAVAILABLE` and the app hides
  the notification row. Setting the credentials turns it on without a store release.
- Dead tokens (APNs `410` or `BadDeviceToken`, FCM `UNREGISTERED` or `404`) delete the row.
- Runtime variables: `SPLIT_APNS_KEY_P8`, `SPLIT_APNS_KEY_ID`, `SPLIT_APNS_TEAM_ID`,
  `SPLIT_APNS_BUNDLE_ID`, `SPLIT_FCM_SERVICE_ACCOUNT_JSON`. Never rotate them in place, as with VAPID.

**Payloads carry `{ room: analyticsKey, sendId }` and never the slug.** Web push payloads are encrypted to
the browser. APNs and FCM payloads are readable by Apple and Google, and the slug is the room's
credential. APNs gets `thread-id` and FCM gets `tag` set to the `analyticsKey`.

iOS uses APNs directly, not FCM. FCM on iOS needs the Firebase iOS SDK, which crashes at launch without
its config file and adds Google SDKs to the privacy manifest. Android applies the Google Services plugin
only when `apps/web/android/app/google-services.json` exists, so CI builds without Firebase.

## Version gate

There are no over-the-air updates, and production's API changes with every push to `main`. **API routes
stay backward compatible with every shipped app build** (see [API.md](API.md#backward-compatibility-with-shipped-app-builds)).
The gate is the escape hatch for a break that cannot be avoided.

- `apps/web/public/app-config.json` holds `minBuild` per platform and the store URLs. It is served with
  `Access-Control-Allow-Origin: *` and a 5-minute cache.
- `apps/web/src/lib/native/version-gate.ts` fetches it on launch and on resume (at most every 10 minutes,
  4 s timeout) and compares it with the app's build number. Below the minimum, `VersionGate` shows
  **Update Split** with a store button and an **Open in browser** link to the room's canonical URL (or
  `/app`). A network error, bad JSON or an unknown platform shows no gate. Offline use is never blocked.
- Build numbers are whole minutes since 2026-01-01T00:00Z, from
  `apps/web/scripts/native/version-code.mjs`, the same number on both platforms.
- Raising `minBuild` is a one-line commit to `main`, made by a person. Fill `store.ios` in the same commit
  the first time; it is a placeholder until then.

## Analytics and privacy in the app

- PostHog registers `surface: 'ios' | 'android' | 'web'`. `app_room_opened { via }` fires in the app,
  always through `roomProps(slug)`, never a slug.
- In the app, PostHog never loads remote code: `disable_external_dependency_loading`, `disable_surveys`,
  `disable_conversations`, `disable_product_tours` and `advanced_disable_flags` are all on. A dashboard
  toggle must not run new code in a reviewed binary.
- Sentry runs in the export through `apps/web/src/instrumentation-client.ts`. `apps/web/src/lib/redact.ts`
  redacts `?slug=` from URLs, breadcrumbs and exception text.
- Ad conversion tags are not in any native page. The app declares "Tracking: No" and shows no tracking
  prompt.
- The one-time AI consent before the first receipt scan is shown **in the app only** (default, open for
  Konrad as HANDOFF decision 12). The web flow is unchanged.

## CI

| Workflow                               | Trigger                                                                     | Jobs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/native.yml`         | push to `native-apps` or `main`, PRs, for `apps/web/**` and the file itself | `export` (native settings check, `native:build` with the CORS self-test, artifact `native-export`); `native-e2e` (test export, web build, association-file check, cross-origin suite on Chromium and WebKit, negative control); `android` (debug APK, unsigned AAB, no `.so`, merged-manifest permissions, artifact `android`); `ios` (simulator build, unsigned archive, built-plist check); `android-smoke` and the iOS launch steps (non-gating); `web-e2e` and `web-e2e-compare`. On `main` only `export` runs. |
| `.github/workflows/native-release.yml` | tag push `native-v<semver>`                                                 | Signed lanes, dormant until secrets exist. One export job, then an iOS job (TestFlight upload) and an Android job (AAB artifact, Play internal track when `PLAY_API_UPLOAD` is `1`). Each platform job checks only its own secrets and lists missing names, never values. Push is always compiled in.                                                                                                                                                                                                               |
| `.github/workflows/ci.yml`             | unchanged                                                                   | Typecheck, docs, format, audits, Vitest (incl. `native-boundary.test.ts`, `link-contract.test.ts`, CORS and proxy tests), web build with the boundary check, Docker build. It runs on the draft PR from `native-apps` to `main`.                                                                                                                                                                                                                                                                                    |

`web-e2e-compare` runs the three existing Playwright suites on the merge base and on the head. It fails
when a test fails on the head and passed on the base or is new, so a failure that already exists on
`main` never blocks the branch. To rerun a `native.yml` run: `gh run rerun <run id>`. Find the id with
`gh run list --workflow native.yml --branch native-apps --limit 3`.

The emulator and simulator smokes print `SPLIT_CORS blocked` until the server change with the CORS answer
is live on production, then `SPLIT_CORS ok`. The iOS smoke reads only native log output, so on iOS the
line is not always captured; the WebKit run of the cross-origin suite covers the CORS preflight.

## Running the checks

Run each command from the folder in the "Where" column. A build and a full Vitest run are heavy; on a
laptop, prefer CI.

| Check                         | Where                            | Command                                                                                                                                                                                                                | In CI                               |
| ----------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Native settings (source)      | repository root                  | `node apps/web/scripts/native/assert-native-config.mjs`                                                                                                                                                                | `native.yml` export                 |
| Native settings (built app)   | repository root                  | `node apps/web/scripts/native/assert-native-config.mjs --app <path to App.app>`                                                                                                                                        | `native.yml` ios                    |
| Static export and postbuild   | `apps/web`                       | `pnpm native:build`                                                                                                                                                                                                    | `native.yml` export                 |
| Web build and boundary        | `apps/web`, after `native:build` | `pnpm build`                                                                                                                                                                                                           | `ci.yml`, `native.yml` native-e2e   |
| Seam, link contract, units    | `apps/web`, test database up     | `pnpm exec vitest run src/native-boundary.test.ts src/lib/native` (Vitest's global setup migrates the test database, see [TESTING.md](TESTING.md))                                                                     | `ci.yml`                            |
| Capacitor's file rule locally | `apps/web`, after `native:build` | `node scripts/native/serve-export.mjs .next-native 8778`                                                                                                                                                               | used by `native.yml` native-e2e     |
| Cross-origin suite (E1-E8)    | `apps/web`                       | build the export with `NEXT_PUBLIC_BASE_URL=http://localhost:3100`, then `pnpm build`, then `pnpm exec playwright test --config playwright.native.config.ts` (needs a migrated Postgres, see [TESTING.md](TESTING.md)) | `native.yml` native-e2e             |
| Association files             | `apps/web`, server running       | `node scripts/native/check-association.mjs http://localhost:3100`                                                                                                                                                      | `native.yml` native-e2e             |
| Store texts                   | repository root                  | `node apps/web/store/check-listing.mjs`                                                                                                                                                                                | none                                |
| Review readiness (production) | repository root                  | `node apps/web/scripts/native/check-review-readiness.mjs <review slug>`                                                                                                                                                | `native-release.yml` (warning only) |
| Android build                 | `apps/web`, JDK 21, Android SDK  | `pnpm native:sync`, then `cd android && ./gradlew :app:assembleDebug :app:bundleRelease`                                                                                                                               | `native.yml` android                |
| iOS build                     | `apps/web`, macOS, Xcode 26+     | `pnpm native:sync`, then `pnpm exec cap open ios`                                                                                                                                                                      | `native.yml` ios                    |

## Changing the native projects

`apps/web/ios/` and `apps/web/android/` are committed. `cap sync` rewrites the copied web files and the
generated config files; the templates' own `.gitignore` files keep those out of git. Put every setting
where `cap sync` keeps it: `apps/web/capacitor.config.ts`, `Info.plist`, the entitlements, `AppDelegate.swift`,
`AndroidManifest.xml` and `build.gradle`.

**To bump a Capacitor plugin:**

1. Check that the new version is at least 14 days old. `.npmrc` refuses a newer one.
2. Change the exact pin in `apps/web/package.json`. Keep `@capacitor/core`, `ios`, `android` and `cli` on
   the same version.
3. Run `pnpm bootstrap` from the repository root, then `pnpm licenses:generate`.
4. From `apps/web`, run `pnpm native:sync`.
5. Commit `apps/web/package.json`, `apps/web/pnpm-lock.yaml`, `THIRD_PARTY_LICENSES.md`,
   `apps/web/ios` and `apps/web/android` together.
6. Replace `Package.resolved` from a macOS run: download the `ios-package-resolved` artifact of the next
   `native.yml` run on the branch and commit it at
   `apps/web/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`. An archive
   can fail on a stale file.
7. Push and wait for `native.yml` to pass.

**To change the bundle ID, the package name or the Apple Team ID:** run
`node apps/web/scripts/native/set-identifiers.mjs --app-id <id> --team <TEAMID>` (add `--dry-run` to see the
files first). It rewrites `capacitor.config.ts`, the Xcode project, `build.gradle`, both association files
and `app-config.json`. Do this only before the first signed build: the bundle ID never changes after
release.

**To change the icon or the splash:** edit the artwork, run `node resources/render-native-assets.mjs` from
`apps/web`, and commit what it writes. It is never run in CI. A new brand asset needs Konrad's approval.

## Related

- [`docs/NATIVE-HANDOFF.md`](../NATIVE-HANDOFF.md): the steps that need an account, a secret or a device.
- [API.md](API.md#cross-origin-callers): the cross-origin callers and the compatibility rule.
- [SECURITY-MODEL.md](SECURITY-MODEL.md#store-apps): why the CORS allowlist grants nothing new, and why
  push payloads carry no slug.
- [`docs/NATIVE-MIGRATION.md`](../NATIVE-MIGRATION.md): the earlier contingency plan, now executed.
