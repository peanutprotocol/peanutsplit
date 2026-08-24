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
 * unroutable and the Splitwise comparison keeps only its established non-FOSS copy until the clean
 * public source, license, notices, security checks and immutable release receipt exist. Defaulting
 * closed removes unsupported legal claims without sacrificing the comparison's canonical URL.
 */
export interface PublicSourceReceipt {
    commit: string
    archiveUrl: string
    archiveSha256: string
}

/** Machine-readable corresponding-source receipt compiled into an approved public build. */
export function publicSourceReceipt(): PublicSourceReceipt | null {
    const commit = process.env.NEXT_PUBLIC_SOURCE_COMMIT ?? ''
    const buildCommit = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? ''
    const archiveUrl = process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL ?? ''
    const archiveSha256 = process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256 ?? ''
    if (!/^[0-9a-f]{40}$/.test(commit) || buildCommit !== commit || !/^[0-9a-f]{64}$/.test(archiveSha256)) return null

    try {
        const parsed = new URL(archiveUrl)
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return null
        // A syntactically valid `/latest.tar.gz` can move after this build ships. Bind the path
        // itself to either the public commit or the audited archive digest; query parameters do
        // not count because mutable download endpoints commonly put version hints there.
        if (!parsed.pathname.includes(commit) && !parsed.pathname.includes(archiveSha256)) return null
    } catch {
        return null
    }
    return { commit, archiveUrl, archiveSha256 }
}

export const publicFossReleased = (): boolean =>
    process.env.NEXT_PUBLIC_FOSS_RELEASED === '1' && publicSourceReceipt() !== null

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
