# Peanut Split alter-ego picker

## Recommendation

Use **Option B: the cast drawer**.

The current header avatar is already a small, discoverable entry point. Opening
it into a “Cast of characters” drawer lets the group choose a member and recast
them without adding a step to the room-link handoff or making avatars compete
with balances and expense actions.

The feature branch implements this recommendation while the adjacent
`index.html` keeps all three placement options interactive for review.

## The product rule

- The default is a stable, name-derived surprise from the non-human persona
  catalog. It never draws a human face or infers appearance from a name.
- Anyone holding the room link can cast any member as any listed alter ego.
  That permissiveness is intentional table banter, consistent with Split’s
  shared-room model.
- The target must belong to the room in the URL.
- Values are code-side allowlist keys. There is no free text, photo upload,
  remote URL, or demographic field.
- The exact persona and target member stay out of analytics. Only the broad
  `persona`, `doodle`, or `default` family is tracked.

## Placement options

### A. Join with a role

Choose a persona beside the name field when entering a room.

- Best discovery.
- Makes the feature feel like part of joining the group.
- Adds cognitive and vertical weight to the most important link handoff.
- Does not naturally explain how to recast somebody else later.

Verdict: good campaign/onboarding variant, not the default.

### B. Cast drawer — recommended

Tap the small header avatar, choose any member in a horizontal cast strip, then
pick an alter ego.

- Intentional enough to avoid accidental edits.
- Handles “anyone can cast anyone” explicitly.
- Keeps the financial surface quiet.
- Supports a large catalog with filters and visible persona names.
- One tap deeper than an inline control.

Verdict: strongest balance of discovery, play and reversibility.

### C. Inline roster remix

Every avatar in a “Cast of characters” roster is directly tappable.

- Fastest route to group banter.
- Makes the cast legible at a glance.
- Adds edit affordances near balances and money actions.
- More accidental taps and less room for the 30-option catalog.

Verdict: fun as a temporary party mode, too dominant as the default.

## Catalog

Thirty named personas are evenly split across five vibes:

The exact in-app vector render is captured in
[`production-vector-cast.png`](./production-vector-cast.png).

| Mischief        | Cozy          | Brainy            | Party               | Adventure         |
| --------------- | ------------- | ----------------- | ------------------- | ----------------- |
| Vampire Penguin | Cozy Ghost    | Wizard Frog       | Disco Octopus       | Astronaut Avocado |
| Pirate Parrot   | Garden Snail  | Detective Raccoon | Rockstar Strawberry | Surfer Shark      |
| Ninja Pear      | Sleepy Cloud  | Bookworm Bat      | Party Bee           | Skater Cactus     |
| Lucky Alien     | Explorer Bear | Scientist Owl     | DJ Dinosaur         | Chef Dragon       |
| Trickster Fox   | Baker Moon    | Mechanic Robot    | Painter Panda       | Sailor Banana     |
| Punk Pineapple  | Yoga Yeti     | Gamer Cat         | Karaoke Kiwi        | Cosmic Llama      |

Twelve existing, non-human doodles remain available under “Classics.” The nine
previous `face-*` storage keys remain accepted for compatibility but redraw as
personas and are not offered by the picker.

## Implementation notes

- `lib/avatars.ts` is the one catalog and validation allowlist.
- `PersonaGlyph.tsx` draws the catalog with in-house outlined SVG primitives.
- Null remains the database default; it now resolves to a stable persona.
- No database migration is required.
- The member-avatar route checks that the target belongs to the room before
  updating it, preventing a member ID from another room being used with this
  room’s URL.
- Picker copy and filters are present in English, Spanish, and Brazilian
  Portuguese.

## Review question

Approve **B**, choose **A** or **C**, or ask for a hybrid (for example: B as the
full editor plus a one-time prompt after joining).
