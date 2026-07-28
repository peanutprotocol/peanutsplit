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

/** The VAPID public key the browser subscribes against. Absent → no push UI at
 *  all; see `push-status.ts`, which treats a missing key as `unsupported`. */
export const vapidPublicKey = (): string | undefined => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined
