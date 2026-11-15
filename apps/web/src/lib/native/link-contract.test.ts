/**
 * One table for every room-link shape: which ones the store apps claim (the AASA on iOS, the App
 * Link intent filter on Android) and where the link mapper sends each claimed one. The three
 * sources live in different files and drift silently; a claimed URL the mapper cannot place opens
 * the app on a blank screen, and an unclaimed one never leaves the browser.
 *
 * Android's `pathPrefix="/r/"` cannot exclude paths below API 35, so share-card and preview-image
 * URLs open the app there (the mapper sends them to the room), while iOS excludes them and leaves
 * them in the browser.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import capacitorConfig from '../../../capacitor.config'
import { nativePathForUrl } from './links'

const WEB_ROOT = path.resolve(__dirname, '../../..')
const read = (file: string): string => readFileSync(path.join(WEB_ROOT, file), 'utf8')

const SLUG = 'ski-trip-kunc-syrup-drum'
const ROOM = `/room/?slug=${SLUG}`
const ORIGIN = 'https://peanutsplit.com'

/** 'browser': the platform does not claim the URL. A path: the app opens there. */
type Outcome = 'browser' | string

const TABLE: { url: string; ios: Outcome; android: Outcome }[] = [
    { url: `${ORIGIN}/r/${SLUG}`, ios: ROOM, android: ROOM },
    { url: `${ORIGIN}/r/${SLUG}/`, ios: ROOM, android: ROOM },
    { url: `${ORIGIN}/r/${SLUG}?add=1`, ios: `${ROOM}&add=1`, android: `${ROOM}&add=1` },
    { url: `${ORIGIN}/r/${SLUG}?utm_source=whatsapp`, ios: ROOM, android: ROOM },
    { url: `${ORIGIN}/r/${SLUG}#settle`, ios: `${ROOM}#settle`, android: `${ROOM}#settle` },
    { url: `${ORIGIN}/r/${SLUG}/import`, ios: `/room/import/?slug=${SLUG}`, android: `/room/import/?slug=${SLUG}` },
    { url: `${ORIGIN}/r/${SLUG}/recap`, ios: ROOM, android: ROOM },
    // Images: excluded in the AASA, unavoidably claimed by Android's pathPrefix.
    { url: `${ORIGIN}/r/${SLUG}/card/crew`, ios: 'browser', android: ROOM },
    { url: `${ORIGIN}/r/${SLUG}/recap/card`, ios: 'browser', android: ROOM },
    { url: `${ORIGIN}/r/${SLUG}/opengraph-image-1a2b3c`, ios: 'browser', android: ROOM },
    { url: `${ORIGIN}/r/${SLUG}/recap/opengraph-image-1a2b3c`, ios: 'browser', android: ROOM },
    // Pages outside /r/ and every alias host stay on the web.
    { url: `${ORIGIN}/`, ios: 'browser', android: 'browser' },
    { url: `${ORIGIN}/app`, ios: 'browser', android: 'browser' },
    { url: `${ORIGIN}/privacy`, ios: 'browser', android: 'browser' },
    { url: `${ORIGIN}/room?slug=${SLUG}`, ios: 'browser', android: 'browser' },
    { url: `https://www.peanutsplit.com/r/${SLUG}`, ios: 'browser', android: 'browser' },
    { url: `https://split.peanut.me/r/${SLUG}`, ios: 'browser', android: 'browser' },
    { url: `http://peanutsplit.com/r/${SLUG}`, ios: 'browser', android: 'browser' },
]

// --- iOS: apple-app-site-association -------------------------------------------------------------

type AasaComponent = { '/': string; exclude?: boolean }
const aasa = JSON.parse(read('public/.well-known/apple-app-site-association')) as {
    applinks: { details: { appIDs: string[]; components: AasaComponent[] }[] }
}

/** AASA path patterns: `*` matches any run of characters (slashes included), `?` exactly one. */
function aasaPattern(pattern: string): RegExp {
    const body = pattern
        .split('')
        .map((char) => (char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
        .join('')
    return new RegExp(`^${body}$`)
}

/** Universal links: https on the host the entitlement names; the first matching component decides. */
function iosClaims(input: string): boolean {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.hostname !== 'peanutsplit.com') return false
    for (const detail of aasa.applinks.details) {
        const match = detail.components.find((component) => aasaPattern(component['/']).test(url.pathname))
        if (match) return !match.exclude
    }
    return false
}

// --- Android: the autoVerify intent filter -------------------------------------------------------

const manifest = read('android/app/src/main/AndroidManifest.xml')
const appLinkFilter = manifest.match(/<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/)?.[1] ?? ''
const dataAttributes = [...appLinkFilter.matchAll(/<data\b([^>]*)\/>/g)].map((match) =>
    Object.fromEntries([...match[1].matchAll(/android:(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
)

function androidClaims(input: string): boolean {
    const url = new URL(input)
    return dataAttributes.some(
        (data) =>
            url.protocol === `${data.scheme}:` &&
            url.hostname === data.host &&
            data.pathPrefix !== undefined &&
            url.pathname.startsWith(data.pathPrefix)
    )
}

// --- The contract --------------------------------------------------------------------------------

function expectOutcome(url: string, claimed: boolean, outcome: Outcome): void {
    if (outcome === 'browser') {
        expect(claimed, `${url} must stay in the browser`).toBe(false)
        return
    }
    expect(claimed, `${url} must open the app`).toBe(true)
    expect(nativePathForUrl(url), `${url} must map to a screen`).toEqual({ path: outcome })
}

describe('room-link contract', () => {
    it('reads one App Link filter: https, the apex host, pathPrefix /r/', () => {
        expect(dataAttributes).toEqual([{ scheme: 'https', host: 'peanutsplit.com', pathPrefix: '/r/' }])
    })

    it.each(TABLE)('iOS: $url -> $ios', ({ url, ios }) => {
        expectOutcome(url, iosClaims(url), ios)
    })

    it.each(TABLE)('Android: $url -> $android', ({ url, android }) => {
        expectOutcome(url, androidClaims(url), android)
    })

    it('names the same app in both association files as in the native projects', () => {
        const team = read('ios/App/App.xcodeproj/project.pbxproj').match(/DEVELOPMENT_TEAM = (\w+);/)?.[1]
        expect(team).toMatch(/^[A-Z0-9]{10}$/)
        expect(aasa.applinks.details.flatMap((detail) => detail.appIDs)).toEqual([`${team}.${capacitorConfig.appId}`])

        const assetlinks = JSON.parse(read('public/.well-known/assetlinks.json')) as {
            target: { package_name: string }
        }[]
        expect(assetlinks.map((entry) => entry.target.package_name)).toEqual([capacitorConfig.appId])
        expect(read('android/app/build.gradle')).toContain(`applicationId "${capacitorConfig.appId}"`)
    })
})
