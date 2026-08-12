import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    INSTALL_REPAIR_ROOM_URL_KEY,
    installSurfacePath,
    installSurfaceSource,
    isInstallRepairRequest,
    openInstallRepairSurface,
    openInstallSurface,
    readInstallRepairRoomUrl,
    rememberInstallRepairRoomUrl,
    shouldOfferStoredRoomUrl,
} from './install-surface'

describe('the canonical install surface', () => {
    it('never carries room identity in its path', () => {
        expect(installSurfacePath('auto')).toBe('/app?install=1&source=auto')
        expect(installSurfacePath('settings')).toBe('/app?install=1&source=settings')
        expect(installSurfacePath()).toBe('/app?install=1&source=app')
        expect(installSurfacePath()).not.toContain('/r/')
    })

    it('parses and builds the explicit, slug-free repair request', () => {
        expect(installSurfacePath('auto', { repair: true })).toBe('/app?install=1&repair=1&source=auto')
        expect(isInstallRepairRequest('1')).toBe(true)
        expect(isInstallRepairRequest(['1'])).toBe(false)
        expect(isInstallRepairRequest('0')).toBe(false)
    })

    it('accepts only the closed, identifier-free source enum', () => {
        expect(installSurfaceSource('auto')).toBe('auto')
        expect(installSurfaceSource('settings')).toBe('settings')
        expect(installSurfaceSource('private-room-slug')).toBe('app')
        expect(installSurfaceSource(undefined)).toBe('app')
    })

    it('never offers a stale room URL on a later direct app install visit', () => {
        expect(shouldOfferStoredRoomUrl('app', false)).toBe(false)
        expect(shouldOfferStoredRoomUrl('auto', false)).toBe(true)
        expect(shouldOfferStoredRoomUrl('settings', false)).toBe(true)
        expect(shouldOfferStoredRoomUrl('app', true)).toBe(true)
    })
})

describe('room shortcut repair handoff', () => {
    afterEach(() => vi.unstubAllGlobals())

    const stubWindow = ({ denyStorage = false } = {}) => {
        const values = new Map<string, string>()
        const anchor = { href: '', rel: '', target: '', click: vi.fn() }
        vi.stubGlobal('window', {
            location: {
                origin: 'https://split.peanut.me',
                href: 'https://split.peanut.me/r/KUNC?utm_source=share#person',
            },
            sessionStorage: {
                getItem: (key: string) => {
                    if (denyStorage) throw new Error('denied')
                    return values.get(key) ?? null
                },
                setItem: (key: string, value: string) => {
                    if (denyStorage) throw new Error('denied')
                    values.set(key, value)
                },
            },
        })
        vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
        return { anchor, values }
    }

    it('keeps the original room URL only in session storage and out of the repair route', () => {
        const { anchor, values } = stubWindow()

        openInstallRepairSurface('settings')

        expect(values.get(INSTALL_REPAIR_ROOM_URL_KEY)).toBe('https://split.peanut.me/r/KUNC')
        expect(anchor).toMatchObject({
            href: '/app?install=1&repair=1&source=settings',
            rel: 'noreferrer',
            target: '_self',
        })
        expect(anchor.click).toHaveBeenCalledOnce()
        expect(anchor.href).not.toContain('KUNC')
        expect(anchor.href).not.toContain('utm_source')
        expect(readInstallRepairRoomUrl()).toBe('https://split.peanut.me/r/KUNC')
    })

    it('keeps the room available for an ordinary cross-browser install without putting it in the URL', () => {
        const { anchor, values } = stubWindow()

        openInstallSurface('auto')

        expect(values.get(INSTALL_REPAIR_ROOM_URL_KEY)).toBe('https://split.peanut.me/r/KUNC')
        expect(anchor).toMatchObject({ href: '/app?install=1&source=auto', rel: 'noreferrer', target: '_self' })
        expect(anchor.click).toHaveBeenCalledOnce()
        expect(anchor.href).not.toContain('KUNC')
    })

    it('still opens repair when session storage is denied', () => {
        const { anchor } = stubWindow({ denyStorage: true })

        expect(rememberInstallRepairRoomUrl()).toBe(false)
        expect(() => openInstallRepairSurface('auto')).not.toThrow()
        expect(anchor).toMatchObject({
            href: '/app?install=1&repair=1&source=auto',
            rel: 'noreferrer',
            target: '_self',
        })
        expect(anchor.click).toHaveBeenCalledOnce()
        expect(readInstallRepairRoomUrl()).toBeNull()
    })

    it('rejects nested room routes rather than restoring a recap as the room', () => {
        const { values } = stubWindow()
        values.set(INSTALL_REPAIR_ROOM_URL_KEY, 'https://split.peanut.me/r/KUNC/recap')

        expect(readInstallRepairRoomUrl()).toBeNull()
    })
})
