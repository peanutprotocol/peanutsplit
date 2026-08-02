/**
 * V2 is a product boundary, not an experiment cohort. The current app stays the
 * small, trust-based room: no AI affordances and no migration tooling. A v2
 * deployment opts in explicitly at build time.
 *
 * Splitwise CSV import graduated to the v1 surface independently. Keep this
 * boundary for the AI-assisted entry tools: turning it on still exposes receipt
 * scanning and natural-language quick add together.
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
