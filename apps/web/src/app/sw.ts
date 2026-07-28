import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

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

serwist.addEventListeners()
