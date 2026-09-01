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
| Gluten display face                               | Upstream `OFL.txt` names the authors and the OFL   | `OFL-1.1-no-RFN`; loaded from packages, no file committed      | Resolved |
| Peanut logo, mascots, background, illustration    | Byte-identical to peanut-ui blobs, runtime imports | `CC-BY-4.0` grant, trademarks reserved separately              | Resolved |
| Portraits and generated portrait variants         | Two founder portraits; 13 exploration variants     | Variants deleted; the two founder portraits stay, see below    | Resolved |
| PWA/OG/favicon/background/badge assets            | Tracked generated assets                           | `CC-BY-4.0` as Squirrel Labs Ltd work                          | Resolved |
| Authored product content and translations         | Multiple authors, one owner                        | `CC-BY-4.0`                                                    | Resolved |
| Generated SEO content from the private mono       | Manifests name a private source commit             | Squirrel Labs Ltd content under `CC-BY-4.0`; publisher removed | Resolved |
| Competitor quotations, screenshots, names         | Comparison and alternatives surfaces               | Excluded from the grant; nominative use only                   | Resolved |
| Currency and static-rate data                     | Source files and runtime tables                    | Squirrel Labs Ltd compilation; AGPL with the code              | Resolved |
| Dependencies and container packages               | Lockfiles and base image                           | Own licenses; per-build SBOM before shipping an artifact       | Open     |

## Notes on the entries that are not a plain grant

**The display face is Gluten, under the OFL.** The CSS side loads it through `next/font/google`; the
Open Graph rasteriser loads it from the `@fontsource/gluten` package. No Gluten file is committed, so
this repository redistributes no display-font binary. The copyright line is in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) and the license text in
[`LICENSES/OFL-1.1-no-RFN.txt`](../../LICENSES/OFL-1.1-no-RFN.txt).

**The display face used to be proprietary.** Until 1 Sep 2026 it was Knerd, a commercial typeface by
Any-Type Foundry. Squirrel Labs Ltd bought a license to _use_ it, which is not a right to sublicense,
so the five Knerd files were deleted before publication. They were never published from this
repository, and Gluten replaced them the same day. Nothing here needs a Knerd license.

**`ops/steward/` stays in this repository.** The box-resident supervisor's incident log stays, by the
owner's ruling of 1 Sep 2026 and by the original design: the ax41 box holds no mono credential and
should not get one, so a `peanutsplit`-scoped token pushing here is the only route its record has. It
was briefly purged from history that day and restored; the rewrite stands, so the box's clone
diverges and needs a re-fetch. Nothing in it is a credential. **Standing rule for future entries: do
not publish an unfixed security finding while it is still exploitable — record it by reference and
write it up here once it is fixed.**

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

**Dependency notices are per-artifact.** Notices for the npm and container layers are per-artifact,
not per-commit, so they are generated at release time — see
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

## Publication work

### Done before the repository went public, 1 Sep 2026

1. Removed the proprietary display face. The Knerd files were deleted, and Gluten replaced them under
   the OFL.
2. Scanned every retained ref and the full history for secrets, tokens, and personal data: 6,319
   blobs across all refs. Every match was a `localhost` development or CI database URL. No `.env`,
   key, certificate or credentials file was ever added, and the `MONO_SPLIT_CONTENT_READ_KEY` value
   was never committed — it existed only as a GitHub environment secret reference.
3. Deleted the now-unused `MONO_SPLIT_CONTENT_READ_KEY` environment secret and its
   `split-content-publisher-read` environment. Its workflow was already gone, so the key was dead
   weight rather than an exposure.
4. Inventoried every dependency licence in
   [`THIRD_PARTY_LICENSES.md`](../../THIRD_PARTY_LICENSES.md) — 915 packages, 15 licence classes
   across both lockfiles. `pnpm licenses:check` runs in the test script, so it cannot drift from the
   lockfiles. Nothing there is incompatible with the AGPL grant; the two entries worth knowing about
   are called out in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

### Still open

1. Ask GitHub Support to garbage-collect `refs/pull/26/head`. That ref survives the history rewrite
   and still carries an older copy of `ops/steward`.
2. Finish the Dependabot backlog. Upgrading `next` to 16.2.11 cleared 44 of the 79 alerts; the rest
   are `fastify`, `undici`, `postcss`, `nanoid` and `brace-expansion`, mostly transitive.
3. Wire `NEXT_PUBLIC_BUILD_COMMIT` to the commit Dokploy actually builds, then set
   `NEXT_PUBLIC_FOSS_RELEASED=1`. Both are build args. **A hand-set commit goes stale on the next
   deploy**, and `/source` would then link the wrong tree while calling it the exact deployed
   commit, which is worse than not making the claim. If Dokploy cannot inject the SHA per build,
   link the branch and drop the word "exact" instead.
4. A formal CycloneDX or SPDX SBOM, if a partner or store listing ever asks for one. The notice
   bundle above is what the licences themselves require; an SBOM is a different artifact.

A history-free repository would protect private history; it does not cure a notice or ownership
defect, and it is not what this project chose. History stays, which made the secret scan a
precondition rather than a formality.
