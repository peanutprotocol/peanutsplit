import { afterEach, describe, expect, it, vi } from 'vitest'
import { appStoreUrlFor, smartAppBannerContent, storeAppUrl } from './store-app'

const IPHONE = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
}
const IPAD_AS_MAC = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.5 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
}
const MAC = { ...IPAD_AS_MAC, maxTouchPoints: 0 }
const ANDROID = {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
}
const DESKTOP = {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/127.0',
    platform: 'Linux x86_64',
    maxTouchPoints: 0,
}

const onDevice = (navigator: typeof IPHONE) => vi.stubGlobal('window', { navigator })

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

describe('appStoreUrlFor', () => {
    it('links an Apple touch device to the listing', () => {
        expect(appStoreUrlFor(true, '6740000000')).toBe('https://apps.apple.com/app/id6740000000')
    })

    it('offers nothing off Apple or without an ID', () => {
        expect(appStoreUrlFor(false, '6740000000')).toBeNull()
        expect(appStoreUrlFor(true, null)).toBeNull()
    })
})

describe('storeAppUrl', () => {
    it('answers the listing on an iPhone and an iPad when the ID is set', () => {
        vi.stubEnv('NEXT_PUBLIC_IOS_APP_STORE_ID', '6740000000')
        onDevice(IPHONE)
        expect(storeAppUrl()).toBe('https://apps.apple.com/app/id6740000000')
        onDevice(IPAD_AS_MAC)
        expect(storeAppUrl()).toBe('https://apps.apple.com/app/id6740000000')
    })

    it('answers null on Android, a Mac and desktop even with the ID set', () => {
        vi.stubEnv('NEXT_PUBLIC_IOS_APP_STORE_ID', '6740000000')
        for (const device of [ANDROID, MAC, DESKTOP]) {
            onDevice(device)
            expect(storeAppUrl()).toBeNull()
        }
    })

    it('answers null on an iPhone while the ID is unset or malformed', () => {
        onDevice(IPHONE)
        for (const id of ['', ' 6740000000', 'id6740000000', '674, app-argument=https://evil.example']) {
            vi.stubEnv('NEXT_PUBLIC_IOS_APP_STORE_ID', id)
            expect(storeAppUrl()).toBeNull()
        }
    })

    it('answers null on the server', () => {
        vi.stubEnv('NEXT_PUBLIC_IOS_APP_STORE_ID', '6740000000')
        expect(typeof window).toBe('undefined')
        expect(storeAppUrl()).toBeNull()
    })
})

describe('smartAppBannerContent', () => {
    it('names the app and hands it the canonical room link', () => {
        vi.stubEnv('NEXT_PUBLIC_IOS_APP_STORE_ID', '6740000000')
        expect(smartAppBannerContent('ski-trip-kunc-syrup-drum')).toBe(
            'app-id=6740000000, app-argument=https://peanutsplit.com/r/ski-trip-kunc-syrup-drum'
        )
    })

    it('renders nothing while the ID is unset', () => {
        vi.stubEnv('NEXT_PUBLIC_IOS_APP_STORE_ID', '')
        expect(smartAppBannerContent('ski-trip-kunc-syrup-drum')).toBeNull()
    })
})
