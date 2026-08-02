# Peanut Split release states

This is the release-truth companion to the product roadmap. It records what a
word means and stops source code, a deploy, a visible flag and a proven
production loop from being collapsed into “shipped.”

## State vocabulary

Every capability listed here uses exactly one primary state:

- **planned** — approved, with no implementation under way.
- **in progress** — implementation or verification is actively incomplete.
- **code-complete** — merged source and automated checks exist; no deploy is implied.
- **deployed dark** — the code is deployed but unavailable behind its product gate.
- **user-visible** — people can reach it in production; end-to-end quality is not yet proven.
- **production-verified** — the intended production loop has been exercised with recorded evidence.
- **held** — intentionally blocked pending an explicit decision or release gate.
- **retired** — deliberately removed; old documentation is historical only.

States are monotonic only when the evidence is. A regression, disabled flag or
rollback can move a capability back.

## Reconciliation record

- Source base: `9d4b6f5` (`main` on 2026-07-29).
- Working release branch: `feat/product-audit-roadmap`.
- Deployed SHA: **not recorded yet**. Capture it after this branch is deployed.
- Public V2 gate: **off in the 2026-07-29 production audit**.
- Push delivery: UI and delivery infrastructure exist; the required real
  subscribe → notify → open loop on two devices has **not** been recorded.
- `ROADMAP.md` is intentionally unchanged while parallel roadmap work is in
  progress. Its older “live” push wording is not release evidence; this file is
  the release-truth source until that shared document can be reconciled safely.

| Capability                                                  | State               | Evidence / next gate                                                                                                    |
| ----------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Link rooms, identity selection, expense entry and balances  | production-verified | Production audit, 2026-07-29                                                                                            |
| Rich room preview with member, expense and total context    | production-verified | Accepted trust-boundary decision; production audit, 2026-07-29                                                          |
| Landing group-chat handoff                                  | user-visible        | Production/mobile review still precedes a production-verified label                                                     |
| Themes and expense reactions                                | user-visible        | Present on the public room surface                                                                                      |
| Push notifications                                          | user-visible        | Do not call production-verified until the two-device loop passes                                                        |
| Splitwise import                                            | production-verified | Production Chromium + Firefox evidence recorded below, 2026-08-02                                                       |
| Natural-language expense entry                              | deployed dark       | V2 gate is off                                                                                                          |
| Receipt scanning                                            | held                | Consent and real-device gates remain open; do not expose                                                                |
| Payer lifecycle, settlement correction and quiet provenance | code-complete       | Atomic staged payer, narrow cleanup, documentary Peanut receipt and settlement undo are verified on this feature branch |
| Bounded saves and unambiguous amount punctuation            | code-complete       | Timeout/idempotency and locale-aware normalization tests pass on this feature branch                                    |
| Rejected queued-draft repair                                | held                | A durable review/edit/retry/discard state needs the larger V2 recovery UI approved in the audit ruling                  |
| Concurrent expense-edit conflict protection                 | held                | Two-client discovery and a bounded recovery design remain required before implementation                                |
| Landing/accessibility/recent-room recovery                  | code-complete       | Mobile/desktop continuity and reduced-motion checks pass on this feature branch                                         |
| Room-link recovery by paste                                 | code-complete       | Valid links are verified before local save; invalid, unreachable and storage-denied paths are covered                   |
| CSV and JSON room export                                    | production-verified | Production mobile export evidence recorded below, 2026-08-02                                                            |
| Group-chat-ready room share package                         | code-complete       | Chromium and Firefox verify private SVG/text handoff, fallbacks, cleanup and bounded rendered geometry                  |

### Import/export V1 — 2026-08-02

- Deployed SHA: `801e3b5`.
- Chromium exercised a real Splitwise import through the production API and verified the resulting
  room's exact balances, history and creator identity. It also downloaded both CSV and JSON from
  the combined room-settings surface without exposing the room credential.
- Chromium and Firefox verified invalid-file no-write behavior, reduced motion, mixed-currency and
  700-row previews, and confirmed that receipt scanning and natural-language entry remained behind
  their V2 boundary.

## Release reconciliation checklist

Before changing any row to `production-verified`:

1. Record the exact deployed SHA and relevant non-secret public flag states.
2. Exercise the real production journey, not only a local or mocked equivalent.
3. Record browser/device/locale coverage appropriate to the capability.
4. Keep `code-complete`, `deployed dark`, `user-visible` and
   `production-verified` separate in release notes.
5. For push, record subscribe → notify → open on two real devices. Infrastructure
   configuration, a visible opt-in button or a successful unit test is not that evidence.
