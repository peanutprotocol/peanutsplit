# Review notes: Peanut Split v1

Paste the Apple block into App Store Connect → App Review Information → Notes, and the Google block
into the Play Console fields named below. Replace `<REVIEW_ROOM_URL>` only in the consoles. This
repository is public and a room link is the room's credential, so the real link never goes into a
file here. It comes from HANDOFF step K2 (`scripts/native/seed-review-room.mjs`).

`node apps/web/store/check-listing.mjs` checks that every double-quoted label in this file exists in
`src/i18n/messages/en.json`. Quote only exact UI labels.

## What each native feature depends on

Before you submit, check that the HANDOFF step behind each feature is done (`docs/NATIVE-HANDOFF.md`).
The reviewer tests these.

| Native feature                                                                 | HANDOFF step it depends on                                                                                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Push notifications per room (APNs on iOS, Firebase Cloud Messaging on Android) | Step 6 (production push credentials and egress), using the keys from steps 3 and 4. Without step 6 the notification row is hidden |
| Universal links into rooms (iOS)                                               | Step 1 (the apple-app-site-association file live on peanutsplit.com)                                                              |
| App Links into rooms (Android)                                                 | Step 9 (the Play App Signing SHA-256 in `assetlinks.json`, live on peanutsplit.com)                                               |
| Native share sheet                                                             | None                                                                                                                              |
| Camera receipt scan                                                            | Step K2 (the receipt-parse check reports scanning enabled in production). Apple 2.5.19: the feature must be on during review      |

## Apple: App Review notes

```text
No login is needed. Split has no accounts.

To start: tap "New split" on the home screen, add two names, then tap "Add expense". Or open this test room, which already has people, expenses and balances: <REVIEW_ROOM_URL>

Peanut Split is a bundled app. The UI ships in the binary. Rooms need a connection to load, and a new expense added in an open room after the signal drops syncs when you reconnect.

Native features:
1. Push notifications per room, through APNs: Room → "Settings" → Notifications. Turn on the row named after the room. iOS asks for permission at that tap, never at launch.
2. Universal links. Tap a room link (https://peanutsplit.com/r/...) in Messages or Mail and the room opens in the app.
3. Native share sheet for the room link and share cards.
4. Camera receipt scan. In a room, tap "Add expense", then "Scan receipt". Before the first photo leaves the phone, the app asks "Read this receipt with AI?" and sends nothing until you tap "Allow". The photo then goes once to Google Gemini through OpenRouter and is not stored. Room "Settings" has a "Read receipts with AI" switch to change the choice.

Accounts: Split has no accounts, so account deletion does not apply. A room is shared by its link; joining means picking a display name in that room. To leave a room, open "Settings" and tap "Leave room".

User-generated content: rooms are private to the people who hold the link. To report a problem, open "Settings" and tap "Report a problem", or write to support@peanut.me. The "Privacy" link in room "Settings" and on the home screen opens https://peanutsplit.com/privacy.

Money: Split records who paid whom. It does not move money. Peanut is one of three labels for how a debt was settled (cash, bank transfer, Peanut), and it opens the separate Peanut website in the browser.
```

## Google: Play Console

App content → App access: answer _All functionality is available without special access_. If the
form offers an instructions field, paste this block there with the real room link.

```text
No login is needed. Split has no accounts.

To start: tap "New split" on the home screen, add two names, then tap "Add expense". Or open this test room, which already has people, expenses and balances: <REVIEW_ROOM_URL>

The UI ships in the app. Rooms need a connection to load, and a new expense added in an open room after the signal drops syncs when you reconnect.

Notifications: Room → "Settings" → Notifications. Turn on the row named after the room. Android asks for permission at that tap, never at launch.

Room links (https://peanutsplit.com/r/...) open in the app through App Links.

Receipt scan: in a room, tap "Add expense", then "Scan receipt". The app asks "Read this receipt with AI?" and sends nothing until you tap "Allow".

To leave a room: "Settings", then "Leave room". To report a problem: "Settings", then "Report a problem", or support@peanut.me.

Split records who paid whom. It does not move money. Peanut is one of three labels for how a debt was settled, and it opens the separate Peanut website in the browser.
```
