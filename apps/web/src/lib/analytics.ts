/**
 * PostHog, wrapped so nothing else in the app imports it directly.
 *
 * No key → every call is a no-op (local dev and self-hosters get silence, not
 * console noise). Room slugs, member names, descriptions and amounts never
 * leave the device — a room link is a credential.
 */

import posthog from 'posthog-js'
import type { CaptureResult } from 'posthog-js'
import { ACHIEVEMENT_TYPES } from './achievements-contract'
import type { AchievementType } from './achievements-contract'
import type { LandingVariant } from './flags'
import type { AutoInstallTrigger } from './install-funnel'
import type { RecapShareTier } from './recap'
import { SHARE_PACKAGE_VARIANT } from './share-package-contract'

/** The runtime half of `RecapShareTier`, so an unknown tier can be dropped rather than forwarded. */
const SHARE_TIERS = ['files', 'clipboard', 'download'] as const satisfies readonly RecapShareTier[]

export type LandingEvent =
    | 'landing_hero_exposed'
    | 'landing_form_started'
    | 'landing_creation_attempted'
    | 'landing_room_created'
    | 'landing_preview_completed'

export type AnalyticsEvent =
    | LandingEvent
    | 'room_created'
    | 'expense_added'
    | 'first_shared_balance'
    | 'expense_edited'
    | 'expense_deleted'
    | 'expense_restored'
    | 'settlement_recorded'
    | 'settle_sheet_opened'
    | 'share_opened'
    | 'share_package_presented'
    | 'share_completed'
    | 'link_copied'
    | 'all_settled'
    | 'pwa_prompt_shown'
    | 'pwa_prompt_dismissed'
    | 'pwa_installed'
    | 'pwa_ios_install_handoff_completed'
    // Installing. Every property is a fact about a browser — which of five states the settings row
    // found this device in, which of two answers the browser's own dialog got, or that manual
    // instructions opened. Never a room, never a device id. `pwa_installed` is Chromium-only,
    // because `appinstalled` is. On iOS the separately named event proves only that a prepared
    // handoff completed in standalone mode; it is deliberately not presented as an operating-system
    // install event.
    | 'install_row_shown'
    | 'install_prompted'
    | 'ios_install_steps_opened'
    | 'browser_install_steps_opened'
    // A photo handed in from the OS share sheet. One enum, five buckets, and never a room count:
    // "this device has 7 rooms" is a weak fingerprint and buys nothing the buckets do not.
    | 'share_target_opened'
    | 'peanut_option_shown'
    | 'peanut_option_clicked'
    // Push opt-in. Same discipline as everything above: neither a room
    // identifier nor a member identity ever appears in a property bag.
    | 'push_optin_shown'
    | 'push_optin_accepted'
    | 'push_optin_denied'
    // Bill scanning. A receipt is the most identifying thing anyone hands this
    // app, so the funnel is deliberately blind: `receipt_scan_parsed` carries a
    // COUNT of items and nothing else. No labels, no amounts, no merchant, no
    // currency — a merchant name plus a timestamp can identify a real table,
    // and no funnel is worth that.
    | 'receipt_scan_started'
    | 'receipt_scan_parsed'
    | 'receipt_scan_failed'
    | 'receipt_scan_applied'
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
    // Avatars. The property is the FAMILY the pick came from (`face`, `doodle`,
    // `default`) and never the key: "which of the twenty faces this person chose"
    // is a description of a person, and the theme key is fair game only because
    // it describes a room. Whose avatar changed is not sent at all.
    | 'avatar_changed'
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
    // Achievements. The type is a closed set of four and the tier is which rung
    // of the share chain fired. A threshold value, an award id, a persona key
    // and a member are all absent on purpose: which of the six roles somebody
    // got is a description of a person, and the avatar comment three blocks up
    // already settled that question. `crew_5` is out for the same reason — it
    // would publish the roster size, and the funnel question is only "did
    // anyone share a crew card".
    | 'achievement_seen'
    | 'achievement_share_opened'
    | 'achievement_shared'
    // Content pageview + scroll depth (blog/alternatives/capture articles and guides).
    // `template` and `chapter` are both closed enums that describe the PAGE, never the reader —
    // no slug, no room, no scroll position beyond which of four milestones was crossed.
    | 'content_pageview'
    | 'content_scroll_depth'

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
    // Child effects run before the provider's effect on first paint. Initialising
    // lazily keeps `landing_hero_exposed` from disappearing on that first pass;
    // the provider's later call is idempotent.
    if (!ready) initAnalytics()
    if (!ready) return
    try {
        posthog.capture(event, properties)
    } catch {
        // Analytics must never break a flow.
    }
}

/**
 * The landing funnel's complete property surface. Callers cannot accidentally
 * attach the room draft, the eventual slug, a person, an amount or a currency:
 * the deployment variant is the only value accepted here.
 */
export function trackLanding(event: LandingEvent, variant: LandingVariant): void {
    track(event, { variant })
}

/**
 * The room's first actionable debt, deliberately carrying no properties.
 *
 * The event is enough to measure activation in the current anonymous session.
 * A room id, person, amount, currency, description, or roster size would make it
 * easier to correlate a private ledger and buys nothing for this funnel.
 */
export function trackFirstSharedBalance(): void {
    track('first_shared_balance')
}

export const SHARE_PACKAGE_METHODS = ['native', 'clipboard'] as const
export type SharePackageMethod = (typeof SHARE_PACKAGE_METHODS)[number]
export const SHARE_SURFACES = ['room_ready', 'post_aha', 'header'] as const
export type ShareSurface = (typeof SHARE_SURFACES)[number]

/**
 * The invite experiment's complete measurement contract.
 *
 * Success is a completed user-directed share action divided by presented
 * packages. It is NOT an invite-conversion rate: accountless bearer links do
 * not expose which chat app was chosen, who received one or whether a receiver
 * later opened it. Inventing any of those facts would make the metric both
 * dishonest and less private.
 */
export const SHARE_PACKAGE_MEASURE = {
    exposure: 'share_package_presented',
    success: 'share_completed',
    definition: 'completed user-directed share actions / presented share packages',
    allowedProperties: {
        share_package_presented: ['variant', 'surface'],
        share_completed: ['variant', 'surface', 'method'],
    },
} as const

/** Exact allowlisted properties for the package metric — one closed UI context,
 *  no room, member, amount, description, currency, roster size or channel. */
export function sharePackageMeasureProps(surface: ShareSurface, method?: SharePackageMethod): Record<string, string> {
    if (!(SHARE_SURFACES as readonly string[]).includes(surface)) return { variant: SHARE_PACKAGE_VARIANT }
    return method && (SHARE_PACKAGE_METHODS as readonly string[]).includes(method)
        ? { variant: SHARE_PACKAGE_VARIANT, surface, method }
        : { variant: SHARE_PACKAGE_VARIANT, surface }
}

export const INSTALL_TRIGGERS = [
    'balance_and_share',
    'mature_contribution',
    'mature_return',
    'quiet_slot',
] as const satisfies readonly AutoInstallTrigger[]
export const INSTALL_DELIVERIES = ['browser_prompt', 'browser_steps', 'ios_steps'] as const
export const INSTALL_SURFACES = ['auto', 'settings', 'app'] as const
export const INSTALL_OUTCOMES = ['accepted', 'dismissed'] as const
// Reading or leaving install help is not a refusal. Only explicit card/native-prompt decisions
// belong in the dismissal funnel.
export const INSTALL_DISMISS_REASONS = ['not_now', 'browser_declined'] as const

type InstallMeasureEvent =
    | 'pwa_prompt_shown'
    | 'pwa_prompt_dismissed'
    | 'install_prompted'
    | 'ios_install_steps_opened'
    | 'browser_install_steps_opened'

/**
 * The complete install measurement boundary. Room identity is deliberately absent — not
 * even the safe analytics pseudonym — so an install journey cannot become a cross-room profile.
 */
export const INSTALL_MEASURE = {
    exposure: 'pwa_prompt_shown',
    success: {
        chromium: 'pwa_installed',
        /** Strongest honest iOS signal: a prepared room reached a new standalone context,
         *  was persisted there, and the one-time handoff was acknowledged. WebKit exposes no
         *  programmable install event, so this remains a handoff completion, not OS proof. */
        ios: 'pwa_ios_install_handoff_completed',
    },
    allowedProperties: {
        pwa_prompt_shown: ['trigger', 'delivery'],
        pwa_prompt_dismissed: ['trigger', 'delivery', 'reason'],
        install_prompted: ['surface', 'outcome', 'trigger'],
        ios_install_steps_opened: ['surface', 'trigger'],
        browser_install_steps_opened: ['surface'],
    },
} as const

/** Unknown keys and values are dropped, not forwarded to PostHog. */
export function installMeasureProps(
    event: InstallMeasureEvent,
    properties: Record<string, unknown>
): Record<string, string> {
    const result: Record<string, string> = {}
    const trigger = properties.trigger
    const delivery = properties.delivery
    const surface = properties.surface
    const outcome = properties.outcome
    const reason = properties.reason

    if (
        (event === 'pwa_prompt_shown' ||
            event === 'pwa_prompt_dismissed' ||
            event === 'install_prompted' ||
            event === 'ios_install_steps_opened') &&
        (INSTALL_TRIGGERS as readonly unknown[]).includes(trigger)
    )
        result.trigger = trigger as string
    if (
        (event === 'pwa_prompt_shown' || event === 'pwa_prompt_dismissed') &&
        (INSTALL_DELIVERIES as readonly unknown[]).includes(delivery)
    )
        result.delivery = delivery as string
    if (
        (event === 'install_prompted' ||
            event === 'ios_install_steps_opened' ||
            event === 'browser_install_steps_opened') &&
        (INSTALL_SURFACES as readonly unknown[]).includes(surface)
    )
        result.surface = surface as string
    if (event === 'install_prompted' && (INSTALL_OUTCOMES as readonly unknown[]).includes(outcome))
        result.outcome = outcome as string
    if (event === 'pwa_prompt_dismissed' && (INSTALL_DISMISS_REASONS as readonly unknown[]).includes(reason))
        result.reason = reason as string
    return result
}

/**
 * The achievement wave's complete measurement contract.
 *
 * Success is a completed achievement share divided by achievement moments seen. `recap` and
 * `invite` are deliberately not achievement types: both already have their own funnels
 * (`recap_shared`, `share_completed`), and a deck tile that fired an achievement event would
 * undercount one measure while polluting the other.
 */
export const ACHIEVEMENT_MEASURE = {
    exposure: 'achievement_seen',
    success: 'achievement_shared',
    definition: 'completed achievement shares / achievement moments seen',
    allowedProperties: {
        achievement_seen: ['type'],
        achievement_share_opened: ['type'],
        achievement_shared: ['type', 'tier'],
    },
} as const

/** Exact allowlisted properties. An unknown type or tier is dropped, not passed through. */
export function achievementProps(type: AchievementType, tier?: RecapShareTier): Record<string, string> {
    if (!(ACHIEVEMENT_TYPES as readonly string[]).includes(type)) return {}
    return tier && (SHARE_TIERS as readonly string[]).includes(tier) ? { type, tier } : { type }
}

/**
 * slug → analytics pseudonym, learned from RoomState as it arrives.
 *
 * Call sites hold a slug and nothing else, and threading a second identifier
 * through fifteen component prop chains would be a far larger change than the
 * one property it carries. The slug stays on the device either way: it is only
 * ever the lookup key here, never a value that is sent.
 */
const roomKeys = new Map<string, string>()

/** Called for every RoomState the client receives. Unknown rooms stay unkeyed. */
export function rememberRoomKey(slug: string, analyticsKey: string | undefined): void {
    if (analyticsKey) roomKeys.set(slug, analyticsKey)
}

/**
 * Room call sites, with the room's pseudonym attached when it is known.
 *
 * `room` is the one-way key from the server, never the slug — a slug in a
 * property bag is a credential handed to a third party, which is precisely the
 * 2026-07-28 leak. An unknown slug simply omits the property rather than
 * falling back to anything identifying: fewer analytics beats a leak.
 */
export const roomProps = (slug: string, extra: Record<string, unknown> = {}) => {
    const room = roomKeys.get(slug)
    return room ? { room, ...extra } : { ...extra }
}
