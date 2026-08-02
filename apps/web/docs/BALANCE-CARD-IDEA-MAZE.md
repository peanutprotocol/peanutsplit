# Balance card idea maze

Date: 2026-08-02

Scope: the single balance card in a two-person room

Decision: ship **A. Signal band**

Open the populated comparison in [`balance-card-lab.html`](./balance-card-lab.html). It shows both directions at a 375px-first size.

## Problem

The old card gave the avatar, relationship sentence, amount, and full-card tint similar visual weight. The user had to read the card before knowing if money moved toward or away from them.

The new card must make these states different in less than one second:

- You owe the other person.
- The other person owes you.
- The room is neutral.
- A spectator sees which member owes the other member.

Color can speed up recognition. Color cannot be the only source of meaning.

## Constraints

- Keep the complete localized relationship sentence.
- Keep the raw server balance and the existing tap-to-derivation behavior.
- Keep long names readable in English, Spanish, and Brazilian Portuguese.
- Do not change money logic or the multi-person balance strip.
- Keep the neutral state compatible with the room theme.

## Approaches

Scores use 1–5. Direction clarity has the highest weight.

| Approach | Direction 40% | Less noise 25% | Long names and locale 15% | Edge states 10% | Low risk 10% | Weighted score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A. Signal band | 5 | 5 | 5 | 4 | 5 | **4.9** |
| B. Action edge | 5 | 4 | 4 | 4 | 5 | 4.5 |
| C. Money path | 5 | 2 | 2 | 3 | 2 | 3.3 |
| D. Action chip | 4 | 4 | 4 | 4 | 5 | 4.1 |

### A. Signal band — selected

A fixed header holds the arrow and full relationship sentence. Red with a right arrow means outgoing. Green with a left arrow means incoming. A white body holds one large amount.

This removes the avatar from the two-person card. The sentence already names the only other person, so the avatar repeated identity and competed with the amount.

### B. Action edge

A 50px side rail holds the arrow. The sentence, amount, and avatar stay in the body.

This scans well, but it keeps the repeated avatar and gives long localized sentences less width. It is the closest fallback if the full-width band feels too strong after production use.

### C. Money path

Two person nodes and an arrow draw the transfer literally.

This explains direction well in a study frame. In the room, it repeats both identities and creates the highest density. Long names also compete with the amount and arrow.

### D. Action chip

A small red or green capsule sits above the amount beside the avatar.

This is familiar and compact. It puts the most important sentence back into the smallest element, which recreates the original hierarchy problem.

## Shipped anatomy

- The relationship header has a fixed location at the top of the card.
- The arrow is hidden from assistive technology because the sentence carries the complete meaning.
- `data-balance-direction` exposes `incoming`, `outgoing`, `neutral`, or `between-members` for browser tests.
- The amount uses the existing animated money component and raw server balance.
- The whole card remains one button that opens the named member's derivation.
- The settled and empty states use an em dash and the room tint.

## Verification

The pure decision tests assert sentence, arrow, direction, and state class from both member perspectives. The mobile browser journey creates a real room and expense, then checks these claims:

- Ana sees `Bea owes you` and `incoming`.
- Bea sees `You owe Ana` and `outgoing`.
- A recorded settlement returns Ana's card to `neutral`.
- The card still opens the balance working, whose lines add back to the server balance.

## Rollback and change path

The report and lab have their own commit. The UI and tests have a later commit. This lets a UI rollback keep the idea maze.

To roll back only the shipped card:

1. Run `git log --oneline -- apps/web/src/components/room/BalanceStrip.tsx`.
2. Revert the latest signal-band commit.
3. Run the focused balance test and the release gates.
4. Push `main` to deploy the rollback.

Do not revert the earlier `Keep offline expense replays singular across tabs` commit as part of a card rollback. It was already on the requested `peannutsplit` branch before this work.

To change the approach, keep `pairCard` as the semantic source. Replace only the pair-card markup and state classes. Preserve the full sentence, raw `data-net`, `data-member`, `data-balance-direction`, and derivation target.
