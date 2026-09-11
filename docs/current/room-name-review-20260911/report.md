# Review of 50 fallback room names

Preflight, pinned base and exceptions: [preflight.md](preflight.md). Original list: [candidates.txt](candidates.txt). Final shipped pool: [room-names.ts](../../../apps/web/src/lib/room-names.ts).

## Confirmed

All three are LOW editorial findings independently confirmed from the actual name; no functional or safety failure is claimed.

- “Roasted & Toasted” reads as a description. Replaced with **The Crunch Crew**.
- “The Afterparty” names an event. Replaced with **The Afterparty Crew**.
- “Cheap Dates” suggests dating relationships when assigned to any group. Replaced with **The Bargain Bunch**.

## Refuted with evidence

- “Adults Allegedly” does not need a comma to be understood as a group joke. Retained.
- “Impulse Buyers” is a readable group name within the money-personality humor the user expressly wanted. The unfavorable-spending claim did not justify rejecting it. Retained.

## By design — do not fix

- Money jokes, peanut puns, and informal club/crew names are intended; see the current human rulings in [kill-list.md](kill-list.md).
- The name is a quiet server fallback. No optional badge, helper text, randomizer, or name picker is proposed.
- Named and template rooms keep their provided names. Existing rooms and renaming keep their current behavior.

## Reassuring negatives

Both finder lenses reviewed every candidate. All five deduplicated claims received independent verification. No names were skipped or silently capped. The pool contains exactly 50 distinct, short names. The final whole-pool review covered all 50 names, including the replacements, and found no remaining issues or report gaps. See [final-review.json](final-review.json). No finding requires a MED/HIGH functional hand reproduction.

## Open rulings

None. The user's latest instruction authorizes selecting the final list and deploying without another confirmation.

Stats: found 5 unique claims (6 raw) · refuted 2 (40%) · killed-by-kill-list 0 · overturned-by-hand 0.
