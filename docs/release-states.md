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

| Capability | State | Evidence / next gate |
| --- | --- | --- |
| Link rooms, identity selection, expense entry and balances | production-verified | Production audit, 2026-07-29 |
| Rich room preview with member, expense and total context | production-verified | Accepted trust-boundary decision; production audit, 2026-07-29 |
| Landing group-chat handoff | user-visible | Production/mobile review still precedes a production-verified label |
| Themes and expense reactions | user-visible | Present on the public room surface |
| Push notifications | user-visible | Do not call production-verified until the two-device loop passes |
| Splitwise import | deployed dark | V2 gate is off; integrity gate remains held |
| Natural-language expense entry | deployed dark | V2 gate is off |
| Receipt scanning | held | Consent and real-device gates remain open; do not expose |
| Payer lifecycle, settlement correction and quiet provenance | in progress | Ledger-trust lane on this feature branch |
| Bounded saves and unambiguous amount punctuation | in progress | Resilience lane on this feature branch |
| Landing/accessibility/recent-room recovery | in progress | Continuity lane on this feature branch |
| Room-link recovery by paste | in progress | Continuity lane on this feature branch |
| CSV and JSON room export | code-complete | Feature-branch tests pass; deploy not implied |
| Group-chat-ready room share package | in progress | Continuity lane audits existing surface before changing it |

## Release reconciliation checklist

Before changing any row to `production-verified`:

1. Record the exact deployed SHA and relevant non-secret public flag states.
2. Exercise the real production journey, not only a local or mocked equivalent.
3. Record browser/device/locale coverage appropriate to the capability.
4. Keep `code-complete`, `deployed dark`, `user-visible` and
   `production-verified` separate in release notes.
5. For push, record subscribe → notify → open on two real devices. Infrastructure
   configuration, a visible opt-in button or a successful unit test is not that evidence.

