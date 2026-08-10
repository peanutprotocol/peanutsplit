import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'
// Relative, not `@/lib/...`: the alias is a tsconfig path and this file is excluded from tsconfig,
// so a relative specifier is the one that resolves however the serwist child compiler is set up.
import {
    replaceSharedReceipt,
    SHARE_TARGET_ACTION,
    SHARE_TARGET_FIELD,
    SHARE_TARGET_LANDING,
} from '../lib/shared-receipt'

// Declares `injectionPoint` to TypeScript — replaced at build time by the precache manifest.
declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
    }
}

// @ts-expect-error — service-worker global redeclaration intentional
declare const self: ServiceWorkerGlobalScope

// Domain cutover, retirement stage (2026-08-10): peanutsplit.com is a redirect shell now
// that its app paths 301 to split.peanut.me, and a service worker registered there has
// nothing left to do except keep a stale shell and its push subscriptions alive forever.
// This build unregisters itself on the legacy origin the next time a client fetches it.
// Push subscriptions die with the registration — the accepted retirement decision in
// `docs/SEO-DOMAIN-DECISIONS.md`; opt-ins on the new origin replace them. The origin is a
// literal, not `lib/domains.ts`: that module reads `process.env`, which does not exist in
// a worker unless the serwist child compiler happens to inline it — a crash here would
// take the share-target handler down with it.
if (self.location.origin === 'https://peanutsplit.com') {
    self.addEventListener('activate', (event) => {
        event.waitUntil(self.registration.unregister())
    })
}

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
        // FIRST MATCH WINS — this must stay ahead of defaultCache, which would
        // otherwise hand /api/* to a NetworkFirst handler. A cached RoomState is
        // a money bug: balances that already moved keep rendering as owed, and a
        // prior app shipped a settle soft-lock exactly this way. A spinner is the
        // correct offline answer here.
        {
            matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
            handler: new NetworkOnly(),
        },
        // Hashed /_next/static and the rest of the shell keep Serwist's defaults —
        // immutable URLs are safe to serve from cache.
        ...defaultCache,
    ],
})

/**
 * The OS share sheet, caught before it reaches the network.
 *
 * Registered BEFORE serwist.addEventListeners() on purpose: the first listener to call
 * respondWith owns the request. Serwist's router only handles GET, so an un-owned POST would fall
 * through to the network — and the network is the one place a receipt photo has no reason to go.
 *
 * Everything below survives a share we cannot read: a failure lands on the same screen an empty
 * share does, because a 500 here is a share sheet that silently does nothing.
 */
self.addEventListener('fetch', (event) => {
    const request = event.request
    if (request.method !== 'POST') return
    if (new URL(request.url).pathname !== SHARE_TARGET_ACTION) return

    event.respondWith(
        (async () => {
            try {
                await replaceSharedReceipt(caches, async () => {
                    const file = (await request.formData()).get(SHARE_TARGET_FIELD)
                    return file instanceof File ? file : null
                })
            } catch {
                // Unreadable share. The landing page says so.
            }
            // 303 so the browser follows it as a GET; a POST that redirected as a POST would
            // arrive at a page route as a 405.
            return Response.redirect(new URL(SHARE_TARGET_LANDING, self.location.origin).toString(), 303)
        })()
    )
})

serwist.addEventListeners()

// — web push —
// Payload contract: src/server/notifyCopy.ts. Everything below has to survive a
// push that did not come from us: any push service can deliver an empty or
// plain-text message, and an exception thrown in these handlers takes the whole
// notification with it, not just the parse.

interface SplitPushPayload {
    title?: string
    body?: string
    url?: string
    template?: string
    tag?: string
    sendId?: string
}

/** Fire-and-forget telemetry. A beacon that fails must never stop a tapped
 *  notification from opening the room. */
function beacon(path: string, body: Record<string, unknown>): void {
    try {
        void fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            // The worker can be killed the moment the handler returns; keepalive
            // is what lets the request outlive it.
            keepalive: true,
        }).catch(() => {})
    } catch {
        // Offline, blocked, no network — nothing to do and nobody to tell.
    }
}

/**
 * The home-screen dot, raised.
 *
 * NOT `NotificationOptions.badge`, which is the monochrome status-bar mask and is deliberately
 * absent below. This is the Badging API — a dot on the app icon, no count. A count would need a
 * store this worker writes and the page reads, plus a definition of "unread" that Split has no
 * concept of: there is no read state anywhere in the schema.
 *
 * A dot means "something happened while you were away", so somebody looking at the app is not
 * away. Skipping the badge for a visible window is the only way it gets cleared for them at all —
 * the page clears on mount, focus and visibilitychange, and none of those fire for a window that
 * never went anywhere.
 *
 * A badge that cannot be set must never take the notification with it — same rule as `beacon`.
 */
async function raiseAppBadge(): Promise<void> {
    try {
        const clients = await self.clients.matchAll({ type: 'window' })
        if (clients.some((client) => client.visibilityState === 'visible')) return
        const badging = self.navigator as WorkerNavigator & { setAppBadge?: () => Promise<void> }
        await badging.setAppBadge?.()
    } catch {
        // No Badging API, or permission withheld. The notification still shows.
    }
}

self.addEventListener('push', (event) => {
    if (!event.data) return
    let payload: SplitPushPayload
    try {
        payload = event.data.json() as SplitPushPayload
    } catch {
        // Plain-text push (a probe, or another sender on this endpoint). Showing
        // a notification for it would be worse than showing nothing.
        return
    }

    const options: NotificationOptions = {
        body: payload.body ?? '',
        icon: '/icons/icon-192.png',
        // The status-bar mask. Android keeps the alpha and paints every opaque
        // pixel one colour, so this can only ever be the asset drawn for that:
        // `badge-96.png`, the thumb as a white silhouette on nothing. Pointing
        // it at the colour icon would ship a white blob instead.
        badge: '/icons/badge-96.png',
        // No `image` and no `actions`: both are set only when they have a
        // value, because some browsers warn on an explicit undefined.
        data: { url: payload.url ?? '/app', template: payload.template, sendId: payload.sendId },
        requireInteraction: false,
        ...(payload.tag ? { tag: payload.tag } : {}),
    }
    // Every payload we send carries a title (notifyCopy.ts `titleOf()` returns the room name), so
    // the fallback is the "a push arrived without one" case. It says Split, like the launcher does.
    event.waitUntil(
        Promise.all([self.registration.showNotification(payload.title ?? 'Split', options), raiseAppBadge()])
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const data = (event.notification.data ?? {}) as SplitPushPayload
    const url = data.url ?? '/app'
    // We ship no action buttons, so `event.action` is always ''. If any are ever
    // added, an id nobody handles falls through to this same body-click path
    // rather than doing nothing.
    const action = event.action || null

    event.waitUntil(
        (async () => {
            if (data.sendId) beacon('/api/push/opened', { sendId: data.sendId, template: data.template, action })

            const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            const existing = windows[0]
            if (existing) {
                await existing.focus()
                // NOT client.navigate() — it is non-standard and was removed in
                // Chrome M99. The page owns its own router, so hand it the URL
                // and let it do a normal client-side navigation.
                existing.postMessage({ type: 'navigate', url })
                return
            }
            await self.clients.openWindow(url)
        })()
    )
})

self.addEventListener('notificationclose', (event) => {
    const data = (event.notification.data ?? {}) as SplitPushPayload
    if (!data.sendId) return
    beacon('/api/push/dismissed', { sendId: data.sendId, template: data.template, action: null })
})
