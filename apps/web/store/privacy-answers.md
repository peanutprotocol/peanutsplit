# Privacy and declaration answers: Peanut Split v1

The answers for App Store Connect (App Privacy, age rating, export compliance) and Play Console (App
content). Each answer has a one-line source. "research" means
`local/split-native-app/research/store-requirements.md` in the planning folder; file paths are under
`apps/web/`.

These answers describe the app build. The website at peanutsplit.com also loads Google Ads and X Ads
conversion tags; no app page renders them, and the native postbuild check fails if their hosts
appear in the export. That is why every tracking answer below is No.

Over-declaring never causes a rejection, but under-declaring can (research 1.6). Where a call was
close, the answer declares the data.

## Recipients

Every recipient below is named on `https://peanutsplit.com/privacy`
(`src/app/(product-shell)/privacy/page.tsx`). The bold name is the wording the page uses. Add a
recipient to the page in the same push as you add it here.

- **Apple Push Notification service**: delivers notifications on iPhone. It can read the
  notification title and text, which include names and amounts. Source: ARCHITECTURE 10.2,
  `src/server/push-native/apns.ts`.
- **Firebase Cloud Messaging**: delivers notifications on Android, operated by Google. It can read
  the notification title and text, which include names and amounts. Source: ARCHITECTURE 10.2,
  `src/server/push-native/fcm.ts`.
- **language-model provider**: reads a receipt photo, only after the person allows it in the app.
  Today that is Google Gemini, reached through OpenRouter (`src/server/model.ts`), which is what the
  in-app consent names. Source: research 1.4 (Apple 5.1.2(i)), PLAN 4.2 `room.scan.consent.body`.
- **PostHog**: product analytics, with no room link, name or amount on any event. Source:
  `src/lib/analytics.ts`, ARCHITECTURE 12.1.
- **Sentry**: error reports, with room links removed before sending. Source:
  `src/instrumentation-client.ts`, `src/lib/redact.ts`.
- **hosting provider**: ordinary request logs, including IP addresses. Source: privacy page,
  "Who else is involved".

Not in the app: Google Ads and X Ads (website only, ARCHITECTURE 12.4).

## Apple: App Privacy labels (App Store Connect → App Privacy)

Data collection: **Yes**. Tracking: **No**. Data used to track you: **none**.

| Data type                                                                                                           | Collected | Purposes                     | Linked to the person | Used for tracking | Source                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------- | -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| Contact Info → Name (display name picked in a room)                                                                 | Yes       | App Functionality            | Yes                  | No                | research 2.3 (Play maps it as Name); declared on Apple too for one consistent answer                   |
| User Content → Photos or Videos (receipt photo, sent once, not stored)                                              | Yes       | App Functionality            | No                   | No                | research 1.6; privacy page "Photographs of receipts"                                                   |
| User Content → Customer Support ("Report a problem": message, optional screenshot, device details)                  | Yes       | App Functionality            | No                   | No                | `src/lib/feedback-contract.ts`; deleted after 90 days                                                  |
| User Content → Other User Content (room name, expense descriptions, reactions)                                      | Yes       | App Functionality            | Yes                  | No                | research 1.6, conservative Yes: it sits under a room and member token                                  |
| Identifiers → User ID (member id and member token in a room)                                                        | Yes       | App Functionality            | Yes                  | No                | conservative: the token says which member of a room you are (privacy page "What stays on your device") |
| Identifiers → Device ID (PostHog anonymous id, push token)                                                          | Yes       | Analytics, App Functionality | Yes                  | No                | research 1.6; `src/lib/analytics.ts`; ARCHITECTURE 10                                                  |
| Usage Data → Product Interaction (PostHog events, no slug, name or amount)                                          | Yes       | Analytics                    | Yes                  | No                | research 1.6, linked through the device id                                                             |
| Diagnostics → Crash Data (Sentry, errors only)                                                                      | Yes       | App Functionality            | No                   | No                | research 1.6                                                                                           |
| Diagnostics → Other Diagnostic Data (error context; device details in a problem report)                             | Yes       | App Functionality            | No                   | No                | `src/lib/feedback-contract.ts` `FeedbackDiagnostics`                                                   |
| Financial Info, Location, Contacts, Health and Fitness, Browsing History, Search History, Sensitive Info, Purchases | No        |                              |                      |                   | research 1.6: amounts typed into a room are user content, not the person's own financial records       |

## Apple: privacy manifest mapping (`ios/App/App/PrivacyInfo.xcprivacy`)

The manifest must say what the labels say. Source: research 1.5 and 5 (iOS checklist).

| Key                           | Value                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NSPrivacyTracking`           | `false`                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `NSPrivacyTrackingDomains`    | empty array                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NSPrivacyCollectedDataTypes` | one entry per "Yes" row above: `NSPrivacyCollectedDataTypeName`, `…PhotosorVideos`, `…CustomerSupport`, `…OtherUserContent`, `…UserID`, `…DeviceID`, `…ProductInteraction`, `…CrashData`, `…OtherDiagnosticData`; each with `NSPrivacyCollectedDataTypeTracking = false`, `NSPrivacyCollectedDataTypeLinked` as in the table, and purposes `NSPrivacyCollectedDataTypePurposeAppFunctionality` or `…PurposeAnalytics` as in the table |
| `NSPrivacyAccessedAPITypes`   | `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1` (`@capacitor/preferences`, push plugin); `NSPrivacyAccessedAPICategoryFileTimestamp` with reason `C617.1` (as peanut-ui)                                                                                                                                                                                                                                              |

After the first upload, App Store Connect emails any ITMS-91053 missing-reason warning to the
account holder. That email is the final check (research 1.5).

## Apple: age rating (App Store Connect → App Information → Age Rating)

Source: research 1.7 and 1.8. The resulting rating is UNVERIFIED (likely 4+ or 9+).

| Question                                                                                                         | Answer    | Why                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| Violence, sexual content, nudity, profanity, horror, mature themes, alcohol, tobacco, drugs, medical information | None      | Split shows only what a group types about shared costs                       |
| Simulated gambling, contests, loot boxes                                                                         | None / No | no games or prizes                                                           |
| Unrestricted web access                                                                                          | No        | external links open in the system browser, outside the app (INTERACTION 2.8) |
| User-generated content                                                                                           | Yes       | room and expense text is visible to everyone holding the room link           |
| Messaging and chat                                                                                               | No        | no in-room messaging (ROADMAP "Deliberately not building")                   |
| Advertising                                                                                                      | No        | no ads in the app (ARCHITECTURE 12.4)                                        |
| Social-media questions (added 9 Jul 2026)                                                                        | No        | no feed, no public profiles, no followers                                    |
| Shared Location (from 16 Nov 2026)                                                                               | No        | Split never reads location                                                   |
| Dating and Relationships (from 16 Nov 2026)                                                                      | No        | not a dating app                                                             |
| Parental controls, age assurance                                                                                 | No        | none in the app                                                              |

## Apple: export compliance

- `ITSAppUsesNonExemptEncryption = false` in `ios/App/App/Info.plist`. Split uses only the HTTPS
  that the OS provides, so it is exempt and App Store Connect asks nothing per build. Source:
  research 1.9.

## Apple and Google: remotely loaded code

- **No remotely loaded code.** All JavaScript and CSS ship in the binary. There is no OTA update, no
  ad tag and no CDN script. In the app PostHog runs with `disable_external_dependency_loading`, so a
  dashboard setting cannot load new code. Source: research 1.3 (Apple 2.5.2), ARCHITECTURE 12.1 and
  12.4, PLAN 4.3.

## Google: Data safety (Play Console → App content → Data safety)

Source: research 2.3.

| Category                 | Data type                                                             | Collected | Shared | Optional                  | Purposes                     | Processed ephemerally |
| ------------------------ | --------------------------------------------------------------------- | --------- | ------ | ------------------------- | ---------------------------- | --------------------- |
| Personal info            | Name (display name in a room)                                         | Yes       | No     | No, needed to join a room | App functionality            | No                    |
| Photos and videos        | Photos (receipt scan)                                                 | Yes       | No     | Yes                       | App functionality            | Yes                   |
| App activity             | App interactions                                                      | Yes       | No     | No                        | Analytics                    | No                    |
| App activity             | Other user-generated content (room and expense text, problem reports) | Yes       | No     | No                        | App functionality            | No                    |
| App info and performance | Crash logs                                                            | Yes       | No     | No                        | App functionality            | No                    |
| App info and performance | Diagnostics                                                           | Yes       | No     | No                        | App functionality            | No                    |
| Device or other IDs      | Device or other IDs (PostHog id, FCM token)                           | Yes       | No     | No                        | Analytics, App functionality | No                    |

- "Shared" is No for every row: PostHog, Sentry, the language-model provider and Firebase Cloud
  Messaging act as service providers. Google's service-provider wording is UNVERIFIED (research 2.3).
- Data encrypted in transit: **Yes** (HTTPS only).
- Account creation: **No accounts**, so the account-deletion URL does not apply. Source: research 2.3
  and 8.
- Users can request that their data is deleted: **Yes**, by email to `support@peanut.me` with the
  room link; rooms have no delete button. Source: privacy page "Your rights".
- Location, financial info, health, messages, contacts, calendar, audio, files, web browsing: **No**.

## Google: other App content answers

| Form                        | Answer                                                                                                                                                                                                                                                                                             | Source                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Privacy policy              | `https://peanutsplit.com/privacy`                                                                                                                                                                                                                                                                  | PLAN 7.1                              |
| Ads                         | No, the app contains no ads                                                                                                                                                                                                                                                                        | research 2.5                          |
| Advertising ID              | No; the merged manifest has no `com.google.android.gms.permission.AD_ID`                                                                                                                                                                                                                           | research 2.3                          |
| App access                  | All functionality is available without special access. If the form offers an instructions field, paste the review room link there and nowhere in the repo                                                                                                                                          | research 2.5; review-notes.md         |
| Content rating (IARC)       | Category Utility, Productivity, Communication or Other. Every question No, except "Users can interact or exchange content": Yes. Shares location: No. Digital purchases: No. Cash Convertible Rewards: No. Unrestricted internet: No. Expected Everyone / PEGI 3 with "Users Interact", UNVERIFIED | research 2.5                          |
| Target audience and content | 18 and over only                                                                                                                                                                                                                                                                                   | research 2.5; privacy page "Children" |
| Financial features          | "My app doesn't provide any financial features."                                                                                                                                                                                                                                                   | research 2.4 and 4 point 7            |
| Government apps             | No                                                                                                                                                                                                                                                                                                 | research 6                            |
| Health apps                 | No                                                                                                                                                                                                                                                                                                 | research 6                            |
| News apps                   | No                                                                                                                                                                                                                                                                                                 | research 6                            |
| Data safety                 | as above                                                                                                                                                                                                                                                                                           | research 2.3                          |
