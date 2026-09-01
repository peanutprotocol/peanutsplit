# Rights register

A publication work register, not a legal opinion. It records what the repository evidences and what
the project owner has ruled, so that every included path has a stated origin and outbound treatment.

**Granting entity: Squirrel Labs Ltd.** Ruled by the project owner on 2026-08-24 and confirmed on
2026-09-01, covering both the entity and the underlying chain of title: the work in this repository
was authored for Squirrel Labs Ltd, which holds the rights and grants the licenses below. Four commit
aliases across 759 commits resolve to two people, collapsed in [`.mailmap`](../../.mailmap); both
authored as Squirrel Labs Ltd. That ruling closes the chain-of-title question the earlier revisions
of this file left open.

The outbound license map is implemented in [`REUSE.toml`](../../REUSE.toml), the notices in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md), and the marks policy in
[`TRADEMARKS.md`](../../TRADEMARKS.md).

## Register

| Corpus                                            | Evidence in tree                                   | Treatment                                                      | Status   |
| ------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- | -------- |
| Application code, migrations, tests, config       | Git history and current source                     | `AGPL-3.0-or-later`                                            | Resolved |
| Code extracted from `peanut-ui` / `peanut-api-ts` | Extraction commit `7517a436`, subtree `abb1420`    | Same owner under the Squirrel Labs Ltd ruling; AGPL            | Resolved |
| `apps/api` Fastify implementation                 | Separate app and schema, same authors              | Included in the public repository; AGPL                        | Resolved |
| Munin-derived doodle build code                   | `design/doodles/build.py` names its source         | Same owner under the ruling; AGPL                              | Resolved |
| Lucide/Feather-derived doodles                    | Generator provenance, ISC/MIT text in tree         | ISC AND MIT; notices in the file header and the bundle         | Resolved |
| Sniglet fonts                                     | Font name tables carry authors and the OFL URL     | `OFL-1.1-no-RFN`, full text and copyright shipped              | Resolved |
| Knerd font files                                  | Runtime references; no grant inside the tree       | Commercial license held by Squirrel Labs Ltd, not sublicensed  | Resolved |
| Peanut logo, mascots, background, illustration    | Byte-identical to peanut-ui blobs, runtime imports | `CC-BY-4.0` grant, trademarks reserved separately              | Resolved |
| Portraits and generated portrait variants         | Two founder portraits; 13 exploration variants     | Variants deleted; the two founder portraits stay, see below    | Resolved |
| PWA/OG/favicon/background/badge assets            | Tracked generated assets                           | `CC-BY-4.0` as Squirrel Labs Ltd work                          | Resolved |
| Authored product content and translations         | Multiple authors, one owner                        | `CC-BY-4.0`                                                    | Resolved |
| Generated SEO content from the private mono       | Manifests name a private source commit             | Squirrel Labs Ltd content under `CC-BY-4.0`; publisher removed | Resolved |
| Competitor quotations, screenshots, names         | Comparison and alternatives surfaces               | Excluded from the grant; nominative use only                   | Resolved |
| Currency and static-rate data                     | Source files and runtime tables                    | Squirrel Labs Ltd compilation; AGPL with the code              | Resolved |
| Dependencies and container packages               | Lockfiles and base image                           | Own licenses; per-build SBOM before shipping an artifact       | Open     |

## Notes on the entries that are not a plain grant

**Knerd is proprietary and stays proprietary.** Squirrel Labs Ltd bought a license to use these faces
in Peanut Split. That is a license to use, not a right to sublicense: recipients of this repository
get no rights to the files, and the AGPL grant does not reach them. The files are annotated
`LicenseRef-Knerd-Commercial`. Publishing the repository puts them where anyone can download them,
so **confirm the purchased EULA permits distributing the font files inside a public source tree**
before the repository goes public. If it does not, remove the five Knerd paths and repoint
`apps/web/src/server/og/fonts.ts`, which reads `knerd-filled.ttf` unguarded.

**Peanut artwork carries an open copyright grant and reserved marks.** Ruled 2026-09-01: the mascots,
logo, background and hand illustration ship under `CC-BY-4.0`, so a fork may copy and modify them,
while [`TRADEMARKS.md`](../../TRADEMARKS.md) separately reserves the marks so a fork cannot present
itself as Peanut or Split. Copyright permission and trademark permission are different things and are
granted separately here on purpose.

**Portraits.** `design/portrait-variants/` — 13 exploration files, referenced by nothing — was
deleted rather than cleared. The two remaining portraits,
`apps/web/public/doodles/portraits/{konrad,hugo}.webp`, are of the two people who wrote this
repository, drawn for it. No source code references them; they survive only in a generated service
worker precache list, so they are candidates for deletion on their own merits.

**Generated SEO content.** The guides are Squirrel Labs Ltd's own writing and ship under `CC-BY-4.0`.
What was removed is the _mechanism_: `.github/workflows/split-content-pull.yml` cloned the private
mono with a deploy key held as a repository secret. That is a credentialed path into a private
repository and must not exist in a public one. Future content updates have to be pushed from mono
rather than pulled from here.

**Dependency SBOM is the one open item.** Notices for the npm and container layers are per-artifact,
not per-commit, so they are generated at release time — see
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

## Before the repository goes public

1. Confirm the Knerd EULA permits redistribution inside a public source tree, or remove the files.
2. Scan every retained ref and the full history for secrets, tokens, and personal data.
3. Rotate `MONO_SPLIT_CONTENT_READ_KEY` and any other secret the repository's history has seen.
4. Generate the dependency SBOM and attach it to the first public build.

A history-free repository would protect private history; it does not cure a notice or ownership
defect, and it is not what this project chose. History stays, which makes step 2 a precondition
rather than a formality.
