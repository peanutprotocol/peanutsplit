# Licensing decision

## Decision

Peanut Split is licensed. The granting entity is **Squirrel Labs Ltd**, ruled by the project owner on
2026-08-24 and confirmed on 2026-09-01.

| Corpus                                                    | License                       |
| --------------------------------------------------------- | ----------------------------- |
| Application code, migrations, tests, build and run config | `AGPL-3.0-or-later`           |
| Documentation, product content, translations              | `CC-BY-4.0`                   |
| Artwork, icons, mascots, generated image assets           | `CC-BY-4.0`, marks reserved   |
| Lucide-derived doodle geometry                            | `ISC`, with `MIT` for Feather |
| Sniglet                                                   | `OFL-1.1-no-RFN`              |
| Knerd                                                     | Proprietary, not sublicensed  |
| Competitor quotations and names                           | Excluded from the grant       |

The root [`LICENSE`](../../LICENSE) is the AGPL text, byte-identical to the FSF's published
`agpl-3.0.txt`. Per-path annotations live in [`REUSE.toml`](../../REUSE.toml), license texts in
`LICENSES/`, notices in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md), and the evidence
behind each row in [`RIGHTS-REGISTER.md`](RIGHTS-REGISTER.md).

## Why AGPL for the code

Peanut Split is network software. AGPL is the closest fit to the goal that a modified hosted version
keeps offering its source to the people using it. It asks nothing of Squirrel Labs Ltd as sole
maintainer: no duty to recruit, review, or merge outside contributions.

`-or-later` lets recipients use a future GNU AGPL version. That trades a little control over the
license text for long-term compatibility, and is a deliberate choice rather than a default.

## Why not one blanket license

The tree is mixed-origin. A single unqualified grant would claim rights over the Lucide geometry, the
Sniglet binaries, and the Knerd faces that Squirrel Labs Ltd does not have to give — and would drag a
program license across prose that reads better under CC-BY. REUSE annotations record what is true per
path instead of averaging it.

Prose and artwork are `CC-BY-4.0` for a practical reason: someone quoting a Split guide or reusing a
mascot should not have to reason about copyleft on a program.

## Comparison, for the record

| License           | Copyleft boundary                   | Modified network service must offer source? | Proprietary hosted fork possible?           | Fit                                |
| ----------------- | ----------------------------------- | ------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| AGPL-3.0-or-later | Strong, program-level               | Yes, under section 13                       | Constrained for covered modifications       | Chosen                             |
| GPL-3.0-or-later  | Strong on conveyed copies           | No network-use trigger                      | Yes, when operated without conveying copies | Misses the SaaS goal               |
| MPL-2.0           | File-level on distribution          | No                                          | Yes, especially in new adjacent files       | Weaker durability                  |
| Apache-2.0        | Permissive with patent/notice terms | No                                          | Yes                                         | Best adoption, poorest reciprocity |

None of these requires community governance or accepting patches, and none of them was modified. A
custom referral or logo-retention rider would break standard FOSS status and is not used.

## Corresponding source

An AGPL network deployment has to offer the source that matches what users are running. A link to a
moving branch drifts between deploys, so the deployment supplies `NEXT_PUBLIC_BUILD_COMMIT` and
`/source` links the public tree at exactly that commit. `publicFossReleased()` in
`apps/web/src/lib/flags.ts` refuses to open the surface without it. Operator-side details are in
[`SELF-HOSTING.md`](SELF-HOSTING.md).

## What the license does and does not promise

Recipients of a published AGPL release keep the permissions granted for that version — to run, study,
modify and share it — under the license's terms. The license does not promise that peanutsplit.com
stays online or free, and it grants no rights to the Peanut or Split marks.
