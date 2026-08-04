import type { AuditRecommendation } from './audit-model'

/**
 * Opinionated pre-user triage.
 *
 * Fix inexpensive correctness and foundations now; plan real maintainability,
 * UX and SEO work; require mockups for broad visual/flow changes; defer scale
 * machinery until an explicit trigger exists.
 */
export const auditRecommendations = {
    'OPS-01': {
        decision: 'fix-now',
        note: 'Verified 2026-08-04: this baseline fix is actionable entirely from the current environment, without Hugo. The authenticated GitHub account has repository admin access; main has no branch protection or ruleset; and the existing check and docker-web jobs are passing on main. Require PRs plus both checks before main can advance. Dokploy can keep polling main. A Dokploy change is only needed later if we choose immutable CI-built artifacts or want to remove every admin bypass.',
        priorConflict: {
            decision: 'Defer',
            explanation:
                'This pulls in the wrong direction, and there is no external-access blocker: every planned refactor would still be able to reach production before its checks, while this environment can add the baseline gate directly.',
        },
    },
    'SEC-02': {
        decision: 'fix-now',
        note: 'Replace the 30-bit room secret before durable links exist, while migration is cheapest. Keep the no-account sharing experience; ownership or revocation UI is a separate product decision.',
    },
    'SEC-03': {
        decision: 'fix-now',
        note: 'Match the optional-utility decision with lean protection only: strict caps, efficient share indexing, a low-maintenance rate limit or kill switch, and basic monitoring. Defer distributed quotas and lifecycle machinery.',
    },
    'ARCH-01': {
        decision: 'plan',
        note: 'Declare Next as the target, inventory unique legacy behavior, then retire Fastify in a bounded sequence. Stop adding features to both systems now.',
    },
    'OPS-02': {
        decision: 'fix-now',
        note: 'Correct the CI test-database setup immediately. Trustworthy verification is required for every subsequent refactor.',
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
        decision: 'mockup-review',
        note: 'Partitioning and retention machinery can wait, but archive, deletion, ownership and expiry semantics affect visible flows and user trust. Agree on the promise with a simple flow mockup first.',
        priorConflict: {
            decision: 'Defer',
            explanation:
                'Anonymous + manageable requires a visible rotate/delete lifecycle promise. Heavy retention infrastructure can still wait, but the management flow can no longer be deferred wholesale.',
        },
    },
    'QUAL-01': {
        decision: 'fix-now',
        note: 'Add semantic linting with a ratcheted baseline so cleanup does not become a repository-wide rewrite. The current command gives misleading assurance.',
    },
    'QUAL-02': {
        decision: 'plan',
        note: 'Put one deterministic mobile create, join, expense and settle smoke path in CI. Defer broad browser and PWA matrices until usage warrants them.',
    },
    'DS-01': {
        decision: 'plan',
        note: 'Move landing CSS into colocated modules incrementally with screenshot parity. This is current coupling, but not a reason for a risky rewrite.',
    },
    'ARCH-02': {
        decision: 'plan',
        note: 'Extract pure state and reducer seams from ExpenseDrawer as related work touches it. Preserve the current flow and avoid a big-bang rewrite.',
    },
    'ARCH-03': {
        decision: 'plan',
        note: 'Split queries by domain and isolate offline orchestration behind unchanged cache contracts. This directly reduces conflicts and spaghetti.',
    },
    'PERF-03': {
        decision: 'plan',
        note: 'Separate public/docs and app provider stacks using coarse route groups. Measure bundle and TTFB before and after, and combine it with static public routing.',
    },
    'DS-02': {
        decision: 'plan',
        note: 'Publish canonical semantic tokens and a deprecation map, then migrate mechanically. Do not invent a larger token ontology.',
    },
    'DS-03': {
        decision: 'plan',
        note: 'Extract a small set of role-specific primitives only from stable repeated recipes. Avoid speculative universal components.',
    },
    'DS-04': {
        decision: 'fix-now',
        note: 'Fold the explicitly temporary control and drawer shims into their owners, migrate callers mechanically, and delete the duplicate layer.',
    },
    'DS-05': {
        decision: 'mockup-review',
        note: 'A unified drawer scaffold can change scrolling, sticky actions, safe areas and perceived flow across core mobile workflows. Approve representative mockups first.',
    },
    'DS-06': {
        decision: 'plan',
        note: 'Create one typed button/link recipe and make width intent explicit while preserving rendered layouts. Use screenshots during migration.',
    },
    'DS-07': {
        decision: 'fix-now',
        note: 'Replace the two nonexistent classes and add class validation. This is certain, tiny cleanup.',
    },
    'I18N-02': {
        decision: 'fix-now',
        note: 'Generate a typed client error contract from the server catalog. It removes real behavior drift without changing product flow.',
    },
    'PERF-04': {
        decision: 'plan',
        note: 'Keep indexed public pages static and app routes dynamically localized as part of the provider/route-group plan. Verify the SEO and TTFB gain.',
    },
    'SEC-01': {
        decision: 'plan',
        note: 'Verify edge headers, add straightforward baseline policies, then run CSP report-only before enforcement. Avoid a complex policy around integrations still changing.',
    },
    'RES-01': {
        decision: 'plan',
        note: 'Add restrained translated error, loading and not-found boundaries. Review the copy, but do not build an elaborate recovery system.',
    },
    'DOMAIN-01': {
        decision: 'fix-now',
        note: 'Fix the two missing archived-room assertions and add invariant coverage now. Plan the shared command pipeline separately.',
    },
    'DOMAIN-02': {
        decision: 'plan',
        note: 'Add request-body hashing and room-scoped database integrity before meaningful data accumulates, while schema changes remain cheap.',
    },
    'DS-08': {
        decision: 'mockup-review',
        note: 'Motion and haptic standardization changes the product personality everywhere. Prototype representative controls before a global migration.',
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
        note: 'Platform stdout is adequate pre-users. Require structured correlation and a durable log drain before public beta or an on-call commitment.',
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
