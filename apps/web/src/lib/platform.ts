import { siteUrl } from './site'

/** Compile-time: the store-app build inlines '1', the web build '0'. Never user-agent sniffing. */
export const IS_NATIVE_APP = process.env.NEXT_PUBLIC_NATIVE_BUILD === '1'

/** Push UI in the app exists only once Hugo's APNs and FCM credentials do. */
export const NATIVE_PUSH_ENABLED = IS_NATIVE_APP && process.env.NEXT_PUBLIC_NATIVE_PUSH === '1'

type CapacitorGlobal = { Capacitor?: { getPlatform(): string } }

/** Runtime, no import: the native bridge injects window.Capacitor. 'web' in a plain browser. */
export const nativePlatform = (): 'ios' | 'android' | 'web' => {
    const platform = (globalThis as CapacitorGlobal).Capacitor?.getPlatform()
    return platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'web'
}

/** API and card-image URLs. Same-origin on web; the production apex in the app. */
export const apiUrl = (path: string): string => (IS_NATIVE_APP ? `${siteUrl}${path}` : path)

export type RoomView = 'room' | 'import'

/**
 * In-app navigation to a room. Shared links use productUrl('/r/…') instead, never this.
 *
 * The app has no dynamic routes (a static export cannot know the slugs), so a room lives at
 * `/room/?slug=`. The parameter is named `slug`, not `s`, so the Sentry redaction can match it
 * narrowly. On web the result is exactly the path the call sites built before this helper.
 */
export function roomPath(slug: string, view: RoomView = 'room', query = ''): string {
    const encoded = encodeURIComponent(slug)
    if (IS_NATIVE_APP) {
        const base = view === 'import' ? '/room/import/' : '/room/'
        return `${base}?slug=${encoded}${query ? `&${query}` : ''}`
    }
    const base = view === 'import' ? `/r/${encoded}/import` : `/r/${encoded}`
    return query ? `${base}?${query}` : base
}

/** The recap page reads the database on the server; the app ships without it in v1. */
export const RECAP_AVAILABLE = !IS_NATIVE_APP
