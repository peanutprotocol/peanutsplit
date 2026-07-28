/**
 * Build-time feature flags.
 *
 * Read as a literal member expression, never `process.env[name]`: Next inlines
 * `NEXT_PUBLIC_*` into the client bundle by textual substitution, so a computed
 * lookup is `undefined` in the browser no matter what the container was built
 * with.
 *
 * The flag hides UI and nothing else. The accounts backend is independently
 * inert without `SPLIT_AUTH_SECRET` (`server/authTokens.ts` answers 503 and
 * writes nothing), so flipping this on against a deployment that has no secret
 * produces error toasts, not half-made accounts. Both have to be set for the
 * feature to exist, and they are set by different people at different times.
 */

export const accountsEnabled = (): boolean => process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === '1'

/**
 * V2 is a product boundary, not an experiment cohort. The current app stays the
 * small, trust-based room: no AI affordances and no migration tooling. A v2
 * deployment opts in explicitly at build time.
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

/**
 * The teaser state between "hidden" and "live": the save-your-rooms surface is
 * announced with a Soon badge while the email transport clears its last
 * external gates. ENABLED wins — flipping the real flag retires the teaser
 * without a second cleanup deploy.
 */
export const accountsSoon = (): boolean => process.env.NEXT_PUBLIC_ACCOUNTS_SOON === '1' && !accountsEnabled()

/** The VAPID public key the browser subscribes against. Absent → no push UI at
 *  all; see `push-status.ts`, which treats a missing key as `unsupported`. */
export const vapidPublicKey = (): string | undefined => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined
