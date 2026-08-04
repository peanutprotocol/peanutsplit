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
        note: 'Keep the readable slug and append strong non-human-friendly random bits before durable links exist. This is cheap first-room privacy, not an account/access-control project; rotation and revocation UI remain separate.',
    },
    'SEC-03': {
        decision: 'fix-now',
        note: 'Match the optional-utility decision with lean protection only: strict caps, efficient share indexing, a low-maintenance rate limit or kill switch, and basic monitoring. Defer distributed quotas and lifecycle machinery.',
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
        note: 'Ship one compliant focus-visible treatment centrally. It is a launch-quality baseline and does not change normal layouts.',
    },
    'A11Y-02': {
        decision: 'mockup-review',
        note: 'The accessibility requirement is real, but changing Button and reaction target sizes affects density across the app. Review representative mobile screens before migration.',
    },
    'A11Y-03': {
        decision: 'fix-now',
        note: 'Improve placeholder contrast and preserve visible labels. This is a small, obvious readability correction.',
    },
    'A11Y-04': {
        decision: 'fix-now',
        note: 'Extract the already-proven roving radio behavior. It corrects keyboard interaction without changing the visual design.',
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
        note: 'Add private, no-store defaults and route tests now. The change is small, invisible, and protects financial-data correctness.',
    },
    'DATA-01': {
        decision: 'defer',
        note: 'Keep the anonymous-managed direction documented, but do not design retention, partitioning, expiry, or deletion UI yet. Reopen at roughly 1,000 rooms, the first genuine erasure request, a concrete legal obligation, or measured audit-table growth. Mockups remain mandatory when the visible flow reopens.',
    },
    'QUAL-01': {
        decision: 'fix-now',
        note: 'Add semantic linting with a ratcheted baseline so cleanup does not become a repository-wide rewrite. The current command gives misleading assurance.',
    },
    'QUAL-02': {
        decision: 'defer',
        note: 'Keep the existing Playwright journeys runnable, but do not create a browser CI program while main intentionally deploys directly. Reopen after an escaped browser-only critical-flow regression, recurring manual-test pain, or around 1,000 rooms.',
    },
    'DS-01': {
        decision: 'defer',
        note: 'Do not schedule a 1,300-line CSS-module migration for architectural neatness. Move affected rules opportunistically during the next substantial landing experiment, or reopen on a real selector collision or measured CSS/CWV cost.',
    },
    'ARCH-02': {
        decision: 'plan',
        note: 'Take this on soon as a bounded standalone refactor: extract pure state, reducer and money seams first, then split coherent sections incrementally. Preserve the current flow exactly; any intentional visual or flow change requires mockups.',
    },
    'ARCH-03': {
        decision: 'plan',
        note: 'Take this on soon as a bounded standalone refactor. Split reads, offline orchestration and mutation domains behind unchanged hooks, cache keys and behavior, with focused contract tests around the moved seams.',
    },
    'PERF-03': {
        decision: 'plan',
        note: 'Conditional SEO work, not provider-stack cleanup for its own sake. Use the smallest coarse route split needed to make indexed pages static, or reopen on measured public-route JS/TTFB harm.',
    },
    'DS-02': {
        decision: 'plan',
        note: 'Schedule a bounded token cleanup soon: make the documented design system canonical, publish the deprecation map and remove dead aliases mechanically. Keep the ontology small and verify rendered parity.',
    },
    'DS-03': {
        decision: 'plan',
        note: 'Schedule extraction of the stable, already-proven repeated recipes soon. Use the rule of three, migrate callers incrementally and stop before inventing universal components that the live product has not demonstrated.',
    },
    'DS-04': {
        decision: 'fix-now',
        note: 'Fold the explicitly temporary shims into their owners only where computed dimensions and drawer geometry remain identical. Any visible geometry change moves to mockup review.',
    },
    'DS-05': {
        decision: 'defer',
        note: 'Do not standardize every drawer without evidence that inconsistency hurts the experiment. Reopen for a concrete scroll/safe-area defect or a deliberate drawer UX initiative; representative mockups remain required then.',
    },
    'DS-06': {
        decision: 'plan',
        note: 'Unify Button and link-button styling in the near-term component cleanup. Make width intent explicit, migrate proven duplicates and preserve anchor semantics and rendered layouts.',
    },
    'DS-07': {
        decision: 'fix-now',
        note: 'Replace the two nonexistent classes and add class validation. This is certain, tiny cleanup.',
    },
    'I18N-02': {
        decision: 'fix-now',
        note: 'Keep this small: add the missing error-code parity and one contract test. A generator or catalog framework is optional and should exist only if it is simpler than the test.',
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
        decision: 'plan',
        note: 'Add restrained translated error, loading and not-found boundaries. Review the copy, but do not build an elaborate recovery system.',
    },
    'DOMAIN-01': {
        decision: 'fix-now',
        note: 'Fix only the two known archived-room omissions and add focused regression tests. Do not build the generic room-command pipeline now; extract it later only if repeated omissions or product work justify the abstraction.',
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
        note: 'Remove test IDs from styling selectors and enforce the boundary. No intentional UI change is required.',
    },
    'DS-10': {
        decision: 'fix-now',
        note: 'Correct and test the documented contract as large/decorative-only. Any actual theme-color retuning should return for visual review.',
    },
    'I18N-03': {
        decision: 'fix-now',
        note: 'Remove the root-wide translation prohibition and retain it only on exact brand or data fragments. This is a small accessibility and discovery win.',
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
