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
