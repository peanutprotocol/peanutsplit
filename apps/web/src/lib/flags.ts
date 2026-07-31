/**
 * V2 is a product boundary, not an experiment cohort. The current app stays the
 * small, trust-based room: no AI affordances and no migration tooling. A v2
 * deployment opts in explicitly at build time.
 *
 * **This flag owns a published claim.** `/splitwise-daily-limit` tells a reader
 * that nothing imports — "Nothing imports. The itemised history stays in
 * Splitwise" — and its FAQ answers the mid-trip move the same way. That is true
 * only while this flag is off. Turning it on ships the Splitwise CSV importer
 * and makes the page wrong, so the flip is not a deploy setting on its own: the
 * page needs its v2 variant written first (`v2Only` frontmatter, the way
 * `blog/scan-a-receipt-to-split-a-bill` is held), or the claim has to come out.
 * The same sentence is why `compare.migration.importSentence` in
 * `components/marketing/copy.ts` is appended behind this flag rather than
 * carried in the body copy.
 */
export const splitV2Enabled = (): boolean => process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED === '1'

/**
 * The landing experiment is deliberately deployment-wide rather than tied to
 * a person or room. `control` is the emergency return to the compact form-first
 * fold; every other value, including an unset flag, serves the new default.
 *
 * Keep the environment access literal. Next replaces public variables while
 * building the browser bundle, so a computed lookup would make the control
 * impossible to select in client components.
 */
export type LandingVariant = 'pass_link' | 'control'

export const landingVariant = (): LandingVariant =>
    process.env.NEXT_PUBLIC_LANDING_VARIANT === 'control' ? 'control' : 'pass_link'

/** The VAPID public key the browser subscribes against. Absent → no push UI at
 *  all; see `push-status.ts`, which treats a missing key as `unsupported`. */
export const vapidPublicKey = (): string | undefined => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined
