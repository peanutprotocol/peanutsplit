/**
 * PostHog, wrapped so nothing else in the app imports it directly.
 *
 * No key → every call is a no-op (local dev and self-hosters get silence, not
 * console noise). Room slugs are hashed before they leave the device and member
 * names, descriptions and amounts never do — a room link is a credential.
 */

import posthog from 'posthog-js'

export type AnalyticsEvent =
    | 'room_created'
    | 'room_joined'
    | 'expense_added'
    | 'expense_edited'
    | 'expense_deleted'
    | 'expense_restored'
    | 'settlement_recorded'
    | 'settle_sheet_opened'
    | 'share_opened'
    | 'share_completed'
    | 'link_copied'
    | 'all_settled'
    | 'pwa_prompt_shown'
    | 'pwa_installed'
    | 'peanut_option_shown'
    | 'peanut_option_clicked'
    // Push opt-in and accounts. Same discipline as everything above: the room is
    // a hash, the count of recovered rooms is a number, and an email address
    // never appears in a property bag.
    | 'push_optin_shown'
    | 'push_optin_accepted'
    | 'push_optin_denied'
    | 'account_link_requested'
    | 'account_rooms_recovered'
    // Bill scanning. A receipt is the most identifying thing anyone hands this
    // app, so the funnel is deliberately blind: `receipt_scan_parsed` carries a
    // COUNT of items and nothing else. No labels, no amounts, no merchant, no
    // currency — a merchant name plus a room hash plus a timestamp is a person
    // at a table, and no funnel is worth that.
    | 'receipt_scan_started'
    | 'receipt_scan_parsed'
    | 'receipt_scan_failed'
    | 'receipt_scan_applied'
    // Quick add — the same discipline, and even blinder. What somebody typed is
    // a line out of their group chat, so nothing about it is sent: not the text,
    // not its length, not the amount, not whether names were in it. Three events
    // and not four because a parse that succeeds IS applied — the form fills and
    // the sheet closes in the same instant, so a `parsed` event would be a
    // duplicate of `applied` with a different name.
    | 'nl_parse_started'
    | 'nl_parse_applied'
    | 'nl_parse_failed'
    // Trip recap. `recap_shared` carries which rung of the share chain fired
    // (`files` | `clipboard` | `download`) and nothing else — no total, no day
    // count, no names. An amount in a property bag is the same leak as an
    // amount in a URL.
    | 'recap_viewed'
    | 'recap_shared'
    // Delight. The theme KEY is fine as a property — it is a choice from a
    // catalog of eight, not identity; which emoji somebody tapped is not sent
    // at all, because "who reacted with what" is exactly the kind of social
    // detail this file exists to keep out of a funnel.
    | 'theme_changed'
    | 'reaction_added'
    | 'reaction_removed'
    // Splitwise import. The file never leaves the device and neither does anything in it:
    // the only properties these carry are two counts and a failure code.
    | 'import_started'
    | 'import_parsed'
    | 'import_completed'
    | 'import_failed'

let ready = false

/** djb2 — a stable, cheap, non-reversible-enough room identifier for funnels. */
export function hashSlug(slug: string): string {
    let hash = 5381
    for (let i = 0; i < slug.length; i++) hash = ((hash << 5) + hash + slug.charCodeAt(i)) | 0
    return (hash >>> 0).toString(16).padStart(8, '0')
}

export function initAnalytics(): void {
    if (ready || typeof window === 'undefined') return
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return
    posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
        capture_pageview: true,
        persistence: 'localStorage',
        // Room slugs are credentials; never let autocapture lift one out of a URL.
        mask_all_text: false,
        autocapture: false,
    })
    ready = true
}

export function track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
    if (!ready) return
    try {
        posthog.capture(event, properties)
    } catch {
        // Analytics must never break a flow.
    }
}

/** The room-scoped property bag every room event carries. */
export const roomProps = (slug: string, extra: Record<string, unknown> = {}) => ({
    room: hashSlug(slug),
    ...extra,
})
