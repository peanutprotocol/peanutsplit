# Store listing: Peanut Split v1

Every text field for App Store Connect and Play Console, English (US) only. Paste each fenced block
as it stands. Every claim matches mono `split-content/product/truths.md`; change a claim there
first.

`node apps/web/store/check-listing.mjs` checks this file. Run it after every edit.

## Field format

The checker reads only the fields written in this shape:

````md
### `ios.name`: App Store name

Limit: 30. Length: 25.

```text
Peanut Split: Split Bills
```
````

- The heading starts with the field id in backticks. `ios.*` fields go to App Store Connect and
  `play.*` fields go to Play Console.
- `Limit` is the store limit in characters, or `none`. `Length` is the character count of the
  fenced text. The checker counts the text again and fails when the two numbers differ or the text
  is over the limit.
- The fenced block is the exact field text. Line breaks count as one character each.

Rules the checker enforces on every field: no crypto, wallet, stablecoin, USDC, digital dollars,
payments, send money, transfer, bank, PWA, web app or "works offline"; "Peanut" only as part of
"Peanut Split"; no competitor names. No Android or Google Play words in `ios.*` fields. No iPhone,
iPad, iOS or App Store words in `play.*` fields.

## App Store Connect

### `ios.name`: App Store name

Limit: 30. Length: 25.

```text
Peanut Split: Split Bills
```

### `ios.subtitle`: Subtitle

Limit: 30. Length: 25.

```text
Group expenses, no signup
```

### `ios.keywords`: Keywords

Commas, no spaces. Words already in the name and subtitle are left out, because Apple indexes those
fields too.

Limit: 100. Length: 98.

```text
bill,trip,travel,roommates,flatmates,friends,owe,iou,receipt,scan,costs,share,dinner,holiday,house
```

### `ios.promotionalText`: Promotional text

Limit: 170. Length: 116.

```text
Share one link with your group. Everyone adds what they paid, and Split shows who owes whom. No signup, no password.
```

### `ios.description`: Description

Limit: 4000. Length: 1917.

```text
Split keeps track of shared costs for trips, flats, dinners and anything else a group pays for together.

Start a room, share its link in your group chat, and everyone joins by picking their name. There is no signup, no email and no password. The link is the key to the room, so keep it in the chat.

WHAT YOU CAN DO
• Add an expense in a few taps: who paid, how much, and who it was for. Split it equally, by percentage, by shares or by exact amounts.
• Scan a receipt with your camera. Split reads the items, you check them, then tap who had what. With your permission, the photo is sent once to an AI service to be read. Split doesn't keep it.
• See every balance at a glance, with a short plan of who owes whom.
• Mark a debt as settled when someone pays it back, however they paid.
• Add expenses in other currencies. Split converts them automatically for 156 currencies at the day's indicative rate, and the rate is fixed when the expense is added, so history does not move.
• Turn on notifications for a room to hear when someone adds an expense.
• Tap a room link in any chat and the room opens in the app.
• Share a room link with your phone's share sheet.

MADE FOR GROUPS
A room holds up to twenty people. Everyone sees the same numbers and the same history of changes.

WHEN THE SIGNAL DROPS
Rooms need a connection to load. If you lose signal in an open room, Split can hold a new expense for someone already in the room and send it when you reconnect.

YOUR ROOMS STAY ON YOUR PHONE
Your list of rooms and the name you picked in each room are saved on your phone, not in an account. Rooms themselves are stored on our servers so the whole group sees the same numbers.

LANGUAGES
English, German, Spanish, French, Polish, Portuguese and Ukrainian.

FREE
Split is free to use and has no paid tier. Squirrel Labs maintains Split and pays every project cost.

Privacy policy: https://peanutsplit.com/privacy
```

### `ios.category`: Category

Limit: none.

```text
Primary: Utilities. Secondary: Productivity.
```

### `ios.privacyUrl`: Privacy policy URL

Limit: none.

```text
https://peanutsplit.com/privacy
```

### `ios.supportUrl`: Support URL

The page's contact section shows `support@peanut.me`.

Limit: none.

```text
https://peanutsplit.com/privacy#contact
```

### `ios.copyright`: Copyright

Limit: none.

```text
© 2026 Squirrel Labs Ltd
```

## Play Console

### `play.title`: App name

Limit: 30. Length: 25.

```text
Peanut Split: Split Bills
```

### `play.shortDescription`: Short description

Limit: 80. Length: 65.

```text
Split bills with your group. No signup: share one link and start.
```

### `play.fullDescription`: Full description

The same text as `ios.description`. It already uses no platform words, so one text serves both
stores.

Limit: 4000. Length: 1917.

```text
Split keeps track of shared costs for trips, flats, dinners and anything else a group pays for together.

Start a room, share its link in your group chat, and everyone joins by picking their name. There is no signup, no email and no password. The link is the key to the room, so keep it in the chat.

WHAT YOU CAN DO
• Add an expense in a few taps: who paid, how much, and who it was for. Split it equally, by percentage, by shares or by exact amounts.
• Scan a receipt with your camera. Split reads the items, you check them, then tap who had what. With your permission, the photo is sent once to an AI service to be read. Split doesn't keep it.
• See every balance at a glance, with a short plan of who owes whom.
• Mark a debt as settled when someone pays it back, however they paid.
• Add expenses in other currencies. Split converts them automatically for 156 currencies at the day's indicative rate, and the rate is fixed when the expense is added, so history does not move.
• Turn on notifications for a room to hear when someone adds an expense.
• Tap a room link in any chat and the room opens in the app.
• Share a room link with your phone's share sheet.

MADE FOR GROUPS
A room holds up to twenty people. Everyone sees the same numbers and the same history of changes.

WHEN THE SIGNAL DROPS
Rooms need a connection to load. If you lose signal in an open room, Split can hold a new expense for someone already in the room and send it when you reconnect.

YOUR ROOMS STAY ON YOUR PHONE
Your list of rooms and the name you picked in each room are saved on your phone, not in an account. Rooms themselves are stored on our servers so the whole group sees the same numbers.

LANGUAGES
English, German, Spanish, French, Polish, Portuguese and Ukrainian.

FREE
Split is free to use and has no paid tier. Squirrel Labs maintains Split and pays every project cost.

Privacy policy: https://peanutsplit.com/privacy
```

### `play.category`: App category

Limit: none.

```text
Productivity
```

### `play.contactEmail`: Contact email

Limit: none.

```text
support@peanut.me
```

### `play.privacyUrl`: Privacy policy URL

Limit: none.

```text
https://peanutsplit.com/privacy
```

## Names outside the text fields

- Store name: "Peanut Split". Home-screen name: "Split" (decision 8.3 #7 in the plan).
- App type: app. Price: free. Default language: English (United States).
- Marketing URL (App Store, optional): leave empty in v1.
