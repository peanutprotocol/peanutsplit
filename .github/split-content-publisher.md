# Split content pull publisher

The workflow is operational. Run 31507419125 on 2026-08-11 completed green through both jobs and
produced merged PR #18, which is how the installed artifact got there.

`.github/workflows/split-content-pull.yml` still has no schedule; only a manual dispatch is
possible. Do not add a schedule until the read-only clone, exact branch, exact-SHA CI dispatch,
draft PR, and failure cases have all been observed on GitHub.

**It cannot be dispatched for the 2026-08-13 peanutsplit.com retarget yet.** Dispatch clones mono
`main` and runs `verify-lock` from PeanutSplit `main`, so both branches must first carry the
retarget: mono needs the new guide scheme in `scripts/split-content-mirror.mjs` and its outputs,
and PeanutSplit needs the retargeted publisher plus the re-pinned lock. Until then, mirror and
install locally — mirror to a stage outside mono, then `pack` and `install`.

## Credential and environment

Create one unique Ed25519 deploy key on `peanutprotocol/mono` with **read access only**. Put the
private half in the PeanutSplit Actions environment `split-content-publisher-read` as
`MONO_SPLIT_CONTENT_READ_KEY`; do not create a repository-level secret. Restrict the environment to
PeanutSplit `main`. The key can read all of private mono, not only `split-content/**`, and must never
be reused by another repository or machine.

Record its deploy-key ID, title, fingerprint, owner, creation date, and review date. To rotate it:

1. Add a new read-only public key to mono.
2. Replace the environment secret.
3. Prove a manual no-op or artifact-branch run.
4. Delete the old mono deploy key and confirm it no longer clones.

Emergency revocation is deletion of the mono deploy key followed by disabling the workflow. No
PeanutSplit credential needs rotation because the target write token is job-scoped `GITHUB_TOKEN`.

## Proof before scheduling

1. Confirm the mono key can clone and cannot push.
2. Dispatch from PeanutSplit `main`; dispatching from any other ref must fail.
3. Confirm an unchanged artifact creates no branch or PR.
4. For a changed artifact, confirm the only remote write is
   `automation/split-content-artifacts`, never `main`.
5. Confirm the artifact branch contains only `apps/web/src/generated/seo/**`, the two mirror passes
   are byte-stable, and the commit and draft PR record exact provenance.
6. Confirm the explicitly dispatched `ci.yml` run is bound to the artifact commit and validates the
   real generated bodies through the A3 loader, MDX policy, metadata, link, and build gates.
7. Exercise bad mirror pins, hashes, symlinks, extra files, target-ref races, occupied branch, and red
   CI. Every case must leave `main` and production untouched and must not open a PR.

After a failed run that already created the fixed branch, inspect the run before deleting that
branch. Never force-update it. A human reviews and merges the draft PR; this workflow never approves,
undrafts, auto-merges, or merges it.
