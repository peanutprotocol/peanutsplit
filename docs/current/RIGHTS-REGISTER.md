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
| Knerd font files                                  | Any-Type Foundry typeface, licensed for use only   | Deleted before publication and gitignored; see below           | Resolved |
| Peanut logo, mascots, background, illustration    | Byte-identical to peanut-ui blobs, runtime imports | `CC-BY-4.0` grant, trademarks reserved separately              | Resolved |
| Portraits and generated portrait variants         | Two founder portraits; 13 exploration variants     | Variants deleted; the two founder portraits stay, see below    | Resolved |
| PWA/OG/favicon/background/badge assets            | Tracked generated assets                           | `CC-BY-4.0` as Squirrel Labs Ltd work                          | Resolved |
| Authored product content and translations         | Multiple authors, one owner                        | `CC-BY-4.0`                                                    | Resolved |
| Generated SEO content from the private mono       | Manifests name a private source commit             | Squirrel Labs Ltd content under `CC-BY-4.0`; publisher removed | Resolved |
| Competitor quotations, screenshots, names         | Comparison and alternatives surfaces               | Excluded from the grant; nominative use only                   | Resolved |
| Currency and static-rate data                     | Source files and runtime tables                    | Squirrel Labs Ltd compilation; AGPL with the code              | Resolved |
| Dependencies and container packages               | Lockfiles and base image                           | Own licenses; per-build SBOM before shipping an artifact       | Open     |

## Notes on the entries that are not a plain grant

**Knerd is out of the tree.** The typeface is **Any-Type Foundry's** (confirmed by the project owner,
2026-09-01). Squirrel Labs Ltd bought a license to _use_ it, which is not a right to sublicense.
Knerd is sold through Creative Market, Creative Fabrica, YouWorkForThem and the foundry's own
Gumroad; Creative Market's font terms prohibit redistributing a font with a website's source code and
prohibit sharing it so a third party can download or extract the file. A public repository does both,
and git history is permanent, so the five Knerd files were **deleted before publication** and the
paths are gitignored.

The site therefore renders its display face in Roboto until a replacement lands: share cards, recap
and achievement card art, and the control-variant hero. `apps/web/src/server/og/fonts.ts` falls back
rather than failing, so nothing breaks. A replacement openly licensed display face was being chosen
at the time of publication (1 Sep 2026) and is the fix.

To restore the official look before then, drop a licensed copy into `apps/web/public/fonts/` — it is
gitignored and cannot be committed by accident. Redistributing it still needs written permission from
Any-Type Foundry.

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

1. ~~Remove Knerd.~~ Done — the files are deleted and gitignored.
2. ~~Scan every retained ref and the full history for secrets, tokens, and personal data.~~ Done,
   1 Sep 2026: 6,319 blobs across all refs. Every match was a `localhost` development or CI database
   URL. No `.env`, key, certificate or credentials file was ever added, and the
   `MONO_SPLIT_CONTENT_READ_KEY` value was never committed — it existed only as a GitHub environment
   secret reference.
3. Delete the now-unused `MONO_SPLIT_CONTENT_READ_KEY` environment secret and its
   `split-content-publisher-read` environment. Its workflow is gone, so the key is dead weight rather
   than an exposure.
4. `ops/steward/` — the box-resident supervisor's incident log — was **purged from every branch's
   history** before publication (1 Sep 2026, `git filter-repo`). It named Hetzner paths, bot token
   scopes and production monitoring gaps. Two loose ends: `refs/pull/26/head` is server-side and
   still carries it, so ask GitHub Support to garbage-collect unreachable objects; and the supervisor
   on the box must stop committing that directory — its next push would put it back. The path is
   gitignored, and the history rewrite makes its existing clone diverge, so it fails safe until then.
5. Generate the dependency SBOM and attach it to the first public build.
6. Triage the 79 Dependabot alerts (44 high) that became publicly visible on publication.

A history-free repository would protect private history; it does not cure a notice or ownership
defect, and it is not what this project chose. History stays, which makes step 2 a precondition
rather than a formality.
