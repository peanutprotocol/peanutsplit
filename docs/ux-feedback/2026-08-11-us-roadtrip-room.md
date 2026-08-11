# US road-trip room — 4 friends, Aug 1–8 2026

Source: ab (Telegram, 2026-08-11). His friend Maki used Split with 3 friends on a
US business trip. Room created Jul 31, 43 USD expenses Aug 1–8, no in-app
settlement. Analysis: room API ledger + PostHog project 234225 (person timelines
matched by join timestamps; the `room` pseudonym only exists from Aug 8).

## Insights

- All four members used the app on their own phones and each added and paid expenses.
- Nobody installed the PWA; all use stayed in mobile browsers, one of them Facebook's in-app browser.
- They used 3 iPhones and 1 Samsung Galaxy S25 Ultra.
- 4 of 43 expenses were added for another member.
- All 43 expenses used equal split; 9 covered a subset of the group, none used exact amounts.

## Feature ask

At trip end they wanted a plain per-person total: who paid how much. The app
does not show it. They opened the settle sheet once, recorded nothing, and
settled outside the app. Candidate fix: add per-person paid totals to History.

## Other observations

- One member batch-logged 12 expenses in 17 minutes from Las Vegas — retro entry, not live entry.
- Room creation failed twice on the landing form before it worked (Jul 31, the unstable-prod window).
- The creator reopened the room from another country the day after the trip.
- One iPhone user appears as three PostHog persons (Safari + in-app browser contexts split the device).
