import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

// Declares `injectionPoint` to TypeScript — replaced at build time by the precache manifest.
declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
    }
}

// @ts-expect-error — service-worker global redeclaration intentional
declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: defaultCache,
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
        // No `badge`. Android renders the badge as a monochrome mask — every
        // opaque pixel becomes solid white — so pointing it at the colour icon
        // ships a white blob. It goes in the day there is a real
        // monochrome-with-alpha asset, and not before.
        //
        // No `image` and no `actions` either: both are set only when they have a
        // value, because some browsers warn on an explicit undefined.
        data: { url: payload.url ?? '/', template: payload.template, sendId: payload.sendId },
        requireInteraction: false,
        ...(payload.tag ? { tag: payload.tag } : {}),
    }
    event.waitUntil(self.registration.showNotification(payload.title ?? 'Peanut Split', options))
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const data = (event.notification.data ?? {}) as SplitPushPayload
    const url = data.url ?? '/'
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
