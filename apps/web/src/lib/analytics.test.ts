import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({
    capture: vi.fn(),
    init: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: posthog }))

const priorKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const priorHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('window', {})
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_landing_test'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://analytics.invalid'
})

afterAll(() => {
    vi.unstubAllGlobals()
    if (priorKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = priorKey
    if (priorHost === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_HOST
    else process.env.NEXT_PUBLIC_POSTHOG_HOST = priorHost
})

describe('privacy-safe analytics', () => {
    it('disables automatic page events and strips browser page context before sending', async () => {
        const { initAnalytics } = await import('./analytics')
        initAnalytics()

        expect(posthog.init).toHaveBeenCalledOnce()
        const config = posthog.init.mock.calls[0][1]
        expect(config).toMatchObject({
            api_host: 'https://analytics.invalid',
            autocapture: false,
            capture_pageleave: false,
            capture_pageview: false,
            disable_session_recording: true,
            mask_all_text: true,
            save_referrer: false,
        })

        const beforeSend = config.before_send
        const sanitized = beforeSend({
            uuid: 'event-id',
            event: 'expense_added',
            properties: {
                $current_url: 'https://example.test/r/ski-trip-x7k2m9',
                $pathname: '/r/ski-trip-x7k2m9',
                $referrer: 'https://example.test/r/secret-room',
                $referring_domain: 'example.test',
                $initial_current_url: 'https://example.test/r/ski-trip-x7k2m9',
                $initial_pathname: '/r/ski-trip-x7k2m9',
                $initial_referrer: 'https://example.test/r/secret-room',
                $initial_referring_domain: 'example.test',
                $session_entry_url: 'https://example.test/r/ski-trip-x7k2m9',
                $session_entry_pathname: '/r/ski-trip-x7k2m9',
                $session_entry_referrer: 'https://example.test/r/secret-room',
                $session_entry_referring_domain: 'example.test',
                $prev_pageview_url: 'https://example.test/r/ski-trip-x7k2m9',
                $prev_pageview_pathname: '/r/ski-trip-x7k2m9',
                $prev_pageview_title: 'Secret ski trip',
                $title: 'Secret ski trip',
                title: 'Secret ski trip',
                items: 3,
            },
            $set: {
                $current_url: 'https://example.test/r/ski-trip-x7k2m9',
                plan: 'free',
            },
            $set_once: {
                $initial_current_url: 'https://example.test/r/ski-trip-x7k2m9',
                $initial_pathname: '/r/ski-trip-x7k2m9',
                $initial_referrer: 'https://example.test/r/secret-room',
                cohort: 'new',
            },
        })

        expect(sanitized?.properties).toEqual({ items: 3 })
        expect(sanitized?.$set).toEqual({ plan: 'free' })
        expect(sanitized?.$set_once).toEqual({ cohort: 'new' })
    })

    it('never derives an analytics property from the room slug', async () => {
        const { roomProps } = await import('./analytics')

        const properties = roomProps('ski-trip-x7k2m9', { items: 3 })

        expect(properties).toEqual({ items: 3 })
        expect(JSON.stringify(properties)).not.toContain('ski-trip-x7k2m9')
        expect(properties).not.toHaveProperty('room')
    })
})

describe('landing analytics', () => {
    it('sends only the allowlisted variant for every landing-funnel event', async () => {
        const { trackLanding } = await import('./analytics')
        const events = [
            'landing_hero_exposed',
            'landing_form_started',
            'landing_creation_attempted',
            'landing_room_created',
            'landing_preview_completed',
        ] as const

        for (const event of events) trackLanding(event, 'pass_link')
        trackLanding('landing_hero_exposed', 'control')

        expect(posthog.init).toHaveBeenCalledOnce()
        expect(posthog.capture.mock.calls).toEqual([
            ...events.map((event) => [event, { variant: 'pass_link' }]),
            ['landing_hero_exposed', { variant: 'control' }],
        ])

        for (const [, properties] of posthog.capture.mock.calls) {
            expect(Object.keys(properties)).toEqual(['variant'])
            expect(properties).not.toHaveProperty('room')
            expect(properties).not.toHaveProperty('slug')
            expect(properties).not.toHaveProperty('name')
            expect(properties).not.toHaveProperty('person')
            expect(properties).not.toHaveProperty('amount')
            expect(properties).not.toHaveProperty('currency')
            expect(properties).not.toHaveProperty('description')
        }
    })
})

describe('first shared balance analytics', () => {
    it('emits the activation milestone without ledger properties', async () => {
        const { trackFirstSharedBalance } = await import('./analytics')

        trackFirstSharedBalance()

        expect(posthog.capture).toHaveBeenCalledWith('first_shared_balance', {})
    })
})

describe('share-package measurement', () => {
    it('defines an honest completed-over-presented measure with an exact identifier-free allowlist', async () => {
        const { SHARE_PACKAGE_MEASURE, SHARE_PACKAGE_METHODS, SHARE_SURFACES, sharePackageMeasureProps } =
            await import('./analytics')

        expect(SHARE_PACKAGE_MEASURE).toEqual({
            exposure: 'share_package_presented',
            success: 'share_completed',
            definition: 'completed user-directed share actions / presented share packages',
            allowedProperties: {
                share_package_presented: ['variant', 'surface'],
                share_completed: ['variant', 'surface', 'method'],
            },
        })

        expect(sharePackageMeasureProps('post_aha')).toEqual({
            variant: 'group_chat_package_v1',
            surface: 'post_aha',
        })
        expect(sharePackageMeasureProps('post_aha', 'native')).toEqual({
            variant: 'group_chat_package_v1',
            surface: 'post_aha',
            method: 'native',
        })
        expect(SHARE_PACKAGE_METHODS).toEqual(['native', 'clipboard'])
        expect(SHARE_SURFACES).toEqual(['room_ready', 'post_aha', 'header'])
        expect(sharePackageMeasureProps('unknown' as never)).toEqual({ variant: 'group_chat_package_v1' })
        expect(sharePackageMeasureProps('header', 'whatsapp' as never)).toEqual({
            variant: 'group_chat_package_v1',
            surface: 'header',
        })

        for (const method of ['native', 'clipboard'] as const) {
            const properties = sharePackageMeasureProps('header', method)
            expect(Object.keys(properties)).toEqual(['variant', 'surface', 'method'])
            expect(properties).not.toHaveProperty('room')
            expect(properties).not.toHaveProperty('slug')
            expect(properties).not.toHaveProperty('name')
            expect(properties).not.toHaveProperty('member')
            expect(properties).not.toHaveProperty('amount')
            expect(properties).not.toHaveProperty('channel')
        }
    })
})

describe('install measurement', () => {
    it('allows only closed funnel facts and drops every identity-shaped property', async () => {
        const { INSTALL_MEASURE, installMeasureProps } = await import('./analytics')

        expect(INSTALL_MEASURE).toEqual({
            exposure: 'pwa_prompt_shown',
            success: {
                chromium: 'pwa_installed',
                ios: 'pwa_ios_install_handoff_completed',
            },
            allowedProperties: {
                pwa_prompt_shown: ['trigger', 'delivery'],
                pwa_prompt_dismissed: ['trigger', 'delivery', 'reason'],
                install_prompted: ['surface', 'outcome', 'trigger'],
                ios_install_steps_opened: ['surface', 'trigger'],
                browser_install_steps_opened: ['surface'],
            },
        })

        expect(
            installMeasureProps('pwa_prompt_dismissed', {
                trigger: 'balance_and_share',
                delivery: 'ios_steps',
                reason: 'not_now',
                slug: 'private-room-credential',
                room: 'room-pseudonym',
                member: 'ana',
            })
        ).toEqual({ trigger: 'balance_and_share', delivery: 'ios_steps', reason: 'not_now' })
        expect(
            installMeasureProps('install_prompted', {
                surface: 'auto',
                outcome: 'accepted',
                trigger: 'mature_return',
            })
        ).toEqual({ trigger: 'mature_return', surface: 'auto', outcome: 'accepted' })
        expect(
            installMeasureProps('pwa_prompt_shown', {
                trigger: 'creator' as never,
                delivery: 'magic' as never,
            })
        ).toEqual({})
        expect(
            installMeasureProps('browser_install_steps_opened', {
                surface: 'settings',
                slug: 'private-room-credential',
                member: 'ana',
            })
        ).toEqual({ surface: 'settings' })
    })
})

describe('achievement measurement', () => {
    it('defines an honest shared-over-seen measure with an exact identifier-free allowlist', async () => {
        const { ACHIEVEMENT_MEASURE, achievementProps } = await import('./analytics')

        expect(ACHIEVEMENT_MEASURE).toEqual({
            exposure: 'achievement_seen',
            success: 'achievement_shared',
            definition: 'completed achievement shares / achievement moments seen',
            allowedProperties: {
                achievement_seen: ['type'],
                achievement_share_opened: ['type'],
                achievement_shared: ['type', 'tier'],
            },
        })

        expect(achievementProps('crew')).toEqual({ type: 'crew' })
        expect(achievementProps('crew', 'files')).toEqual({ type: 'crew', tier: 'files' })
        expect(Object.keys(achievementProps('crew', 'files'))).toEqual(['type', 'tier'])

        // An unknown type or tier is dropped rather than forwarded.
        expect(achievementProps('debt' as never)).toEqual({})
        expect(achievementProps('crew', 'carrier-pigeon' as never)).toEqual({ type: 'crew' })

        for (const type of ['crew', 'passport', 'alterego', 'wrapped'] as const) {
            const properties = achievementProps(type, 'files')
            expect(properties).not.toHaveProperty('room')
            expect(properties).not.toHaveProperty('slug')
            expect(properties).not.toHaveProperty('name')
            expect(properties).not.toHaveProperty('member')
            expect(properties).not.toHaveProperty('award')
            expect(properties).not.toHaveProperty('persona')
            expect(properties).not.toHaveProperty('count')
            expect(properties).not.toHaveProperty('amount')
            expect(properties).not.toHaveProperty('currency')
            expect(properties).not.toHaveProperty('description')
        }
    })

    it('keeps the recap and the invite out of the achievement vocabulary', async () => {
        const { ACHIEVEMENT_TYPES, CARD_TYPE } = await import('./achievements-contract')

        // Decision 5 of the design, pinned: SHARE_PACKAGE_METHODS names the delivery mechanism,
        // not the payload, so a PNG riding inside a native share adds no third method.
        const { SHARE_PACKAGE_METHODS } = await import('./analytics')
        expect(SHARE_PACKAGE_METHODS).toEqual(['native', 'clipboard'])

        expect(ACHIEVEMENT_TYPES).toEqual(['crew', 'passport', 'alterego', 'wrapped'])
        // Both already have their own funnels; a deck tile firing an achievement event would
        // undercount one measure and pollute the other.
        expect(CARD_TYPE).not.toHaveProperty('recap')
        expect(CARD_TYPE).not.toHaveProperty('invite')
        expect(new Set(Object.values(CARD_TYPE))).toEqual(new Set(ACHIEVEMENT_TYPES))
    })
})
