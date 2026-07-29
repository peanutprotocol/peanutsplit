# Peanut Split alter-ego picker

## Decision

Use **Option B: the cast drawer**. This direction is now locked in.

The small header avatar opens a “Cast of characters” drawer. The group chooses
a member and recasts them without adding work to the room-link handoff or
making avatars compete with balances and expense actions.

The feature branch and adjacent `index.html` implement only this approved
direction.

## The product rule

- Every new member gets a genuinely random persona from the non-human catalog.
  The chosen key is persisted, so every phone sees the same result.
- “Random” rolls and stores a new concrete persona. It does not hash the
  member’s name and it never changes merely because the UI rendered again.
- Anyone holding the room link can cast any member as any listed alter ego.
  That permissiveness is intentional table banter, consistent with Split’s
  shared-room model.
- The target must belong to the room in the URL.
- Values are code-side allowlist keys. There is no free text, photo upload,
  remote URL, or demographic field.
- The exact persona and target member stay out of analytics. Only the broad
  `persona`, `doodle`, or `default` family is tracked.

## Approved interaction

Tap the small header avatar, choose any member in the horizontal cast strip,
then pick an alter ego.

- Intentional enough to avoid accidental edits.
- Handles “anyone can cast anyone” explicitly.
- Keeps the financial surface quiet.
- Keeps the large catalog legible with visible names and no filter tags.
- One tap deeper than an inline control.

The removed framing sentence, vibe tags and name-derived “stable pick” do not
appear in either the production component or the review artifact.

## Catalog

Thirty named personas cover five broad kinds of energy:

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

Twelve existing, non-human doodles remain available as classics. The nine
previous `face-*` storage keys remain accepted for compatibility but redraw as
personas and are not offered by the picker.

## Doodle canaries

[`canary-doodles.png`](./canary-doodles.png) contains six first-pass characters
built through Peanut Split’s existing deterministic doodle pipeline:

- Vampire Penguin
- Pirate Parrot
- Cozy Ghost
- Wizard Frog
- Astronaut Avocado
- Disco Octopus

Each drawing is shown at 96px and at the 24px avatar stress-test size. They are
canaries, not yet replacements for all 30 production glyphs; the sheet exists
to approve the visual language before expanding the set.

## Implementation notes

- `lib/avatars.ts` is the catalog and validation allowlist.
- `PersonaGlyph.tsx` draws the current catalog with in-house outlined SVG
  primitives.
- New room creators, joined members and imported members store a random key.
- A migration assigns one random key to existing null rows.
- Null writes from an older client are converted to a fresh persisted random
  key. A neutral Peanut remains only as the defensive render fallback.
- The member-avatar route checks that the target belongs to the room before
  updating it, preventing a member ID from another room being used with this
  room’s URL.
- Picker copy is present in English, Spanish, and Brazilian Portuguese.
