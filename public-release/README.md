# History-free public-release candidate

This directory configures a local, history-free export of `apps/web`. It never changes repository
visibility, creates a remote, pushes, publishes a package, deploys, or licenses the current private
repository.

The private source repository must remain `private: true`, `license: UNLICENSED`, and without a root
`LICENSE`. Only a separately cleared candidate can receive `AGPL-3.0-or-later` package metadata and
the exact GNU AGPLv3 text.

## Draft, audit, and attestation

```bash
# Inspect the plan without writing files.
pnpm public-release:dry-run -- --json

# Build an unlicensed draft and a separate private ledger.
pnpm public-release:draft -- \
  --out /tmp/peanut-split-public-draft \
  --ledger-out /tmp/peanut-split-draft-private-ledger.json

# Re-audit the draft against its private source and external ledger.
pnpm public-release:audit -- \
  --candidate /tmp/peanut-split-public-draft \
  --ledger /tmp/peanut-split-draft-private-ledger.json

# On a trusted clean runner, prove install, typecheck, FOSS tests, and build.
pnpm public-release:attest -- \
  --candidate /tmp/peanut-split-public-draft \
  --ledger /tmp/peanut-split-draft-private-ledger.json \
  --out /tmp/peanut-split-build-attestation.json \
  --verified-by ci/public-candidate
```

The private ledger contains the private origin commit, source paths, exclusions, clearance evidence,
and build details. It is mode `0600`, must stay outside both trees, and must never be copied into a
candidate, source archive, or public repository. A draft has no `LICENSE`, keeps the copied package
`UNLICENSED`, and is not deliverable.

Release-candidate mode requires a clean source commit; an external, inventory-bound build
attestation; and named, dated, evidenced human clearance for Squirrel Labs authority, assets,
content, third-party notices, and the official host's Peanut-reference budget:

```bash
pnpm public-release:candidate -- \
  --out /tmp/peanut-split-public-candidate \
  --ledger-out /tmp/peanut-split-release-private-ledger.json \
  --clearance /tmp/peanut-split-clearance.json \
  --build-attestation /tmp/peanut-split-build-attestation.json
```

This remains a local operation. It fails closed while any gate, release-state document, source-byte
binding, or clean build is unresolved.

## Boundary and FOSS flag

`allowlist.json` names every included file or directory. Every media/font asset is also named as an
exact file. Hard exclusions win over directory entries: `apps/api`, Git history, environments and
build output, private publisher/provenance machinery, adaptive/persona prototype artifacts, press
material, portraits, and private generated SEO inputs.

The `/source`, footer, sitemap, and comparison-copy surfaces share the fail-closed
`NEXT_PUBLIC_FOSS_RELEASED` boundary. The builder behaviorally verifies that only literal `1` plus a
valid immutable source receipt opens it. `.env.example`, Docker, and Compose leave all five receipt
variables unset. Building a candidate never opens the flag.

The independent audit reads the external private ledger and rejects extra, missing, changed,
configured secret-shaped, symlinked, untracked, index-hidden, or excluded inputs. Release inputs are compared
byte-for-byte and mode-for-mode with raw blobs in the captured private commit.

## Public commit, archive, and redacted receipt

After a licensed candidate passes every gate, a separate controlled pipeline may copy it into a
fresh Git repository and create exactly one root commit on `main`. That public commit uses the fixed
identity `Squirrel Labs <opensource@peanutsplit.com>`, UTC, no signature, and message
`release: Peanut Split public source`.

The receipt command accepts that separate checkout, rejects configured remotes, non-release reflog
entries, and unreachable or dangling Git objects, verifies its raw commit tree equals the audited
candidate, creates and re-verifies a deterministic source archive without Git archive filters, and
writes a minimal public receipt:

```bash
pnpm public-release:receipt -- \
  --candidate /tmp/peanut-split-public-candidate \
  --ledger /tmp/peanut-split-release-private-ledger.json \
  --clearance /tmp/peanut-split-clearance.json \
  --build-attestation /tmp/peanut-split-build-attestation.json \
  --public-checkout /tmp/peanut-split-public-checkout \
  --build-commit REPLACE_WITH_PUBLIC_COMMIT \
  --archive-out /tmp/peanut-split-source.tar.gz \
  --archive-url https://releases.example/peanut-split/REPLACE_WITH_PUBLIC_COMMIT.tar.gz \
  --out /tmp/PUBLIC_RELEASE_RECEIPT.json
```

The public receipt contains only the public root commit, archive URL/hash, runtime receipt values,
and distributable file hashes. It deliberately omits the private commit, reviewer/evidence data,
source paths, exclusions, and private build ledger. Release/deployment rules—not client code—must
bind the independently observed build commit to that audited public-source commit before setting
`NEXT_PUBLIC_FOSS_RELEASED=1`.

The pinned license is the unmodified text published by GNU at
<https://www.gnu.org/licenses/agpl-3.0.txt>. Its required SHA-256 is
`0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`.
