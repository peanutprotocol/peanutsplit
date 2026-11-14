# Screenshot plan: Peanut Split v1

What task 4C captures and what Konrad approves before any upload (mono brand-asset rule). The
images go in `apps/web/store/assets/`.

## Rules for every image

- Plain captures of the real app: no device frames and no captions in v1.
- JPEG, quality 90, no alpha channel (both stores reject transparency).
- English (US) UI only.
- Generic first names only, such as Ana, Ben, Carla and Dev. No real people, no real rooms.
- Never show the settle sheet or the Peanut option. Never show the word crypto, wallet or payment.
- No Android UI in the iPhone sets and no iPhone UI in the Android set.

## The five screens

| #   | Screen              | What it shows                                             | Setup                                                                                                            |
| --- | ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | A trip room         | Four people, several expenses and their balances          | Seed a room through the local API server                                                                         |
| 2   | Add expense         | The expense drawer mid-entry, with the split options open | Same room                                                                                                        |
| 3   | Receipt scan review | Scanned items with people assigned to each item           | Mock the scan response with a fixture; build the export and the API server with `NEXT_PUBLIC_SPLIT_V2_ENABLED=1` |
| 4   | The share moment    | The room link and its QR code                             | Same room                                                                                                        |
| 5   | The app home        | Three recent rooms                                        | Three seeded rooms in local storage                                                                              |

## Sizes

| Set           | Pixels      | Capture viewport |
| ------------- | ----------- | ---------------- |
| iPhone 6.9"   | 1320 × 2868 | 440 × 956 at 3x  |
| iPhone 6.3"   | 1206 × 2622 | 402 × 874 at 3x  |
| Android phone | 1080 × 1920 | 360 × 640 at 3x  |

Apple requires the 6.3" set (iPhone with Dynamic Island, medium display). The 6.9" set goes up
too, so Apple never scales one from the other (Apple screenshot specifications). Play needs at
least two phone screenshots; all five go up (Play graphic assets help page).

## Play graphics

- Feature graphic: 1024 × 500, JPEG or 24-bit PNG, required by Play.
- Play icon: 512 × 512, 32-bit PNG, at most 1024 KB.

## Approval

Konrad approves every image, the feature graphic and the icon before upload (decision 8.3 #8 in
the plan). Nothing is uploaded from this folder automatically.
