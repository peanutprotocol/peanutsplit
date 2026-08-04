import type { AuditRecommendation } from './audit-model'

/**
 * Opinionated pre-user triage.
 *
 * This is an experimental, near-zero-user product. Fix inexpensive first-room
 * correctness and UX; invest early in bounded code simplification that makes
 * experiments easier; require mockups for broad visual/flow changes; defer
 * production machinery until roughly 1,000 rooms or a measured bottleneck.
 */
export const auditRecommendations = {
    'OPS-01': {
        decision: 'defer',
        note: 'Leadership decision recorded 2026-08-04: pushing to main should deploy directly. Do not add branch protection, required pull requests, or an immutable-artifact project to the roadmap. Revisit deployment gating only once Peanut Split has tens of thousands of users.',
    },
    'SEC-02': {
        decision: 'fix-now',
        note: 'Implemented for new rooms: readable stem plus a 128-bit opaque tail. Legacy weak links remain compatible as an explicit residual risk; do not rotate them through a hidden link-breaking migration.',
    },
    'SEC-03': {
        decision: 'fix-now',
        note: 'Implemented with the documented hard envelope, five-import process-local budget, configuration kill switch and O(n) audit snapshot construction. The IP bucket remains a courtesy layer; distributed quotas stay deferred.',
    },
    'ARCH-01': {
        decision: 'defer',
        note: 'Mark Next as authoritative and freeze Fastify, but do not schedule an XL retirement project. Delete legacy pieces opportunistically when real product work touches them. Reopen if the duplicate tree causes a wrong-target change, repeated work, or after roughly 1,000 rooms.',
    },
    'OPS-02': {
        decision: 'disagree',
        note: 'Remove this from the roadmap: the latest clean main CI run completed all 1,852 tests and the build successfully, so the claimed fresh-run failure is not reproduced. Reopen only with a failing clean run or proof that database-backed tests are silently skipped.',
    },
    'A11Y-01': {
        decision: 'fix-now',
        note: 'Implemented centrally: a 2px offset ink outline on light surfaces and the white inverse on explicit dark surfaces. Resting UI is unchanged.',
    },
    'A11Y-02': {
        decision: 'defer',
        note: 'Leadership chose Keep current in the UX review. Do not migrate target sizes or add an IconButton now; reopen only with a concrete usability problem or a future reviewed density pass.',
    },
    'A11Y-03': {
        decision: 'fix-now',
        note: 'Implemented to the revised decision: improve contrast through the shared n-3 recipe without changing placeholder wording, field hierarchy or flow.',
    },
    'A11Y-04': {
        decision: 'fix-now',
        note: 'Implemented through one headless roving helper across doodle, avatar, payer and split-mode groups. Visuals and click-close behavior are unchanged.',
    },
    'I18N-01': {
        decision: 'plan',
        note: 'Finish catalog localization if Spanish and Portuguese remain launch commitments. Keep the work bounded to stable translation keys and accessibility labels.',
        priorConflict: {
            decision: 'Defer',
            explanation:
                'This now conflicts with the Peanut-domain localized-SEO decision. If localized acquisition is launch scope, product catalog and accessibility labels cannot remain partly English.',
        },
    },
    'PERF-01': {
        decision: 'plan',
        note: 'The doodle payload is measured mobile UX debt. Chunk or lazy-load the catalog and add a bundle/precache budget in a bounded refactor.',
    },
    'PERF-02': {
        decision: 'defer',
        note: 'Full-ledger synchronization is acceptable before large rooms exist. Reopen at a measured payload, query-latency, expense-count, or polling-load threshold.',
        priorConflict: {
            decision: 'Plan',
            explanation:
                'A snapshot/delta ledger rewrite is the clearest overengineering risk in the sheet. Keep the finding documented, but do not design the replacement until room size or latency crosses a measured threshold.',
        },
    },
    'SEC-04': {
        decision: 'fix-now',
        note: 'Implemented: private, no-store is the JSON default, room/history client reads opt out of caching and focused tests cover behavior and public overrides.',
    },
    'DATA-01': {
        decision: 'defer',
        note: 'Keep the anonymous-managed direction documented, but do not design retention, partitioning, expiry, or deletion UI yet. Reopen at roughly 1,000 rooms, the first genuine erasure request, a concrete legal obligation, or measured audit-table growth. Mockups remain mandatory when the visible flow reopens.',
    },
    'QUAL-01': {
        decision: 'fix-now',
        note: 'Partly implemented without a dependency project: formatting is named honestly and lint now includes a source-aware Tailwind/test-selector audit. Defer Hooks/a11y lint until a real defect justifies a ratcheted baseline.',
    },
    'QUAL-02': {
        decision: 'defer',
        note: "Keep the existing Playwright journeys runnable, but do not create a browser CI program while main intentionally deploys directly. Release QA passed 20/23 focused Firefox checks; the other three use an invalid iPhone-descriptor/Firefox combination and fail only at viewport resizing or synthetic drag/long-press input. Before claiming Firefox mobile coverage, use native Desktop Firefox with a narrow viewport, isolate gesture checks, and spot-check real hardware. Reopen after an escaped browser-only critical-flow regression, recurring manual-test pain, or around 1,000 rooms.",
    },
    'DS-01': {
        decision: 'defer',
        note: 'Do not schedule a 1,300-line CSS-module migration for architectural neatness. Move affected rules opportunistically during the next substantial landing experiment, or reopen on a real selector collision or measured CSS/CWV cost.',
    },
    'ARCH-02': {
        decision: 'plan',
        note: 'Two bounded slices implemented: composer/date/action-zone views are isolated with parity, and one tested reducer owns all ephemeral workflow state and reset. Continue with payer/split orchestration only in focused passes; the drawer remains large and visual changes still require mockups.',
    },
    'ARCH-03': {
        decision: 'plan',
        note: 'Implemented: the 830-line module is a 47-line compatibility barrel over independent read, offline and mutation domains. Existing imports, cache keys and behavior remain unchanged.',
    },
    'PERF-03': {
        decision: 'plan',
        note: 'Conditional SEO work, not provider-stack cleanup for its own sake. Use the smallest coarse route split needed to make indexed pages static, or reopen on measured public-route JS/TTFB harm.',
    },
    'DS-02': {
        decision: 'plan',
        note: 'First bounded cleanup implemented: unused gray/yellow/black and duplicate four-pixel surface aliases are removed mechanically. Stop before broad grey/n churn without product work.',
    },
    'DS-03': {
        decision: 'plan',
        note: 'Implemented for the proven rule-of-three composer family across room creation, expenses and tools. Do not generalize unrelated white cards.',
    },
    'DS-04': {
        decision: 'fix-now',
        note: 'Drawer class shims are folded into owner defaults with parity. Button-size overrides remain until the 44px TARGETS mockup is reviewed because that fold visibly changes density.',
    },
    'DS-05': {
        decision: 'defer',
        note: 'Do not standardize every drawer without evidence that inconsistency hurts the experiment. Reopen for a concrete scroll/safe-area defect or a deliberate drawer UX initiative; representative mockups remain required then.',
    },
    'DS-06': {
        decision: 'plan',
        note: 'Implemented with a server-safe shared style recipe, typed width intent and explicit non-interactive styling for decorative inner spans. Anchor semantics remain intact.',
    },
    'DS-07': {
        decision: 'fix-now',
        note: 'Implemented: both invalid names use reviewed tokens and classes:audit now validates named radius, shadow and z-index scales.',
    },
    'I18N-02': {
        decision: 'fix-now',
        note: 'Implemented: missing codes are translated in all three catalogs and one AST contract test compares literal server emissions with the typed client catalog.',
    },
    'PERF-04': {
        decision: 'plan',
        note: 'Conditional on the recorded SEO strategy: keep indexed pages static using the smallest route/layout change possible. Do not redesign locale architecture unless static SEO output or measured TTFB requires it.',
    },
    'SEC-01': {
        decision: 'defer',
        note: 'A full CSP reporting/nonce/enforcement project is production machinery while integrations are still changing. Add only cheap non-breaking headers opportunistically after checking the live edge. Reopen CSP at roughly 1,000 rooms, before user-authored HTML, or when adding a privileged third-party script.',
    },
    'RES-01': {
        decision: 'fix-now',
        note: 'Implemented as one restrained translated family: retry/safe navigation, no raw errors or room credentials, and no recovery framework.',
    },
    'DOMAIN-01': {
        decision: 'fix-now',
        note: 'Implemented: restore and settlement deletion now assert archived-room writability under lock with regression tests. The generic command pipeline remains deferred.',
    },
    'DOMAIN-02': {
        decision: 'defer',
        note: 'Application validation is adequate for the experiment. Reopen request hashing and room-scoped database constraints at roughly 1,000 rooms, on the first replay/cross-room defect, or when an adjacent schema change makes the work nearly free.',
    },
    'DS-08': {
        decision: 'defer',
        note: 'Do not build a global motion-token system for its own sake. Reopen during a deliberate delight pass or when inconsistent feedback causes a concrete UX defect; representative prototypes remain mandatory then.',
    },
    'DS-09': {
        decision: 'fix-now',
        note: 'Implemented: no production CSS selects a test ID and classes:audit enforces that boundary.',
    },
    'DS-10': {
        decision: 'fix-now',
        note: 'Implemented through documentation, contrast tests and a UI source guard. Theme colors are unchanged; any retuning returns for visual review.',
    },
    'I18N-03': {
        decision: 'defer',
        note: 'Keep the current exact-copy policy for the three shipped locales. Revisit browser translation when unsupported-language demand appears or during a deliberate localization policy pass; this is not launch work for an unvalidated product.',
    },
    'PERF-05': {
        decision: 'defer',
        note: 'Measure the production font waterfall before changing font scope or preload behavior. Reopen only if the display fonts are actually a route cost.',
    },
    'OPS-03': {
        decision: 'defer',
        note: 'A larger runtime image is acceptable until pull time or deployment frequency becomes painful. Revisit with a separate migration job or measured release cost.',
    },
    'OBS-01': {
        decision: 'defer',
        note: 'Platform stdout is adequate for the experiment. Reopen at roughly 1,000 rooms, repeated server failures that cannot be diagnosed from current logs, or a real on-call obligation.',
    },
    'SCALE-01': {
        decision: 'accept',
        note: 'One replica with polling fallback is an appropriate explicit launch constraint. Reopen before adding a second replica.',
    },
    'QUAL-03': {
        decision: 'fix-now',
        note: 'Reuse the existing formatter cache. This is trivial, behavior-preserving DRY cleanup.',
    },
} as const satisfies Record<string, AuditRecommendation>
