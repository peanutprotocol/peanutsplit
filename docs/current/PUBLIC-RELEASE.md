# Public-release plan

## Hard stop and current status

Do not flip the existing private monorepo public or add a root license to it. Its reachable history
and non-web scopes were never cleared for publication. The root package must stay `private: true`,
`UNLICENSED`, and without `LICENSE`.

Prepare a new, history-free `apps/web` upstream from the explicit allowlist only after rights and
build clearance. A clean history prevents disclosure; it is not a substitute for provenance,
notices, or a working corresponding-source distribution.

The current public candidate is **NO-GO**:

- all five human gates remain pending: Squirrel Labs authority, assets, content, third-party
  notices, and the official-host Peanut-reference budget;
- the private source worktree is dirty, so no release candidate can bind to one captured commit;
- the current installed draft reports 33 `TS2307` missing-import diagnostics across 21 included
  files and 16 distinct specifiers, chiefly `src/lib/split-content/*` plus a test importing the
  excluded draft-translation script; those gaps cause another eight `TS7006` diagnostics;
- consequently no clean candidate typecheck/build attestation exists; and
- release-state documents intentionally retain blocking language until those facts change.

Draft generation and audit working is not release approval. Candidate mode remains mechanically and
procedurally blocked until graph closure, a clean build, and every human gate pass. Clearance,
attestation, and independently observed build-commit inputs are authenticated by the trusted release
pipeline and repository ruleset, not by this local JSON tooling.

## Private origin P, public commit Q

The private monorepo commit is **P**. P and its history never enter the public distribution. The
private ledger records P, source paths, exclusions, human evidence, and build details; it stays
external, mode `0600`, and private.

After clearance, a separate fresh repository receives only the audited candidate and exactly one
root commit on `main`: **Q**. It has no configured remotes, private reflog entries, or unreachable or
dangling objects. The public archive and redacted receipt are derived from raw blobs in Q.
Neither contains P or private clearance/build provenance.

## Candidate machinery

The local builder is configured in [`../../public-release/`](../../public-release/README.md). It has
no publish, remote-creation, Git-init, deployment, or repository-visibility operation.

```bash
pnpm public-release:dry-run -- --json

pnpm public-release:draft -- \
  --out /tmp/peanut-split-public-draft \
  --ledger-out /tmp/peanut-split-draft-private-ledger.json

pnpm public-release:audit -- \
  --candidate /tmp/peanut-split-public-draft \
  --ledger /tmp/peanut-split-draft-private-ledger.json

pnpm public-release:attest -- \
  --candidate /tmp/peanut-split-public-draft \
  --ledger /tmp/peanut-split-draft-private-ledger.json \
  --out /tmp/peanut-split-build-attestation.json \
  --verified-by ci/public-candidate

pnpm public-release:candidate -- \
  --out /tmp/peanut-split-public-candidate \
  --ledger-out /tmp/peanut-split-release-private-ledger.json \
  --clearance /tmp/peanut-split-clearance.json \
  --build-attestation /tmp/peanut-split-build-attestation.json
```

Draft mode writes no `LICENSE`, marks the copied web package `UNLICENSED`, and is not deliverable.
Candidate mode accepts only an external inventory-bound clearance record, not the tracked pending
template. It compares every release input directly with the raw bytes and mode in P, including the
private root-package invariant, and rejects unsafe index flags.

The independent audit reads the external private ledger and fails on extra, missing, changed,
configured secret-shaped, symlinked, history-bearing, excluded, or unreviewed inputs. `apps/api`, operations,
private publisher/provenance machinery, adaptive/persona prototype artifacts, press, portraits,
verification files, and private generated SEO inputs are excluded.

The `/source` route, footer link, and public-source upgrade inside the canonical Splitwise comparison
share the fail-closed `NEXT_PUBLIC_FOSS_RELEASED` boundary. The comparison's established safe
“free/no signup” page and sitemap entry remain live; its FOSS metadata, FAQ/schema, OG title, and MDX
regions do not. The builder behaviorally verifies that literal `1` is insufficient without valid
receipt values and keeps `.env.example`, Docker, and Compose values unset. Creating a licensed
candidate does not open the surface.

## Post-publication source receipt

After a controlled pipeline creates Q with the fixed Squirrel Labs identity and safe release
message, it independently observes the build checkout commit. The receipt command requires that
build-commit input and fails unless it equals Q. It also requires exactly one `main` root ref,
compares raw Q blobs/modes with the audited candidate, builds a deterministic archive without
honoring Git attributes or archive configuration, and verifies the archive before writing anything.

```bash
pnpm public-release:receipt -- \
  --candidate /tmp/peanut-split-public-candidate \
  --ledger /tmp/peanut-split-release-private-ledger.json \
  --clearance /tmp/peanut-split-clearance.json \
  --build-attestation /tmp/peanut-split-build-attestation.json \
  --public-checkout /tmp/peanut-split-public-checkout \
  --build-commit REPLACE_WITH_Q \
  --archive-out /tmp/peanut-split-source.tar.gz \
  --archive-url https://releases.example/peanut-split/REPLACE_WITH_Q.tar.gz \
  --out /tmp/PUBLIC_RELEASE_RECEIPT.json
```

The output receipt is public and intentionally minimal: Q, the independently supplied equal build
commit, archive URL/hash, the five deployment values, and hashes/sizes/modes of distributable files.
It contains no P, source paths, exclusions, reviewers, approval dates, evidence, or private build
details. Deployment rules consume this receipt and establish the binding; client code only validates
the complete equal-commit receipt before opening the FOSS surface.

## Stage 1: safe preparation in private

- Maintain the file-level [rights register](RIGHTS-REGISTER.md).
- Produce current architecture, data-model, HTTP, security, and self-host documentation.
- Generate schema and route inventories from source; fail CI on drift.
- Decide the status and publication scope of `apps/api`.
- Replace/exclude uncleared runtime assets and prove a neutral build works.
- Create complete per-source-archive and per-container notices/SBOMs.
- Define one explicit configured public origin and threat-test host/forwarded-header handling.
- Build a private allowlisted export process excluding `ops/`, incident material, private publisher
  mechanisms, verification files, official-host analytics/SEO defaults, adaptive/persona prototype
  artifacts, and unrelated refs.
- Correct the Squirrel Labs maintenance/funding story at its true content sources.
- Regenerate private-mono SEO guides and make `pnpm marketing-copy:audit:all` pass; the authored-only
  audit deliberately cannot clear generated artifacts.
- Approve a counted/approved-surface Peanut-reference budget.
- Draft, but do not publish, the AGPL license, trademark policy, public source page, and first release receipt.

## Stage 2: prerequisites for any public/FOSS claim

- Every included file has documented Squirrel Labs authority or compatible inbound terms.
- The public runtime builds and works without reserved/uncleared brand assets.
- Required third-party notices accompany source archives, browser/container artifacts, and SBOMs.
- Full publication candidate passes secret, PII, internal-identifier, binary-license, and provenance scans.
- Root `LICENSE`, all published manifests, SBOM, notices, and release receipt agree on scope and SPDX.
- Clean-machine build, migration, start, readiness, create/read/export, custom-origin, PWA, and neutral-brand tests pass.
- Expense restore requires appropriate room/member proof, and sanitized-export tests prove that CSV,
  portable JSON, and history exports cannot recover or disclose a live room through alternate IDs or pasted URLs.
- Exact deployed commit and artifact digest map to an immutable corresponding-source archive.
- `SECURITY.md`, private vulnerability reporting, secret scanning/push protection, and support scope are live.
- GitHub Actions default to read; actions are pinned/allowlisted; explicit write remains only where required.
- Production consumes only an exact commit whose artifact gate passed. A controlled sole-maintainer bypass may
  exist for emergencies, but unvalidated direct pushes must not deploy.
- First semantic release, migration notes, support status, notice bundle, SBOM, and freedom receipt are published.
- The private-mono content importer is removed from the public tree or redesigned with public-safe provenance.
- Re-run all remote/ref/history/security checks immediately before launch.

Only after every Stage 2 item passes should the public promise, AGPL fields, source link, and repository
visibility go live.

## GitHub launch settings

Keep Issues for reproducible bugs. Leave Discussions off. Disable Projects unless Squirrel Labs
intends to maintain a public board. Do not create `good first issue`, bounty, contributor-growth, or
community-governance surfaces.

Recommended settings:

- public, history-free upstream with only intended release refs;
- private vulnerability reporting enabled;
- secret scanning and push protection enabled and verified;
- default Actions token read-only, PR approval by Actions disabled;
- external actions limited to reviewed full-SHA references;
- ruleset requiring the actual artifact gate before a commit is deployable;
- issues enabled, wiki/discussions/projects disabled unless deliberately maintained;
- homepage, description, topics, and license metadata set only after the public URLs exist.

## Freedom receipt

The generated public source receipt provides Q, the independently observed equal build commit, the
immutable archive URL and SHA-256, exact distributable file records, and the five deployment values:

- `NEXT_PUBLIC_FOSS_RELEASED=1`;
- `NEXT_PUBLIC_BUILD_COMMIT=Q`;
- `NEXT_PUBLIC_SOURCE_COMMIT=Q`;
- `NEXT_PUBLIC_SOURCE_ARCHIVE_URL=<immutable HTTPS URL containing Q or its archive hash>`; and
- `NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256=<lowercase SHA-256>`.

A deployment attestation may additionally publish artifact, SBOM, notice, migration, and generated
documentation hashes, but those are not fabricated by the source-receipt tool. Neither receipt
proves ownership, complete legal compliance, security, hosted longevity, or maintainer intent.
