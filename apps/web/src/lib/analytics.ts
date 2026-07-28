/**
 * PostHog, wrapped so nothing else in the app imports it directly.
 *
 * No key → every call is a no-op (local dev and self-hosters get silence, not
 * console noise). Room slugs, member names, descriptions and amounts never
 * leave the device — a room link is a credential.
 */

import posthog from 'posthog-js'
import type { CaptureResult } from 'posthog-js'

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
    // Push opt-in and accounts. Same discipline as everything above: the count
    // of recovered rooms is a number, and neither a room identifier nor an
    // email address ever appears in a property bag.
    | 'push_optin_shown'
    | 'push_optin_accepted'
    | 'push_optin_denied'
    | 'account_link_requested'
    | 'account_rooms_recovered'
    // Bill scanning. A receipt is the most identifying thing anyone hands this
    // app, so the funnel is deliberately blind: `receipt_scan_parsed` carries a
    // COUNT of items and nothing else. No labels, no amounts, no merchant, no
    // currency — a merchant name plus a timestamp can identify a real table,
    // and no funnel is worth that.
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
    // Latecomer catch-up. Two counts and nothing else — how many earlier
    // expenses the offer covered, and how many the confirm actually rewrote. Not
    // who joined, not who tapped, not what any of it was worth: a name here
    // would say more about a group than every other event in this file put
    // together.
    | 'latecomer_backfill_offered'
    | 'latecomer_backfill_accepted'
    // Splitwise import. The file never leaves the device and neither does anything in it:
    // the only properties these carry are two counts and a failure code.
    | 'import_started'
    | 'import_parsed'
    | 'import_completed'
    | 'import_failed'

let ready = false

/**
 * PostHog adds browser context to custom events after `track` hands them over.
 * A room slug can be in the URL and a room name can be in the document title,
 * so remove every URL/title/referrer field at the final SDK boundary.
 */
const AUTOMATIC_PAGE_PROPERTIES = [
    '$current_url',
    '$pathname',
    '$referrer',
    '$referring_domain',
    '$initial_current_url',
    '$initial_pathname',
    '$initial_referrer',
    '$initial_referring_domain',
    '$session_entry_url',
    '$session_entry_pathname',
    '$session_entry_referrer',
    '$session_entry_referring_domain',
    '$prev_pageview_url',
    '$prev_pageview_pathname',
    '$prev_pageview_title',
    '$title',
    'title',
] as const

function stripPageProperties(properties: CaptureResult['properties']): CaptureResult['properties'] {
    const sanitized = { ...properties }
    for (const property of AUTOMATIC_PAGE_PROPERTIES) delete sanitized[property]
    return sanitized
}

function stripAutomaticPageContext(capture: CaptureResult | null): CaptureResult | null {
    if (!capture) return null
    return {
        ...capture,
        properties: stripPageProperties(capture.properties),
        ...(capture.$set ? { $set: stripPageProperties(capture.$set) } : {}),
        ...(capture.$set_once ? { $set_once: stripPageProperties(capture.$set_once) } : {}),
    }
}

export function initAnalytics(): void {
    if (ready || typeof window === 'undefined') return
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return
    posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        persistence: 'localStorage',
        save_referrer: false,
        // Room slugs are credentials; never let automatic capture lift one out
        // of a URL, title, referrer or DOM interaction.
        mask_all_text: true,
        autocapture: false,
        before_send: stripAutomaticPageContext,
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

/** Keeps the room call sites ergonomic without attaching any room identifier. */
export const roomProps = (_slug: string, extra: Record<string, unknown> = {}) => ({ ...extra })
