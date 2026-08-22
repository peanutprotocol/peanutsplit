/**
 * Source-controlled global stop. Flipping it to `false` deindexes every released path in one line
 * without deleting the reviewed inventory below, which is what a rollback wants: the record of
 * what was cleared survives the rollback. Runtime configuration can turn indexing off, never on.
 */
export const SPLIT_CONTENT_INDEX_RELEASED = true

/**
 * Exact public paths a human has read on the live site and cleared for indexing. Keeping this
 * separate from artifact inventory lets a new manifest cohort soak behind noindex without
 * deindexing an already released guide cohort.
 *
 * Nine of the sixteen rendered guides. Six of the seven absent ones —
 * `split-a-group-trip-across-countries` and `split-expenses-across-currencies`, in all three
 * locales — are deliberately and permanently parked: peanutsplit.com already publishes both topics
 * at `/blog/<slug>`, those posts are indexed and hold the authority, and a second page with the
 * same title on the same domain would only split one query between two URLs. The guide versions
 * stay installed as the byte-pinned fixture the content validator regression-tests against. They
 * are never a public page, so do not "finish the set" by adding them here. The seventh,
 * `/es-419/guides/why-do-i-owe-someone-i-never-paid`, is a new cohort soaking behind noindex — it
 * joins the list when a human has read it on the live site.
 *
 * Ordered the way `splitGuidePaths()` orders the artifact, and pinned to that order by
 * `indexability.test.ts` — so a diff to this list reads as an addition or a removal, never as a
 * reshuffle.
 */
export const SPLIT_CONTENT_INDEX_RELEASED_PATHS = [
    '/es-419/guides/ask-a-friend-to-pay-you-back',
    '/guides/ask-a-friend-to-pay-you-back',
    '/guides/someone-drops-out-of-a-group-trip',
    '/guides/split-holiday-house-per-person-or-per-room',
    '/guides/splitwise-currency-conversion',
    '/guides/splitwise-vs-settle-up',
    '/guides/why-do-i-owe-someone-i-never-paid',
    '/pt-br/guides/ask-a-friend-to-pay-you-back',
    '/pt-br/guides/split-shared-house-bills',
] as const satisfies readonly string[]
