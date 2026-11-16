# Screenshot plan: Peanut Split v1

What task 4C captures and what Konrad approves before any upload (mono brand-asset rule). The
images go in `apps/web/store/assets/`.

## Rules for every image

- Framed captures of the real app: a flat brand background, one headline and one sub-line from
  the LP voice, and the capture in a neutral ink frame with no device hardware. The text in an
  image never names a price, a store or an OS.
- JPEG, quality 90, no alpha channel (both stores reject transparency).
- English (US) UI only.
- Generic first names only, such as Ana, Ben, Carla and Dev. No real people, no real rooms.
- Never show the settle sheet or the Peanut option. Never show the word crypto, wallet or payment.
- No Android UI in the iPhone sets and no iPhone UI in the Android set.

## The five screens

| #   | Screen              | What it shows                                              | Setup                                                                                                            |
| --- | ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | A trip room         | Four people, several expenses and their balances           | Seed a room through the local API server                                                                         |
| 2   | Add expense         | The expense drawer mid-entry, with "Who shares this?" open | Same room                                                                                                        |
| 3   | Receipt scan review | Scanned items with people assigned to each item            | Mock the scan response with a fixture; build the export and the API server with `NEXT_PUBLIC_SPLIT_V2_ENABLED=1` |
| 4   | The share moment    | The room link and its QR code                              | Same room                                                                                                        |
| 5   | The app home        | Three recent rooms: a trip, roommates and a dinner         | Three seeded rooms in local storage                                                                              |

"Import from Splitwise" and "Settle up" name competitors, so they stay outside every frame; the
spec asserts it.

## Upload order

The file numbers are the screen numbers above. Upload in this order (the first three show in
search results):

| Upload | File             | Headline                  | Sub-line                      |
| ------ | ---------------- | ------------------------- | ----------------------------- |
| 1      | `4-share`        | ONE LINK. PICK YOUR NAME. | No signup. No password.       |
| 2      | `2-add-expense`  | EVERYONE ADDS EXPENSES.   | Who paid, how much, for whom. |
| 3      | `1-room`         | WHO OWES WHAT. SORTED.    | Every balance in one room.    |
| 4      | `3-receipt-scan` | SCAN THE BILL.            | Then tap who had what.        |
| 5      | `5-home`         | SPLIT ANYTHING.           | Trips, roommates, dinners.    |

## Sizes

| Set           | Pixels      | Canvas          | Raw capture |
| ------------- | ----------- | --------------- | ----------- |
| iPhone 6.9"   | 1320 × 2868 | 440 × 956 at 3x | `iphone`    |
| iPhone 6.3"   | 1206 × 2622 | 402 × 874 at 3x | `iphone`    |
| Android phone | 1080 × 1920 | 360 × 640 at 3x | `android`   |

The app is captured at two raw sizes, both at 3x: `iphone` 402 × 874 (iPhone user agent) and
`android` 412 × 892 (Android user agent). Each frame shows a window of the capture, anchored at
its top or its bottom. Every headline sets on two lines, so the frame starts at the same height on
all five screens. On the receipt-scan screen the spec scrolls back so the top of the window never
cuts an item card.

Apple requires the 6.3" set (iPhone with Dynamic Island, medium display). The 6.9" set goes up
too, so Apple never scales one from the other (Apple screenshot specifications). Play needs at
least two phone screenshots; all five go up (Play graphic assets help page).

## Play graphics

- Feature graphic: 1024 × 500, JPEG or 24-bit PNG, required by Play. Headline: the LP H1, "Good
  accounting makes good friends."
- Play icon: 512 × 512, 32-bit PNG, at most 1024 KB.

## Approval

Konrad approves every image, the feature graphic and the icon before upload (decision 8.3 #8 in
the plan). Nothing is uploaded from this folder automatically.
