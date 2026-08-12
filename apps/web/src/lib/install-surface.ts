export const INSTALL_SURFACE_SOURCES = ['auto', 'settings', 'app'] as const
export type InstallSurfaceSource = (typeof INSTALL_SURFACE_SOURCES)[number]

export const INSTALL_REPAIR_ROOM_URL_KEY = 'ps:pwa-repair-room-url:v1'

export const installSurfaceSource = (value: unknown): InstallSurfaceSource =>
    (INSTALL_SURFACE_SOURCES as readonly unknown[]).includes(value) ? (value as InstallSurfaceSource) : 'app'

export const isInstallRepairRequest = (value: unknown): boolean => value === '1'

/** A direct app install page must never surface a room URL left by an earlier journey in the tab. */
export const shouldOfferStoredRoomUrl = (source: InstallSurfaceSource, repair: boolean): boolean =>
    repair || source !== 'app'

export const installSurfacePath = (
    source: InstallSurfaceSource = 'app',
    { repair = false }: { repair?: boolean } = {}
): string => `/app?install=1${repair ? '&repair=1' : ''}&source=${encodeURIComponent(source)}`

const validRoomUrl = (raw: string | null): string | null => {
    if (!raw) return null
    try {
        const url = new URL(raw, window.location.origin)
        return url.origin === window.location.origin && /^\/r\/[^/]+\/?$/.test(url.pathname)
            ? `${url.origin}${url.pathname}`
            : null
    } catch {
        return null
    }
}

/** Keep the capability-bearing room URL on this device and out of routes, analytics, and servers. */
export const rememberInstallRepairRoomUrl = (): boolean => {
    try {
        const roomUrl = validRoomUrl(window.location.href)
        if (!roomUrl) return false
        window.sessionStorage.setItem(INSTALL_REPAIR_ROOM_URL_KEY, roomUrl)
        return true
    } catch {
        return false
    }
}

export const readInstallRepairRoomUrl = (): string | null => {
    try {
        return validRoomUrl(window.sessionStorage.getItem(INSTALL_REPAIR_ROOM_URL_KEY))
    } catch {
        return null
    }
}

/**
 * A room slug is a bearer capability. A normal same-origin navigation would repeat that path in
 * the `/app` request's Referer header, even though the destination itself is slug-free. Navigating
 * through a noreferrer link preserves the full document load Chromium needs for manifest
 * discovery without copying the room capability into another request or an access log.
 */
const navigateWithoutReferrer = (path: string): void => {
    const link = document.createElement('a')
    link.href = path
    link.rel = 'noreferrer'
    link.target = '_self'
    link.click()
}

/**
 * A full navigation gives Chromium a fresh canonical document and manifest-discovery pass. Keep
 * the original room locally so a person leaving an embedded browser can reopen it after install.
 */
export const openInstallSurface = (source: InstallSurfaceSource): void => {
    rememberInstallRepairRoomUrl()
    navigateWithoutReferrer(installSurfacePath(source))
}

/** The repair flag keeps `/app` from mistaking the old standalone shortcut for a correct launch. */
export const openInstallRepairSurface = (source: InstallSurfaceSource): void => {
    rememberInstallRepairRoomUrl()
    navigateWithoutReferrer(installSurfacePath(source, { repair: true }))
}
