/**
 * The client half of locale persistence: writing `ps-locale`.
 *
 * The cookie is authoritative, not localStorage — the server has to know the locale *before* it
 * renders, and localStorage is invisible to it. Deciding on the client would mean shipping an
 * English first paint and correcting it after hydration, which is the flash this whole design
 * exists to avoid. (Settings like sound/haptics stay in `ps:settings`, where a one-frame default
 * costs nothing. Mirroring the locale in there too would just be a second source of truth that
 * can disagree with the one the server actually read.)
 */

import { LOCALE_COOKIE, type Locale } from '@/i18n/locales'

/**
 * One year, re-asserted on every boot. Safari's Intelligent Tracking Prevention caps
 * *script-written* cookies at 7 days rolling, so a user who set Spanish in January and came back
 * in March would silently be served English again. Re-writing on load resets that window for
 * anyone who has been here inside the last week, which is everyone who still cares.
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function writeLocaleCookie(locale: Locale): void {
    if (typeof document === 'undefined') return
    // `SameSite=Lax` and no `Secure`: the cookie carries a UI preference, and dropping `Secure`
    // is what lets it work on plain-http local dev without a second code path.
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`
}

/**
 * Switching language re-renders on the server, so it is a navigation, not a state change:
 * `location.reload()` after the cookie is set. A router refresh would leave client components
 * holding the old messages until they happened to re-mount.
 */
export function setLocaleAndReload(locale: Locale): void {
    writeLocaleCookie(locale)
    window.location.reload()
}
