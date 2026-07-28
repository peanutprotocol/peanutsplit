import { beforeEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({
    capture: vi.fn(),
    init: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: posthog }))

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('window', {})
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key'
})

describe('privacy-safe analytics', () => {
    it('disables automatic page events and strips browser page context before sending', async () => {
        const { initAnalytics } = await import('./analytics')
        initAnalytics()

        expect(posthog.init).toHaveBeenCalledOnce()
        const config = posthog.init.mock.calls[0][1]
        expect(config).toMatchObject({
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
