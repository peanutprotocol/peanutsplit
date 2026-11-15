# Native apps: handoff to the first store submission

This file lists every step between the `native-apps` branch and a submitted app that needs a person: an
account, a secret, a production change, a device or a decision. The code is complete up to each step.
CI is green without any of them. How the apps work: [`current/NATIVE.md`](current/NATIVE.md).

- Repository: `peanutprotocol/peanutsplit`. Branch: `native-apps`. Draft PR: #37 (`native-apps` →
  `main`, do not merge before step 9).
- Server-prep draft PR: branch `native-server-prep` → `main`, whose title starts with "Native apps: server
  prep (CORS, push transport)". It holds only the server parts that must be live before a store build is useful.
- `main` gets exactly two merges before submission: the server-prep PR (step 1), then `native-apps`
  (step 9).
- **UNVERIFIED** marks a fact that nobody could check from the repository, such as what exists in a
  store console or a secret manager. Check it before you rely on it.
- Run repository commands from the repository root unless a step names another folder.

Hands-on total: about 5.5 hours. Hugo does about 4 hours; Konrad or Hugo does the rest.

## 1. Hugo only (account holder, admin, production)

### Step 1. Merge the server-prep PR (30 min)

1. Review the `native-server-prep` draft PR with Konrad. Konrad reviews the privacy page change
   (`apps/web/src/app/(product-shell)/privacy/page.tsx`): it is a legal text. Konrad also decides whether
   the page names Google Gemini and OpenRouter for receipt scans, as the app's consent sheet does. Set
   the page's effective date at merge.
2. Confirm the AASA app ID `PW388G893L.com.peanutsplit.app` in
   `apps/web/public/.well-known/apple-app-site-association` against decision 1. If the team differs,
   edit that one line in the PR first. Apple's CDN caches this file, so it must be right on the first
   deploy.
3. Mark the PR ready, merge it to `main`, and wait for the deploy.
4. Check the CORS answer. Expect `204` and `Access-Control-Allow-Origin: capacitor://localhost`:
   ```bash
   curl -si -X OPTIONS -H 'Origin: capacitor://localhost' \
     -H 'Access-Control-Request-Method: GET' https://peanutsplit.com/api/currencies
   ```
5. Check the association file. Expect `200`, `content-type: application/json`, and no redirect:
   ```bash
   curl -si https://peanutsplit.com/.well-known/apple-app-site-association | head -n 5
   ```
6. Rerun the latest `native.yml` run on `native-apps`. Its Android smoke must now print `SPLIT_CORS ok`:
   ```bash
   gh run list --repo peanutprotocol/peanutsplit --workflow native.yml --branch native-apps --limit 1
   gh run rerun <run id> --repo peanutprotocol/peanutsplit
   ```

### Step 2. Change the identifiers, only if decision 1 changed them (10 min)

Do this step only if the Apple team or the bundle ID is not the default.

1. On `native-apps`, run:
   ```bash
   node apps/web/scripts/native/set-identifiers.mjs --app-id <bundle id> --team <TEAMID> --dry-run
   node apps/web/scripts/native/set-identifiers.mjs --app-id <bundle id> --team <TEAMID>
   ```
2. Commit the changed files and push `native-apps`. The bundle ID can never change after the first
   release.

### Step 3. Apple (30 min)

**Reuse** these from the team secret manager. Check that each one exists first (UNVERIFIED):

1. The Apple Distribution certificate (`.p12`) and its password.
2. The App Store Connect API key: key ID, issuer ID and the `.p8` content.
3. The team APNs auth key (`.p8`) and its key ID. Create a new key only if the team has fewer than 2
   APNs keys. Never revoke the key that OneSignal uses for peanut.me.

**Create** these:

1. An App ID `com.peanutsplit.app` with the Push Notifications and Associated Domains capabilities.
2. The App Store Connect app record (name "Peanut Split", primary language English (U.S.)).
3. An App Store provisioning profile named exactly `Peanut Split App Store`, for that App ID, with both
   capabilities. The Xcode project expects this name.

Then:

1. In App Store Connect, turn off availability on Apple Silicon Macs.
2. Confirm the Digital Services Act trader status for the account.

### Step 4. Google (40 min)

**Reuse** (UNVERIFIED that each exists):

1. Give the existing Play upload service account release access to the new app.
2. If a Firebase project for Peanut exists, add the Android app `com.peanutsplit.app` to it.

**Create**:

1. The Play app record on the Squirrel Labs organisation account.
2. An upload keystore. Record the keystore password, the key alias and the key password.
3. `google-services.json` for `com.peanutsplit.app` (Firebase console).
4. An FCM v1 service account key, if none can be reused.

### Step 5. GitHub repository secrets (15 min, repository admin)

Add these in GitHub → Settings → Secrets and variables → Actions. `.github/workflows/native-release.yml`
reads them. Each platform job checks only its own secrets, so each platform can ship as soon as its own
list is complete.

| Platform | Secret                            | Value                                                    |
| -------- | --------------------------------- | -------------------------------------------------------- |
| iOS      | `APPLE_TEAM_ID`                   | The Team ID from decision 1                              |
| iOS      | `IOS_DIST_CERT_P12_BASE64`        | `base64` of the distribution `.p12`                      |
| iOS      | `IOS_DIST_CERT_PASSWORD`          | Its password                                             |
| iOS      | `IOS_PROVISIONING_PROFILE_BASE64` | `base64` of the `Peanut Split App Store` profile         |
| iOS      | `ASC_KEY_ID`                      | App Store Connect API key ID                             |
| iOS      | `ASC_ISSUER_ID`                   | App Store Connect issuer ID                              |
| iOS      | `ASC_KEY_CONTENT`                 | The API key `.p8` content                                |
| Android  | `ANDROID_KEYSTORE_BASE64`         | `base64` of the upload keystore                          |
| Android  | `ANDROID_KEYSTORE_PASSWORD`       | Keystore password                                        |
| Android  | `ANDROID_KEY_ALIAS`               | Key alias                                                |
| Android  | `ANDROID_KEY_PASSWORD`            | Key password                                             |
| Android  | `PLAY_SERVICE_ACCOUNT_JSON`       | The Play upload service account JSON                     |
| Android  | `GOOGLE_SERVICES_JSON_BASE64`     | `base64` of `google-services.json` (push is compiled in) |

The PostHog and Sentry client values are public (they ship in the web bundle) and are committed as
defaults. Repository variables with the same names override them; you do not need to set them.

### Step 6. Production push credentials and egress (30 min)

1. Set these runtime variables on the production app `split-org-web` (Dokploy):
   `SPLIT_APNS_KEY_P8`, `SPLIT_APNS_KEY_ID`, `SPLIT_APNS_TEAM_ID`, `SPLIT_APNS_BUNDLE_ID`,
   `SPLIT_FCM_SERVICE_ACCOUNT_JSON`. Treat them like the VAPID keys: never rotate them in place.
2. Check that `SPLIT_PUSH_PROXY_URL` is set there. Web push already uses it (UNVERIFIED for production).
3. On the Squid proxy `split-egress`, allow `CONNECT` on port 443 to `api.push.apple.com`,
   `api.sandbox.push.apple.com`, `oauth2.googleapis.com` and `fcm.googleapis.com`.
4. Redeploy. Until this step is done, the server answers `503 NATIVE_PUSH_UNAVAILABLE` and the apps hide
   the notification row. No store release is needed to turn it on.

### Step 7. Testers (10 min)

1. Add Konrad and Hugo to a TestFlight internal testing group.
2. Add Konrad and Hugo to the Play internal testing list.

### Step 8. First release builds (20 min, plus about 40 min of CI)

The release lane has never run: the overnight build skipped the dry-run tag. Expect this first run to
show any remaining problem in `.github/workflows/native-release.yml`.

1. Tag the head of `native-apps` and push the tag:
   ```bash
   git fetch origin native-apps
   git tag native-v1.0.0 origin/native-apps
   git push origin native-v1.0.0
   ```
2. Watch the "Native release" run:
   `gh run list --repo peanutprotocol/peanutsplit --workflow native-release.yml --limit 1`. The `ios` job
   uploads the build to TestFlight. A platform job that stops at its first step lists the secrets it is
   missing (names only).
3. **First release only, Android:** the Play API cannot publish to a new app. Download the AAB:
   `gh run download <run id> --repo peanutprotocol/peanutsplit -n android-release-aab`. Upload
   `app-release.aab` in Play Console → Test and release → Testing → Internal testing. Roll it out to
   internal testers.
4. Set the repository variable `PLAY_API_UPLOAD` to `1`. Later tags upload to the internal track by
   themselves.

### Step 9. App Links fingerprints and the `native-apps` merge (45 min)

1. In Play Console → App integrity → App signing, copy the SHA-256 fingerprint of the app signing key
   and of the upload key.
2. On `native-apps`, put both into `apps/web/public/.well-known/assetlinks.json`, in place of the
   placeholder. Commit and push.
3. Merge `origin/main` into `native-apps` (server-prep is already on `main`). If
   `docs/current/generated/*.md` conflicts, run `pnpm docs:generate` and commit the result.
4. Wait until `ci.yml` and `native.yml` pass on `native-apps`.
5. Review draft PR #37, mark it ready, and merge it to `main`. The merge changes the website in exactly
   three intended ways (the parity items): a Privacy link in room settings and on `/app`, the empty-list
   line on `/app`, and the calm offline room error with a way back to "Your rooms". The AI consent before
   a receipt scan is app-only (decision 12). The App Store offer stays off while
   `NEXT_PUBLIC_IOS_APP_STORE_ID` is unset.
6. Check `https://peanutsplit.com/.well-known/assetlinks.json`: `200`, `application/json`, your
   fingerprints.
7. Read the Play pre-launch report. Known risk: Android 7-9 phones with a never-updated System WebView
   may show a white screen (the bundle needs Chrome 111 or later). If the report shows it, raise
   `minSdk`.

### Step 10. Turn on the web store offer (15 min, after the App Store listing is live)

1. Confirm that `join_gate_shown` and `join_gate_completed` events arrive in PostHog. Decision 2's
   guardrail needs two weeks of them before the banner goes live.
2. Set the Dokploy build argument `NEXT_PUBLIC_IOS_APP_STORE_ID` to the numeric App Store ID and
   redeploy. iPhone and iPad browsers then get the Smart App Banner on room pages and "Get the app" on
   `/app`. Android browsers keep the PWA install. There is no Android store ID.

### Step 11. Remove the install handoff (later)

Fourteen days after the App Store ID is live, delete the install-handoff code (follow-up task).

## 2. Konrad or Hugo (App Manager or Release Manager roles are enough)

### K1. Try the debug APK (10 min, right after step 1)

1. Download the `android` artifact of the latest `native.yml` run on `native-apps`:
   `gh run download <run id> --repo peanutprotocol/peanutsplit -n android`.
2. Install the debug APK on any Android phone (`adb install <file>.apk`, or open the file on the phone).
3. Open a room. Add an expense. The debug build calls production, so it works only after step 1.

### K2. Seed the review room (10 min)

This is a production write, so a person runs it.

1. Check the plan first. It sends nothing:
   ```bash
   node apps/web/scripts/native/seed-review-room.mjs --dry-run
   ```
2. Create the room. It prints the room link, the slug and whether receipt scan is on:
   ```bash
   node apps/web/scripts/native/seed-review-room.mjs
   ```
3. Keep the link out of the repository. It goes only into the App Review notes and the Play Console
   "App access" field (K4).
4. Check that receipt scan is on for the reviewers. Expect `{"enabled":true}`:
   ```bash
   curl -s https://peanutsplit.com/api/rooms/<review slug>/receipt-parse
   ```

### K3. Device pass (40 min)

Use the release builds from step 8: TestFlight on an iPhone, the Play internal track on an Android 15
phone and on one Android 13 or 14 phone. Do the device checks in section 3. Record each result.

### K4. Fill both store consoles (90 min)

1. Copy the texts from `apps/web/store/listing.md`, the privacy and data-safety answers from
   `apps/web/store/privacy-answers.md`, and the review notes from `apps/web/store/review-notes.md`.
2. Replace `<REVIEW_ROOM_URL>` with the K2 link only in App Review notes and Play "App access".
3. Enter the App Review contact: name, phone and email.
4. Upload the approved images from `apps/web/store/assets/` (decision 8).
5. Run `node apps/web/store/check-listing.mjs` after any text change.

### K5. Before you submit (15 min)

1. Run the readiness check with the review room slug. Every line must pass:
   ```bash
   node apps/web/scripts/native/check-review-readiness.mjs <review slug>
   ```
   It checks the CORS preflight, the AASA, `assetlinks.json` (no placeholder) and receipt scan.
2. On each release build, turn on notifications for a room and send one test push (add an expense from
   another device). The notification must arrive, and the room's notification row must show.
3. Submit in App Store Connect and in Play Console. Promotion to production and publishing stay manual.

## 3. Device checks

Do these on the release builds (K3). "Fresh app" means a new install. Write down which phone and OS
version you used.

**Links and launch**

1. Tap a room link in Messages and in WhatsApp with the app installed. The app opens on that room. No
   other room shows first, also on a cold start.
2. Do the same without the app. The web room opens, with no wall. iOS Safari shows the Smart App Banner
   with "Get" (only after step 10).
3. In iOS Safari, open a room on peanutsplit.com with the app installed. The banner shows "Open". Tap it.
   The app opens on that room (only after step 10).
4. In a fresh app, open a room that you joined in the browser. The name list shows. Tap your name. Your
   past reactions show as yours.
5. Android with the old PWA also installed: tap a room link. Write down which one opens.
6. Open a room link in the Instagram and Telegram in-app browsers with the app installed. The web room
   works. Write down whether the app opened.
7. iPhone Safari, `/app` (after step 10): **Get the app** opens the store. After the tap, open a room
   again: no store card shows. Android Chrome and desktop Chrome still offer the PWA install.

**Notifications**

8. Turn on notifications for a room in the app. Add an expense from another device. The notification
   arrives.
9. Kill the app. Tap a notification. The app opens on that room, never on the most recent other room, and
   no other room shows first.

**Navigation and offline**

10. Android: open a drawer and press back. The drawer closes. Press back on the home screen. The app
    leaves. Start the app from a link, then press back. The app leaves the room, with no duplicate entry
    of the same room.
11. Airplane mode, then a cold start. The recent room shows the offline line and **Your rooms**. Turn the
    network on. The room loads without a tap.
12. Airplane mode in an open room: add an expense. Turn the network on. The expense syncs once; check it
    from another device.

**Sharing, camera and layout**

13. Create a room in the app and share it to WhatsApp. The link preview card shows.
14. Share a room card image, then choose "Save Image" (iOS). The app asks for photo access once and does
    not crash.
15. iOS: start the first receipt scan in a room. The AI consent sheet shows first. Allow it. There is one
    OS camera prompt, and the camera preview shows inside the app.
16. Status bar and safe areas: on the Android 13 or 14 phone and on the Android 15 phone, the room header
    is not under the clock. On iOS, check the top of a room page and an open bottom sheet near the home
    indicator.

**Things CI could not prove**

17. Live updates: open the same room on a phone (app) and in a desktop browser. An expense added on one
    side shows on the other within seconds without a reload (cross-origin `EventSource` on
    `capacitor://` is UNVERIFIED on a device).
18. Rooms survive: add two rooms, force-quit the app, reopen. Both rooms are in "Your rooms".

## 4. Konrad's decisions

The defaults hold and the build does not wait for them. Each change is small.

1. **Apple team:** `PW388G893L` (default; the team the Peanut app ships on) or `4K73GMPZP8` (Squirrel
   Labs). The bundle ID stays `com.peanutsplit.app` unless someone objects. A change means step 2.
2. **Smart App Banner on a recipient's first Safari visit:** shown (default). Guardrail: compare the
   `join_gate_completed / join_gate_shown` ratio in iOS Safari with all other browsers, two weeks before
   and two weeks after the App Store ID goes live. If iOS Safari drops relative to the others, remove the
   banner first.
3. **Native notification text:** the same names and amounts as web push (default), or one generic body.
   Apple and Google can read native payloads.
4. **Category:** Utilities and Productivity (default), or Finance.
5. **Storefronts:** all, including the UK (default, to confirm). The UK rule covers marketing copy, not
   availability.
6. **The Peanut settle option stays in the app** (default), with the listing posture in the store texts.
7. **Names:** "Peanut Split" in the stores, "Split" on the home screen (default).
8. **Approve the screenshots, the feature graphic and the icon** in `apps/web/store/assets/` (brand-asset
   rule).
9. **v1 without the recap screen and without offline last-known balances** (default).
10. **Licence:** yes or no on store distribution of the AGPL codebase, and whether the app links to
    `/source`. The evidence is in section 5.
11. **Listing languages:** English only in v1 (default). es-419 and pt-br listings later.
12. **The one-time AI consent before the first receipt scan:** in the app only (default since
    2026-11-14), or on the web too. Apple requires it for the app. Nothing requires it on the web, where
    it would add one tap, once per browser, to the first scan.

## 5. Licence evidence for decision 10

This is the evidence from the repository on 2026-11-15 (`native-apps` at `3971dea`), not legal advice.
The question: the codebase is `AGPL-3.0-or-later`, and the App Store's terms add restrictions that the
AGPL does not allow a licensee to add. That conflict matters only for code whose copyright belongs to
someone other than the distributor.

**Authors.** `git shortlog -sn HEAD` (aliases collapsed by `.mailmap`):

| Commits | Author                         | Kind                         |
| ------: | ------------------------------ | ---------------------------- |
|     691 | Konrad Urban                   | person, Squirrel Labs Ltd    |
|     187 | Hugo Montenegro                | person, Squirrel Labs Ltd    |
|       8 | `chip-peanut-bot[bot]`         | company bot                  |
|       4 | `peanutsplit-steward`          | company bot (box supervisor) |
|       1 | `split-content-publisher[bot]` | company bot                  |

The 11 `Co-authored-by` trailers in the history name only AI tools and the same company bots. No
outside person authored a commit.

**Rights register.** `docs/current/RIGHTS-REGISTER.md` records the code as Squirrel Labs-owned:

- "Granting entity: Squirrel Labs Ltd. Ruled by the project owner on 2026-08-24 and confirmed on
  2026-09-01 ... the work in this repository was authored for Squirrel Labs Ltd, which holds the rights
  and grants the licenses below."
- Register row "Application code, migrations, tests, config": `AGPL-3.0-or-later`, Resolved.
- Register row "Code extracted from `peanut-ui` / `peanut-api-ts`": "Same owner under the Squirrel Labs
  Ltd ruling; AGPL", Resolved.
- Register row "Dependencies and container packages": "Own licenses; per-build SBOM before shipping an
  artifact", **Open**. The store binary is such an artifact.

**Weak-copyleft entries in `THIRD_PARTY_LICENSES.md`**, and whether each ships in the binary. The
binary holds the static export (about 6 MB), Capacitor and its plugins. A search of the export built on
2026-11-15 found none of these packages:

| Package                              | Licence                 | In the binary? | Why                                                                                                          |
| ------------------------------------ | ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `@img/sharp-libvips-linux-x64@1.3.4` | `LGPL-3.0-or-later`     | No             | Server-side image library behind `sharp` (share cards, OG images)                                            |
| `next-mdx-remote@6.0.0`              | `MPL-2.0`               | No             | Renders guides and blog pages on the server; no native page uses it                                          |
| `web-push@3.6.7`                     | `MPL-2.0`               | No             | Server-side web push sender                                                                                  |
| `dompurify@3.4.16`                   | `MPL-2.0 OR Apache-2.0` | No             | Used only by posthog-js's product-tours extension, which the app never loads; Apache-2.0 is available anyway |

**Not covered by `THIRD_PARTY_LICENSES.md`:** the native layers. Capacitor and its plugins are MIT; the
Android build adds AndroidX and Firebase Cloud Messaging libraries (Apache-2.0); the iOS build adds no
third-party SDK. The fonts in the export (Sniglet, Roboto Flex) are OFL, which allows bundling with
software. These licences are from the packages' own metadata, not from a generated inventory
(UNVERIFIED as a full list).

**What the evidence supports.** Every authored line is Squirrel Labs-owned, and no third-party copyleft
code ships in the binary. So the store terms conflict only with terms Squirrel Labs grants to others,
not with terms it is bound by. That supports **yes**. For `/source`: the app has no link to it in v1.
Adding one is optional goodwill, not a requirement that this evidence shows. Konrad decides both.
