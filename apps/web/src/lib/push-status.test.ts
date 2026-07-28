import { describe, expect, it } from 'vitest'
import {
    derivePushStatus,
    isIOSDevice,
    isStandaloneDisplay,
    urlBase64ToUint8Array,
    type PushEnvironment,
} from './push-status'

/** A modern Android Chrome that has never been asked. Every case below is this,
 *  with one thing changed — the point is the precedence between them. */
const capable: PushEnvironment = {
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasVapidKey: true,
    isIOS: false,
    isStandalone: false,
    permission: 'default',
    hasSubscription: false,
}

const status = (overrides: Partial<PushEnvironment>) => derivePushStatus({ ...capable, ...overrides })

describe('derivePushStatus', () => {
    it('is default on a capable browser that has not been asked', () => {
        expect(status({})).toBe('default')
    })

    it.each([
        ['no Notification API', { hasNotification: false }],
        ['no service worker', { hasServiceWorker: false }],
        ['no PushManager', { hasPushManager: false }],
        ['no VAPID key in the build', { hasVapidKey: false }],
    ])('is unsupported with %s', (_label, overrides: Partial<PushEnvironment>) => {
        expect(status(overrides)).toBe('unsupported')
    })

    it('is unsupported even on a granted, subscribed device when the build has no key', () => {
        expect(status({ hasVapidKey: false, permission: 'granted', hasSubscription: true })).toBe('unsupported')
    })

    it('is ios-needs-pwa in an iOS browser tab', () => {
        expect(status({ isIOS: true, isStandalone: false })).toBe('ios-needs-pwa')
    })

    it('treats an installed iOS app as a normal device', () => {
        expect(status({ isIOS: true, isStandalone: true })).toBe('default')
    })

    /** The whole reason the order is what it is: iOS reports 'default' in a tab,
     *  and asking there spends the origin's single prompt on a silent denial. */
    it('answers ios-needs-pwa before it ever looks at the permission', () => {
        expect(status({ isIOS: true, isStandalone: false, permission: 'default' })).toBe('ios-needs-pwa')
        expect(status({ isIOS: true, isStandalone: false, permission: 'granted', hasSubscription: true })).toBe(
            'ios-needs-pwa'
        )
    })

    it('is denied when the origin is blocked', () => {
        expect(status({ permission: 'denied' })).toBe('denied')
    })

    it('stays denied even if a stale subscription is still around', () => {
        expect(status({ permission: 'denied', hasSubscription: true })).toBe('denied')
    })

    it('is subscribed with a live subscription', () => {
        expect(status({ permission: 'granted', hasSubscription: true })).toBe('subscribed')
    })

    it('is default when permission is granted but the subscription is gone', () => {
        expect(status({ permission: 'granted', hasSubscription: false })).toBe('default')
    })
})

describe('isIOSDevice', () => {
    it('matches iPhone and iPod user agents', () => {
        expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', platform: '', maxTouchPoints: 5 })
        ).toBe(true)
        expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPod touch)', platform: '', maxTouchPoints: 5 })).toBe(true)
    })

    it('unmasks an iPad reporting itself as a Mac', () => {
        expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(
            true
        )
    })

    it('leaves a real Mac alone — same platform, no touch', () => {
        expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(
            false
        )
    })

    it('is false on Android and desktop Windows', () => {
        expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 })
        ).toBe(false)
        expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 10 })).toBe(
            false
        )
    })
})

describe('isStandaloneDisplay', () => {
    it('accepts either signal', () => {
        expect(isStandaloneDisplay(true, undefined)).toBe(true)
        expect(isStandaloneDisplay(false, true)).toBe(true)
    })

    it('is false in a plain tab', () => {
        expect(isStandaloneDisplay(false, false)).toBe(false)
        expect(isStandaloneDisplay(false, undefined)).toBe(false)
    })
})

describe('urlBase64ToUint8Array', () => {
    it('decodes an unpadded base64url key', () => {
        // "hi!" is 3 bytes → 4 base64 chars, no padding needed.
        expect([...urlBase64ToUint8Array('aGkh')]).toEqual([104, 105, 33])
    })

    it('restores the padding base64url drops', () => {
        expect([...urlBase64ToUint8Array('aGk')]).toEqual([104, 105])
    })

    it('maps the two swapped characters back', () => {
        // 0xFB 0xEF → standard '++8=' / base64url '--8'
        expect([...urlBase64ToUint8Array('--8')]).toEqual([251, 239])
        expect([...urlBase64ToUint8Array('_-8')]).toEqual([255, 239])
    })

    it('produces the 65 bytes a real VAPID key decodes to', () => {
        const key =
            'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
        expect(urlBase64ToUint8Array(key)).toHaveLength(65)
    })
})
