import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveInstallState, type InstallEnvironment } from './install'

const env = (overrides: Partial<InstallEnvironment> = {}): InstallEnvironment => ({
    isStandalone: false,
    isIOS: false,
    hasPrompt: false,
    promptSpent: false,
    installedHere: false,
    hasCanonicalLaunchMarker: false,
    isRoomPath: false,
    ...overrides,
})

describe('deriveInstallState', () => {
    it('flags an unmarked standalone room shortcut for explicit repair', () => {
        expect(deriveInstallState(env({ isStandalone: true, isRoomPath: true }))).toBe('repair')
    })

    it('keeps an unmarked standalone room on repair when a late prompt arrives', () => {
        expect(deriveInstallState(env({ isStandalone: true, isRoomPath: true, hasPrompt: true }))).toBe('repair')
    })

    it('trusts a versioned canonical launch marker before standalone room navigation', () => {
        expect(deriveInstallState(env({ isStandalone: true, isRoomPath: true, hasCanonicalLaunchMarker: true }))).toBe(
            'installed'
        )
        expect(
            deriveInstallState(
                env({ isStandalone: true, isRoomPath: true, hasCanonicalLaunchMarker: true, hasPrompt: true })
            )
        ).toBe('installed')
        expect(deriveInstallState(env({ isStandalone: true }))).toBe('installed')
    })

    it('keeps an install accepted in this tab installed while the browser finishes', () => {
        // The tab that installs the app is still a tab: `display-mode` never flips in it. Without
        // this the row would say "this browser can't add apps" one second after it added one.
        expect(deriveInstallState(env({ installedHere: true, promptSpent: true, hasPrompt: true }))).toBe('installed')
    })

    it('offers the browser prompt whenever one is still live', () => {
        expect(deriveInstallState(env({ hasPrompt: true, isIOS: true }))).toBe('promptable')
    })

    it('says the prompt was declined rather than that the browser cannot install', () => {
        expect(deriveInstallState(env({ promptSpent: true }))).toBe('dismissed')
    })

    it('sends iOS to the how-to sheet without treating a pending browser check as unsupported', () => {
        expect(deriveInstallState(env({ isIOS: true }))).toBe('ios')
        expect(deriveInstallState(env())).toBe('waiting')
    })
})

/**
 * The store, exercised through a fake window. `vitest` runs in `node`, so there is no DOM — but
 * everything that can actually break here is the event wiring, and the alternative is leaving it
 * to a Playwright stub that races hydration.
 */
interface FakeWindow {
    listeners: Map<string, ((event: unknown) => void)[]>
    fire: (type: string, event?: Record<string, unknown>) => void
    store: Map<string, string>
    standalone: boolean
}

function fakeWindow({
    standalone = false,
    ua = 'Mozilla/5.0 (X11; Linux x86_64)',
    platform = 'Linux x86_64',
    maxTouchPoints = 0,
    pathname = '/app',
    search = '',
    denyLocalStorage = false,
} = {}): FakeWindow {
    const listeners = new Map<string, ((event: unknown) => void)[]>()
    const store = new Map<string, string>()
    const state = { standalone }

    const win = {
        addEventListener: (type: string, handler: (event: unknown) => void) => {
            listeners.set(type, [...(listeners.get(type) ?? []), handler])
        },
        matchMedia: () => ({ matches: state.standalone }),
        navigator: { userAgent: ua, platform, maxTouchPoints },
        location: {
            origin: 'https://split.peanut.me',
            href: `https://split.peanut.me${pathname}${search}`,
            pathname,
            search,
        },
        localStorage: {
            getItem: (key: string) => {
                if (denyLocalStorage) throw new Error('storage denied')
                return store.get(key) ?? null
            },
            setItem: (key: string, value: string) => {
                if (denyLocalStorage) throw new Error('storage denied')
                store.set(key, value)
            },
            removeItem: (key: string) => {
                if (denyLocalStorage) throw new Error('storage denied')
                store.delete(key)
            },
        },
    }
    vi.stubGlobal('window', win)

    return {
        listeners,
        store,
        get standalone() {
            return state.standalone
        },
        set standalone(next: boolean) {
            state.standalone = next
        },
        fire: (type, event = {}) => {
            for (const handler of listeners.get(type) ?? []) handler({ preventDefault: () => {}, ...event })
        },
    }
}

describe('the install store', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('paints nothing before the first browser read, then publishes to every subscriber', async () => {
        const win = fakeWindow()
        const { captureInstallPrompt, readInstallState, subscribeInstall } = await import('./install')

        expect(readInstallState()).toBeNull()

        const notified = vi.fn()
        subscribeInstall(notified)
        captureInstallPrompt()

        expect(readInstallState()).toBe('waiting')
        expect(notified).toHaveBeenCalledTimes(1)

        win.fire('beforeinstallprompt')
        expect(readInstallState()).toBe('promptable')
        expect(notified).toHaveBeenCalledTimes(2)
    })

    it('waits for Android Chrome instead of calling it unsupported before its event arrives', async () => {
        const win = fakeWindow({
            ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36',
            platform: 'Linux armv8l',
            maxTouchPoints: 5,
        })
        const { captureInstallPrompt, readInstallState } = await import('./install')

        captureInstallPrompt()
        expect(readInstallState()).toBe('waiting')

        win.fire('beforeinstallprompt')
        expect(readInstallState()).toBe('promptable')
    })

    it('records a canonical standalone /app launch before treating later rooms as installed', async () => {
        const win = fakeWindow({ standalone: true, pathname: '/app' })
        const {
            CANONICAL_LAUNCH_MARKER_KEY,
            captureInstallPrompt,
            hasCanonicalStandaloneLaunch,
            readInstallState,
            recordCanonicalStandaloneLaunch,
        } = await import('./install')

        expect(recordCanonicalStandaloneLaunch()).toBe(true)
        expect(win.store.get(CANONICAL_LAUNCH_MARKER_KEY)).toBe('1')
        expect(hasCanonicalStandaloneLaunch()).toBe(true)

        captureInstallPrompt()
        expect(readInstallState()).toBe('installed')
    })

    it('uses the marker as stronger evidence than an eventual standalone room path', async () => {
        const win = fakeWindow({ standalone: true, pathname: '/r/KUNC' })
        win.store.set('ps:pwa-canonical-launch:v1', '1')
        const { captureInstallPrompt, readInstallState } = await import('./install')

        captureInstallPrompt()

        expect(readInstallState()).toBe('installed')
    })

    it('refuses to write the canonical marker on room and repair routes', async () => {
        const room = fakeWindow({ standalone: true, pathname: '/r/KUNC' })
        const { CANONICAL_LAUNCH_MARKER_KEY, recordCanonicalStandaloneLaunch } = await import('./install')

        expect(recordCanonicalStandaloneLaunch()).toBe(false)
        expect(room.store.has(CANONICAL_LAUNCH_MARKER_KEY)).toBe(false)

        vi.resetModules()
        const repair = fakeWindow({ standalone: true, pathname: '/app', search: '?install=1&repair=1' })
        const repairInstall = await import('./install')
        expect(repairInstall.recordCanonicalStandaloneLaunch()).toBe(false)
        expect(repair.store.has(repairInstall.CANONICAL_LAUNCH_MARKER_KEY)).toBe(false)
    })

    it('keeps an unmarked standalone room actionable when local storage is denied', async () => {
        fakeWindow({ standalone: true, pathname: '/r/KUNC', denyLocalStorage: true })
        const { captureInstallPrompt, readInstallState, recordCanonicalStandaloneLaunch } = await import('./install')

        expect(recordCanonicalStandaloneLaunch()).toBe(false)
        captureInstallPrompt()

        expect(readInstallState()).toBe('repair')
    })

    it('uses an Android Chrome prompt that arrived before React mounted', async () => {
        fakeWindow({
            ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36',
            platform: 'Linux armv8l',
            maxTouchPoints: 5,
        })
        ;(
            window as typeof window & {
                __splitInstallPrompt?: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
            }
        ).__splitInstallPrompt = {
            prompt: () => Promise.resolve(),
            userChoice: Promise.resolve({ outcome: 'accepted' }),
        }
        const { captureInstallPrompt, readInstallState } = await import('./install')

        captureInstallPrompt()
        expect(readInstallState()).toBe('promptable')
    })

    it('registers its listeners once however often the mount effect runs', async () => {
        const win = fakeWindow()
        const { captureInstallPrompt } = await import('./install')

        captureInstallPrompt()
        captureInstallPrompt()

        expect(win.listeners.get('beforeinstallprompt')).toHaveLength(1)
        expect(win.listeners.get('appinstalled')).toHaveLength(1)
    })

    it('replays the event once, and remembers a decline as declined rather than impossible', async () => {
        const win = fakeWindow()
        const { captureInstallPrompt, promptInstall, readInstallState } = await import('./install')
        captureInstallPrompt()

        const prompt = vi.fn(() => Promise.resolve())
        win.fire('beforeinstallprompt', { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }) })

        expect(await promptInstall()).toBe('dismissed')
        expect(prompt).toHaveBeenCalledTimes(1)
        expect(readInstallState()).toBe('dismissed')

        // The event is single-use, so a second tap has nothing to replay.
        expect(await promptInstall()).toBe('unavailable')
        expect(prompt).toHaveBeenCalledTimes(1)
    })

    it('treats an accepted prompt as installed even though this tab is still a tab', async () => {
        const win = fakeWindow()
        const { captureInstallPrompt, promptInstall, readInstallState } = await import('./install')
        captureInstallPrompt()
        win.fire('beforeinstallprompt', {
            prompt: () => Promise.resolve(),
            userChoice: Promise.resolve({ outcome: 'accepted' }),
        })

        expect(await promptInstall()).toBe('accepted')
        expect(win.standalone).toBe(false)
        expect(readInstallState()).toBe('installed')
    })

    it('fails closed when opening the browser prompt throws without recording a decision', async () => {
        const win = fakeWindow()
        const { captureInstallPrompt, promptInstall, readInstallState } = await import('./install')
        captureInstallPrompt()
        win.fire('beforeinstallprompt', {
            prompt: () => {
                throw new Error('browser prompt failed')
            },
            userChoice: Promise.resolve({ outcome: 'dismissed' }),
        })

        expect(await promptInstall()).toBe('unavailable')
        expect(readInstallState()).toBe('waiting')
        expect(await promptInstall()).toBe('unavailable')
    })

    it('fails closed when the browser prompt rejects without recording a decision', async () => {
        const win = fakeWindow()
        const { captureInstallPrompt, promptInstall, readInstallState } = await import('./install')
        captureInstallPrompt()
        win.fire('beforeinstallprompt', {
            prompt: () => Promise.reject(new Error('browser prompt failed')),
            userChoice: Promise.resolve({ outcome: 'accepted' }),
        })

        expect(await promptInstall()).toBe('unavailable')
        expect(readInstallState()).toBe('waiting')
    })

    it('handles an early userChoice rejection while prompt() is pending and fails closed', async () => {
        const win = fakeWindow()
        const { captureInstallPrompt, promptInstall, readInstallState } = await import('./install')
        captureInstallPrompt()

        let finishPrompt: (() => void) | undefined
        const promptPending = new Promise<void>((resolve) => {
            finishPrompt = resolve
        })
        win.fire('beforeinstallprompt', {
            prompt: () => promptPending,
            userChoice: Promise.reject(new Error('browser choice failed')),
        })

        const outcome = promptInstall()
        await Promise.resolve()
        finishPrompt?.()

        expect(await outcome).toBe('unavailable')
        expect(readInstallState()).toBe('waiting')
    })

    it('clears explicit dismissal backoff when the app is installed any other way', async () => {
        const win = fakeWindow()
        const { captureInstallPrompt, isInstallSnoozed, noteInstallDismissed, readInstallState } =
            await import('./install')
        captureInstallPrompt()

        expect(noteInstallDismissed()).toBe(1)
        expect(isInstallSnoozed()).toBe(true)

        // Chrome's omnibox install, not ours.
        win.fire('appinstalled')

        expect(isInstallSnoozed()).toBe(false)
        expect(win.store.size).toBe(0)
        expect(readInstallState()).toBe('installed')
    })

    it('repairs the legacy help-close snooze and its contaminated dismissal on capture', async () => {
        const win = fakeWindow()
        win.store.set('ps:pwa-snoozed-until', String(Date.now() + 30 * 24 * 60 * 60 * 1000))
        win.store.set('ps:pwa-dismiss-count', '4')
        win.store.set('ps:pwa-dismissed-at', String(Date.now()))
        const { captureInstallPrompt, isInstallSnoozed, readInstallState } = await import('./install')

        captureInstallPrompt()

        expect(readInstallState()).toBe('waiting')
        expect(isInstallSnoozed()).toBe(false)
        expect(win.store.size).toBe(0)
    })

    it('keeps the one-time repair acknowledgement separate from install backoff', async () => {
        fakeWindow()
        const { dismissInstallRepairNotice, isInstallRepairNoticeDismissed, isInstallSnoozed, noteInstallDismissed } =
            await import('./install')

        noteInstallDismissed()
        expect(isInstallSnoozed()).toBe(true)
        expect(isInstallRepairNoticeDismissed()).toBe(false)

        dismissInstallRepairNotice()
        expect(isInstallRepairNoticeDismissed()).toBe(true)
    })
})

/**
 * The device question behind the row's label. The row asks it because the label names the
 * affordance the person is about to go looking for, and Apple's is "Add to Home Screen" while
 * everyone else's is an install — a distinction no `InstallState` carries, since `installed` is
 * reachable on both.
 */
describe('the device behind the label', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('answers Apple for an iPhone', async () => {
        fakeWindow({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Safari/604.1' })
        const { isIOSHere } = await import('./install')

        expect(isIOSHere()).toBe(true)
    })

    it('answers Apple for an iPad, which reports the desktop user agent', async () => {
        fakeWindow({
            ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.5 Safari/605.1.15',
            platform: 'MacIntel',
            maxTouchPoints: 5,
        })
        const { isIOSHere } = await import('./install')

        expect(isIOSHere()).toBe(true)
    })

    it('leaves a Mac on the install side: it has a Dock, not a home screen', async () => {
        fakeWindow({
            ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.5 Safari/605.1.15',
            platform: 'MacIntel',
            maxTouchPoints: 0,
        })
        const { isIOSHere } = await import('./install')

        expect(isIOSHere()).toBe(false)
    })
})

describe('the banner backoff', () => {
    it('doubles per dismissal and stops at thirty days', async () => {
        const { installBackoffMs } = await import('./install')
        const hour = 60 * 60 * 1000
        expect(installBackoffMs(1)).toBe(24 * hour)
        expect(installBackoffMs(2)).toBe(48 * hour)
        expect(installBackoffMs(3)).toBe(96 * hour)
        expect(installBackoffMs(99)).toBe(30 * 24 * hour)
    })

    it('is applied only by an explicit dismissal', async () => {
        vi.resetModules()
        fakeWindow()
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
        const { installBackoffMs, isInstallSnoozed, noteInstallDismissed } = await import('./install')

        noteInstallDismissed()
        expect(isInstallSnoozed()).toBe(true)
        now.mockReturnValue(1_000 + installBackoffMs(1) - 1)
        expect(isInstallSnoozed()).toBe(true)
        now.mockReturnValue(1_000 + installBackoffMs(1))
        expect(isInstallSnoozed()).toBe(false)

        now.mockRestore()
        vi.unstubAllGlobals()
    })
})
