import { loadHost } from './host'
import { nativePathForUrl } from './links'

export type LinkAction = { navigate: string } | { open: string } | null

/**
 * Parses an href the way a browser would, except that a protocol-relative `//host/path` is read as
 * https. Resolved against the app's own `capacitor://localhost` base it would otherwise point the
 * WebView itself at a foreign host.
 */
function resolveHref(href: string, base: string): URL | null {
    const raw = href.trim()
    try {
        return raw.startsWith('//') ? new URL(`https:${raw}`) : new URL(raw, base)
    } catch {
        return null
    }
}

const isWeb = (url: URL): boolean => url.protocol === 'https:' || url.protocol === 'http:'

/** Compared by scheme and host: `capacitor://localhost` has an opaque ("null") origin, as mailto: does. */
const isAppUrl = (url: URL, app: URL): boolean => url.protocol === app.protocol && url.host === app.host

/**
 * What a link to `href` does in the app (ARCHITECTURE 9.3). `base` is the app's own location.
 * `{ navigate }` stays in the router; `{ open }` goes to the system browser sheet; null leaves the
 * WebView's default alone (unmapped in-app links, `#` anchors, mailto:, tel:, blob: downloads). A
 * `javascript:` or other scheme is never handed to the browser sheet.
 */
export function linkAction(href: string, base: string, mapUrl: typeof nativePathForUrl = nativePathForUrl): LinkAction {
    const url = resolveHref(href, base)
    if (!url) return null
    const inApp = isAppUrl(url, new URL(base))
    if (!isWeb(url) && !inApp) return null
    if (inApp && href.trim().startsWith('#')) return null
    // An in-app href such as `/privacy` is a product path the bundle does not ship. The mapper reads
    // a bare path as one on the product origin, so it comes back as a route or a browser link.
    const mapped = mapUrl(inApp ? `${url.pathname}${url.search}${url.hash}` : url.href)
    if (mapped && 'path' in mapped) return { navigate: mapped.path }
    if (mapped && 'external' in mapped) return { open: mapped.external }
    return inApp ? null : { open: url.href }
}

/** The `window.open` target in the app: an absolute http(s) URL on another host for the browser sheet, or null. */
export function windowOpenTarget(target: string | URL | undefined, base: string): string | null {
    if (target === undefined || target === '') return null
    const url = resolveHref(String(target), base)
    return url && isWeb(url) && !isAppUrl(url, new URL(base)) ? url.href : null
}

function openInBrowser(url: string): void {
    void loadHost()?.then((host) => host.browser.open(url))
}

/**
 * Sends taps on links that leave the app to the system browser (SFSafariViewController or a Custom
 * Tab) and keeps room links in the router, so the person stays in the app. Also replaces
 * `window.open`, which SettleDrawer uses for the peanut.me link. Covers LandingLink, the Privacy
 * link and the settle link with no per-component edits. Returns a disposer.
 *
 * The listener runs in the capture phase on `document`, before React's handlers, so a Next `Link`
 * sees `defaultPrevented` and does not navigate a second time.
 */
export function installExternalLinks(navigate: (path: string) => void): () => void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}

    const onClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const target = event.target as Element | null
        const anchor = typeof target?.closest === 'function' ? target.closest('a[href]') : null
        const href = anchor?.getAttribute('href')
        if (!href) return
        const action = linkAction(href, window.location.href)
        if (!action) return
        event.preventDefault()
        if ('navigate' in action) navigate(action.navigate)
        else openInBrowser(action.open)
    }

    const originalOpen = window.open
    window.open = ((target?: string | URL) => {
        const url = windowOpenTarget(target, window.location.href)
        if (url) openInBrowser(url)
        // The WebView never gets a second window; callers ignore the return value.
        return null
    }) as typeof window.open

    document.addEventListener('click', onClick, true)
    return () => {
        document.removeEventListener('click', onClick, true)
        window.open = originalOpen
    }
}
