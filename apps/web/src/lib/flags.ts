/**
 * V2 is a product boundary, not an experiment cohort. The current app stays the
 * small, trust-based room: no AI affordances and no migration tooling. A v2
 * deployment opts in explicitly at build time.
 *
 * Splitwise CSV import graduated to the v1 surface independently. Keep this
 * boundary for AI-assisted receipt scanning.
 */
export const splitV2Enabled = (): boolean => process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED === '1'

/**
 * Positive FOSS claims are a release boundary, not an editorial toggle. The source page stays
 * unroutable and the Splitwise comparison keeps only its established non-FOSS copy until the public
 * repository, license and notices exist. Defaulting closed removes unsupported legal claims without
 * sacrificing the comparison's canonical URL.
 */

/**
 * The commit this build was made from, when the deployment can say. Optional on purpose.
 *
 * AGPL section 13 asks a network service to offer the corresponding source through a customary
 * means. A public repository is that; a commit-pinned tree link is a sharper version of it, not a
 * requirement. Making the surface depend on the pin meant depending on a value a human types into
 * the deploy platform once — which goes stale on the very next deploy and then names the wrong tree
 * while calling itself exact. A stale pin is a false statement; a branch link is a true, weaker one.
 * So the page prefers the pin when a build genuinely supplies one, and stays honest without it.
 */
export function publicSourceCommit(): string | null {
    const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? ''
    return /^[0-9a-f]{40}$/.test(commit) ? commit : null
}

export const publicFossReleased = (): boolean => process.env.NEXT_PUBLIC_FOSS_RELEASED === '1'

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
