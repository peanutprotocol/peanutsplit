# Peanut Split FOSS-posture adversarial audit

Target: private `peanutprotocol/peanutsplit` snapshot
`c2ff861f013e8c3f16063ee5c41033f2c0098432`, audited 2026-08-24.

Scope covered repository licensing, provenance/assets, GitHub and release settings, public
maintainer/funder copy, Peanut placement, current architecture/schema/API documentation,
self-hosting, deployment/security claims, data lifecycle, and the requested no-contributor-growth
posture. It did not determine ownership as a matter of law, change repository visibility/settings,
rewrite history, deploy production, or audit the operator's full privacy/compliance program.

Method: three independent read-only finders; deduplication; cross-lens refute-first verification with
a decision kill-list; main-loop source/live-state reproduction for material findings; a creative
solution refinement; and a hostile completeness pass. Raw verdicts are persisted in the adjacent
[JSON file](2026-08-24-foss-posture.json).

## 1. Confirmed

### 1.1 Public licensing is blocked by scope and evidence, not license selection alone — HIGH

**Evidence.** Root and `apps/api` manifests say `UNLICENSED`; `apps/web` has no license field; no
root `LICENSE` exists; GitHub reports a private repository with no detected license. README/spec
history identifies imports from `peanut-ui`, `peanut-api-ts`, and Munin, but the audited tree has no
file-level assignment/relicensing register. Runtime Knerd files have no grant in the tree. Peanut
logos/mascots and portrait/design assets have no public rights boundary. Sniglet lacks its OFL notice,
and Lucide/Feather notice propagation to derived distribution surfaces is incomplete.

**Failure scenario.** Publish the current tree under a blanket AGPL file. A recipient reasonably
treats code and required runtime assets as redistributable, while the tree neither proves the
granting entity's file-level authority nor supplies grants/notices for every required asset.

**Repro status.** Confirmed twice: verifier plus main hand reproduction (`npm pkg get license` returned
`UNLICENSED`, `UNLICENSED`, and `{}`; `LICENSE` was absent; required binary paths and provenance files
were re-opened). This proves missing audited evidence, not that Squirrel Labs lacks rights elsewhere.

**Remedy.** Squirrel Labs—confirmed by the owner as the intended granting entity—must complete the
[rights register](../current/RIGHTS-REGISTER.md), replace/exclude unresolved required assets, propagate
notices, then apply `AGPL-3.0-or-later` consistently. Do not use a custom Peanut rider.

### 1.2 A direct visibility flip exposes private material and unaudited history — HIGH

**Evidence.** `ops/steward/README.md`, `STEWARD-STATE.md`, and `INCIDENTS.md` contain operational
identifiers, internal paths, credential mechanisms, and incident details;
`.github/split-content-publisher.md` documents a private-mono deploy-key mechanism. GitHub exposes 32
branches and one non-release tag. Deleted tip content remains reachable through ancestors/other refs.

**Failure scenario.** Clean the current main-tree tip and switch the existing repository public.
Old commits/branches still expose removed material and unresolved assets; the cleaned tip creates a
false sense that publication was sanitized.

**Repro status.** Confirmed twice: verifier plus main GitHub/ref and file-content checks. No exhaustive
full-object secret/PII/license scan has passed.

**Remedy.** Build a new, history-free upstream from a reviewed allowlist after rights clearance.
Preserve required attribution and provenance separately; fresh history is disclosure control, not
rights clearance.

### 1.3 Current runtime, quickstart, and topology documentation point to incompatible systems — HIGH

**Evidence.** The baseline root README told readers to migrate `apps/api` schema `app` and described a
web-to-Fastify topology. Current Next route handlers import `apps/web/src/server/**`, instantiate the
web Prisma client directly, and use schema `split`. `next.config.js` has no API rewrite. The baseline
web README presented `docs/SPEC.md` as current although that document begins “HISTORICAL BUILD SPEC”
and “DO NOT IMPLEMENT VERBATIM.” Source contains 15 web models, six different API models, and 29 web
route files/36 exported operations.

**Failure scenario.** A clean-clone operator follows the baseline quickstart, creates only schema
`app`, starts the web product, and creates a room. Next queries missing `split.Room`/related tables;
an integrator following the old spec also omits current routes and fields.

**Repro status.** Confirmed twice: verifier plus main route/rewrite/schema counts and direct-import
inspection.

**Remedy.** The new current docs identify `apps/web` as the proven live path and leave `apps/api`
status as an explicit maintainer ruling. Generated model/route inventories now fail on drift.

### 1.4 The supplied self-host path was overclaimed and internally inconsistent — HIGH

**Evidence.** Baseline README described internal networking, default-deny egress, resource limits,
and `DATABASE_URL` as the only secret. Rendered Compose has an ordinary egress-capable network,
publishes the app and development database, and defines no resource limit/proxy. Optional VAPID and
model-provider keys are secrets too. PostHog/Sentry browser values are supplied at runtime instead of
build time, with `SENTRY_DSN` mismatching `NEXT_PUBLIC_SENTRY_DSN`. `.env.example`, Compose, and
Dockerfile disagree across other optional variables.

**Failure scenario.** An operator runs the advertised “full stack,” assumes official-host containment,
exposes port 5433 or permits arbitrary egress, and believes client telemetry/model configuration is
active or non-sensitive when it is not.

**Repro status.** Confirmed twice: verifier plus main `docker compose config` and source inspection.
The Dockerfile's non-root user is one real partial control; it does not supply the missing controls.

**Remedy.** Current self-host docs now distinguish the development/reference stack from official-host
controls and require a source-derived environment contract before a production-ready claim.

### 1.5 Custom-origin, v2, and scaling contracts are not reliable — MEDIUM

**Evidence.** In production, `pwa-manifest.ts` accepts only `peanutsplit.com`; the manifest route
returns 404 otherwise. `Dockerfile` hardcodes `NEXT_PUBLIC_SPLIT_V2_ENABLED=1` even when Compose passes
`0`, contradicting `.env.example`. SSE and rate-limit state are process-local, while prior operator
docs did not specify a single-replica invariant.

**Failure scenario.** A self-hoster sets `https://split.example.org`, disables v2, and scales to two
replicas. The PWA manifest disappears, v2 remains enabled, cross-replica SSE wakes are missed until
polling, and rate-limit allowances multiply.

**Repro status.** Confirmed twice: verifier plus main source/config reproduction; Compose visibly
passes `0` while Docker replaces it with `1`.

**Remedy.** Use an explicit build-time public origin—not arbitrary Host-derived authority—with hostile
proxy/host tests; repair the v2 contract; keep one replica until shared stores exist.

### 1.6 Data deletion, retention, and exports lack one current operator contract — MEDIUM

**Evidence.** Existing historical/design files document pieces, so “undocumented” was refuted. But
current facts are fragmented: expenses and settlements soft-delete; audit snapshots are append-only;
feedback is pruned after 90 days; handoffs expire; room/ledger data has no general expiry; snapshot,
portable, history, and database exports have different scope; no whole-room erasure workflow exists.

**Failure scenario.** A user/operator interprets DELETE or portable JSON as erasure/complete backup,
while soft-deleted and audit data remains or operational state is omitted.

**Repro status.** Narrowed by verifier, then confirmed by main source review as fragmentation rather
than total absence.

**Remedy.** The new data-model and security docs consolidate current behavior. A real privacy policy,
operator obligations, and erasure decision remain publication work.

### 1.7 The public maintenance/funding explanation contradicts the owner ruling — MEDIUM

**Evidence.** Landing copy says “Peanut built Split” and funds it by introducing people to Peanut;
`product-truths.md`, authored pages, and generated guides repeat that model, while the footer names
Squirrel Labs. The owner confirmed Squirrel Labs as the current sole maintainer/funder and correct
entity. This ruling does not resolve historical authorship of every contribution.

**Failure scenario.** A visitor uses the official “who made/funds this” explanation and receives a
different maintainer/funder than the project owner specifies; the repository's future license and
support surfaces then contradict the product.

**Repro status.** Confirmed twice: verifier plus main content search. The generated guide copies trace
to a separate private-mono input pipeline, so hand-editing generated output was deliberately avoided.

**Remedy.** Update the true content inputs in a separate source-first content change; regenerate all
affected pages; state Squirrel maintenance/funding without claiming unverified original authorship or
whole-tree ownership. Define contextual Peanut references separately from “ads.”

### 1.8 A source link is an AGPL release prerequisite and must identify deployed source — MEDIUM

**Evidence.** The running baseline has no source/license discovery link. No public release or semver
tag exists; the only tag is `icon-final`. A future generic mutable-main link can move independently
of deployed commit `D`, returning commit `M` instead of Corresponding Source for `D`.

**Failure scenario.** Publish/deploy under AGPL, then advance main without deploying. A network user
clicks Source and receives the wrong version.

**Repro status.** Confirmed twice: verifier checked AGPL section 13; main verified the absent source
surface/release inventory. This is a conditional publication prerequisite, not a present AGPL breach:
the baseline is unlicensed.

**Remedy.** Embed the deployed commit/artifact digest, publish an immutable complete source archive,
and offer that exact source prominently. A hidden or drifting legal link is insufficient.

### 1.9 GitHub-to-production controls do not match a public upstream threat model — HIGH

**Evidence.** Main has no branch protection or ruleset. Baseline repository rules say direct pushes
deploy to production in about five minutes and CI is advisory. Security reporting is absent; private
reporting, secret scanning/push protection, code security, and security updates were disabled in the
private-repo API snapshot. Actions defaults allow all actions, do not enforce SHA pins, and grant
write by default.

**Failure scenario.** A compromised or accidental maintainer push reaches production regardless of a
red check; a researcher has no repository-native private route; a future workflow omits permissions
and runs a mutable third-party action with write authority.

**Repro status.** Confirmed twice: verifier plus main GitHub API checks. Reassuringly, current checked
workflows explicitly request narrow permissions and every external action is pinned to a full SHA.

**Remedy.** Bind deploy to an exact commit whose real artifact gate passed; allow a controlled
sole-maintainer emergency bypass if desired. Enable/verify private reporting and secret controls at
launch; set Actions defaults read-only and enforce reviewed SHA-pinned actions. This is a workflow
change, not a generic FOSS requirement.

### 1.10 Source archives include stale tracked bytecode — LOW

**Evidence.** Two tracked `design/doodles/__pycache__/*.pyc` files contain local workspace paths and
are included by `git archive`; baseline `.gitignore` did not exclude Python cache files.

**Failure scenario.** A source release contains CPython-specific stale binaries and internal paths
that have no release value.

**Repro status.** Confirmed twice: verifier plus main `git ls-files`/`strings` check.

**Remedy.** Cache patterns are now ignored; remove the already tracked binaries when constructing the
public allowlist/snapshot.

## 2. Refuted with evidence

1. **“FX connected/static behavior is wholly undocumented.”** Refuted. Baseline `.env.example`
   documents static mode and README documents the proxy-failure/static-table path. A narrower
   environment-inventory gap survives (`SPLIT_FX_ENDPOINT` and precedence details).
2. **“Deletion and retention are wholly undocumented.”** Refuted. Historical/design/roadmap docs cover
   expense soft deletion, handoff expiry, former-member history, and feedback retention. The surviving
   defect is fragmentation and missing current operator policy.
3. **“The current footer provably violates a small-number Peanut budget.”** Refuted. Logo plus four
   links was reproduced, but no measurable current budget exists, so violation cannot be adjudicated.
4. **“Historical exactly-two Peanut placements is a current ruling.”** Refuted. `SPEC.md` is historical,
   with no named human/date/rationale establishing that line as a present decision. It is design evidence.
5. **“Missing license/maintainer/codeRepository JSON-LD is a correctness defect.”** Refuted. The fields
   can improve transparency after release, but no consumer failure was reproduced; `codeRepository`
   belongs on a linked `SoftwareSourceCode` node rather than directly on `SoftwareApplication`.

## 3. By design — do not fix

1. **FOSS does not guarantee the official host's lifetime or price.** The governing ruling is durable
   freedom for released software without unverifiable hosted-deployment guarantees. Safe wording says
   already released AGPL versions keep their license rights; it does not promise every future release
   or `peanutsplit.com` forever.
2. **Do not optimize for external contributors.** FOSS rights do not require Discussions, public
   boards, `good first issue`, bounties, contributor KPIs, councils, or accepting patches. Keep a lean
   bug channel and private security route without a response/merge SLA.

## 4. Reassuring negatives

- The pinned audit worktree stayed clean after every agent wave; no agent mutated the target snapshot.
- Current Next room routes directly import web server/database modules, and no current Next rewrite
  points at Fastify. This positively establishes the documented current request path.
- The Dockerfile runs the application as a non-root user, although the reference stack lacks other
  claimed containment controls.
- Current checked workflows declare narrow permissions and pin external actions to 40-character SHAs,
  despite unsafe repository defaults for future workflows.
- `pnpm licenses list` reported dependency metadata only in MIT, ISC, Apache-2.0, BSD-2/3,
  CC-BY-4.0, OFL-adjacent, and dual MIT/CC0 families. This is not a provenance, asset, container, or
  complete legal-clearance result.
- A limited head-tree regex check found no obvious private-key blocks or high-confidence provider
  tokens. No dedicated full-history/binary scanner was installed, so this is not launch clearance.

## 5. Open rulings

1. **File-level authority.** Squirrel Labs is confirmed as the correct granting entity. Default:
   no effective license/publication until every included corpus has authority/inbound evidence.
2. **`apps/api` status.** Source proves it is not on the current web request path, not whether it is
   legacy. Recommendation/default: exclude it from the first public release unless Squirrel Labs
   explicitly chooses and clears separate inclusion.
3. **Peanut reference budget.** Recommendation/default: one equal, user-initiated Peanut settlement
   option; a dedicated stewardship explanation with at most two mentions/one link; and a text-only
   global “Source & stewardship” internal link. Zero logo/nav/ribbon/modal/nag/feature-gate placements.
4. **Direct-main workflow.** A deploy gate conflicts with the recorded fast direct-push practice.
   Recommendation/default: protect the deploy artifact, not ceremony—sole-maintainer bypass allowed,
   but production never consumes an unvalidated SHA.
5. **Hosted “free forever” and “no ads.”** Current copy makes absolute claims while contextual Peanut
   exposure funds the service. Recommendation/default: separate current hosted price policy, released
   software freedoms, and bounded first-party references; avoid lifetime/“no ads” claims that the
   mechanism contradicts.
6. **`-or-later`.** Recommendation/default: `AGPL-3.0-or-later`; Squirrel Labs should explicitly sign
   off on delegating later-version choice before applying SPDX metadata.
7. **Privacy/operator responsibility.** The new technical docs describe stored data and subprocessors,
   but official-host privacy claims, user erasure, self-host controller obligations, and jurisdictional
   review remain outside this code audit. Default: no completeness claim before separate review.

Private-safe changes made after the pinned baseline: current documentation spine, generated
schema/route inventories and CI drift check, Squirrel stewardship/maintainer/interaction/security
drafts, licensing comparison, rights register, public-release gate, and minimal bug-report form. No
license grant, visibility/settings change, history rewrite, live source link, or deployment occurred.

## 6. Post-implementation verification addendum

This delta review is separate from the pinned-snapshot verdict counts below; the original stats are
unchanged. The verdict is **private preparation only** and **NO-GO for deployment or public/FOSS
launch**.

1. **Entity ruling applied.** The exact confirmed entity name is **Squirrel Labs**. No legal-form
   suffix is inferred. Current landing, maintainer, stewardship, funding, feedback-recipient, and
   licensing-draft text uses that name. File-level authority remains unresolved.
2. **Current documentation is source-checked.** Architecture, schema/data model, HTTP surface,
   security/data lifecycle, self-hosting, testing, licensing, rights, and public-release documents
   now form one current index. The TypeScript-AST generator rejects parse, duplicate-method, and
   unregistered-route drift. `pnpm docs:check` passes.
3. **Copy and SEO blocker resolved at source.** The private mono source pipeline was corrected first;
   all 16 affected artifacts were regenerated and mirrored byte-for-byte. Hosted price and released
   software freedom are separate claims, “Split by Peanut” and wrong Peanut maintainer/funder claims
   are retired, and `marketing-copy:audit:all` is clean. FOSS intent is consolidated into the one
   substantive Splitwise comparison in English, Spanish, and Portuguese rather than doorway pages.
4. **Positive claims fail closed.** `/source`, the three comparison routes, their sitemap entries,
   and the footer link require the same literal release flag and complete corresponding-source
   receipt. A hand reproduction with blank receipt fields returned 404/noindex with no claim text;
   a complete synthetic receipt returned 200 with exact commit/archive fields. The application
   validates syntax and equality only; release audit and deployment controls must establish that the
   embedded values are truthful.
5. **Restore and export blockers resolved.** Expense restore moved behind both room slug and expense
   id, with a mismatched-room 404/no-mutation regression. Portable JSON, CSV, and history exports now
   remove credential-shaped fields and raw, case-varied, and percent-encoded room capabilities while
   preserving ledger identifiers, relationships, balances, and totals. Documentation still states
   that these exports contain personal and financial history and are not anonymized support files.
6. **Fork-safe origin behavior improved.** One strict configured origin now owns metadata, share
   links, PWA authority, handoff checks, and compatibility redirects; credentials, paths, queries,
   fragments, ambiguous authorities, public HTTP, and request-host reflection are rejected. Compose
   defaults to noindex and static FX. The official-host Docker v2 default and production hardening
   remain documented work rather than being represented as neutral or turnkey.
7. **Reference budget implemented and counted.** The global footer has no Peanut logo or outbound
   Peanut link. The approved runtime placements are one equal, user-initiated settlement destination
   and one outbound link in the dedicated stewardship explanation; neither is forced, preselected,
   recurring, or a license condition. Regression tests count those surfaces.
8. **No contributor-growth theatre added.** The repository offers a bounded bug form and private
   security path, while explicitly declining feature-PR solicitation, response/merge SLAs,
   Discussions, public roadmaps, bounties, and “good first issue” machinery.
9. **History-free release tooling is intentionally non-publishing.** The allowlisted draft builder,
   independent audit, clearance register, build-attestation command, and external receipt command
   have no Git initialization, remote creation, visibility, push, merge, or deploy operation. The
   private repository stays `UNLICENSED` with no root `LICENSE`; only a fully cleared candidate may
   receive the checksum-pinned AGPL text.
10. **Release remains NO-GO.** Squirrel Labs authority, asset/content rights, notices/SBOM, and a
    clean build are not cleared. The current filtered draft has unresolved imports because the
    private generated-content subsystem is excluded. Candidate mode must remain hard-blocked until
    an allowlisted tree passes its exact clean-build attestation and every named clearance gate.

`found 37 · refuted 5 (13.5%) · killed-by-kill-list 3 · overturned-by-hand 0`
