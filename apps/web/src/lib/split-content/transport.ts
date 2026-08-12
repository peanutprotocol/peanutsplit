import { createHash, timingSafeEqual } from 'node:crypto'
import { isLocale, type Locale } from '@/i18n/locales'
import { SPLIT_EDGE_MARKER_SHA256 } from './marker-release'

export const SPLIT_ASSET_PREFIX = '/split-static'
export const SPLIT_SITEMAP_PATH = '/split-sitemap.xml'
export const SPLIT_EDGE_MARKER_HEADER = 'x-peanut-split-edge-marker'
export const SPLIT_MANIFEST_SHA256_HEADER = 'x-peanut-split-manifest-sha256'
export const SPLIT_EDGE_INDEX_RELEASED_HEADER = 'x-peanut-split-index-released'
export const SPLIT_CONTENT_RENDER_HEADER = 'x-peanut-split-content-render'
export const SPLIT_CONTENT_INDEX_RENDER_HEADER = 'x-peanut-split-index-render'

export const SPLIT_DIAGNOSTIC_HEADERS = {
    hostPresent: 'x-split-content-host-present',
    forwardedHostPresent: 'x-split-content-forwarded-host-present',
    cookiePresent: 'x-split-content-cookie-present',
    authorizationPresent: 'x-split-content-authorization-present',
    markerValid: 'x-split-content-marker-valid',
    manifestValid: 'x-split-content-manifest-valid',
    indexHeaderValid: 'x-split-content-index-header-valid',
    indexReleased: 'x-split-content-index-released',
    releaseValid: 'x-split-content-release-valid',
    content: 'x-split-content-is-content',
    asset: 'x-split-content-is-asset',
    sitemap: 'x-split-content-is-sitemap',
} as const

export type SplitTransportKind = 'content' | 'asset' | 'sitemap'
export type SplitTransportRoute =
    | { action: 'forward'; kind: 'content'; locale: Locale }
    | { action: 'forward'; kind: 'asset' | 'sitemap' }
    | { action: 'not-found' }
    | { action: 'pass' }

export interface SplitTransportDiagnostics {
    kind: SplitTransportKind
    hostPresent: boolean
    forwardedHostPresent: boolean
    cookiePresent: boolean
    authorizationPresent: boolean
    markerValid: boolean
    manifestValid: boolean
    indexHeaderValid: boolean
    indexReleased: boolean
    releaseValid: boolean
}

const GUIDE_PATH = /^\/([^/]+)\/split\/guides\/([a-z0-9]+(?:-[a-z0-9]+)*)$/
const MINIMUM_MARKER_LENGTH = 32
const SHA256_HEX = /^[a-f0-9]{64}$/
const DISABLED_MARKER_SHA256 = '0'.repeat(64)
const MAX_MANIFEST_DIGEST_HEADER_LENGTH = 64 * 2 + 1

export function classifySplitTransport(pathname: string): SplitTransportRoute {
    if (pathname === SPLIT_SITEMAP_PATH) return { action: 'forward', kind: 'sitemap' }
    if (pathname === SPLIT_ASSET_PREFIX || pathname.startsWith(`${SPLIT_ASSET_PREFIX}/`)) {
        return { action: 'forward', kind: 'asset' }
    }

    const guide = GUIDE_PATH.exec(pathname)
    if (guide) {
        const locale = guide[1]
        return isLocale(locale) ? { action: 'forward', kind: 'content', locale } : { action: 'not-found' }
    }

    if (
        pathname === '/split' ||
        pathname.startsWith('/split/') ||
        /^\/[^/]+\/split(?:\/|$)/.test(pathname) ||
        pathname.startsWith(`${SPLIT_SITEMAP_PATH}/`)
    ) {
        return { action: 'not-found' }
    }
    return { action: 'pass' }
}

export function hasSplitMarker(headers: Headers): boolean {
    return headers.has(SPLIT_EDGE_MARKER_HEADER)
}

export function hasValidSplitMarker(headers: Headers, expectedDigest: string = SPLIT_EDGE_MARKER_SHA256): boolean {
    const suppliedMarker = headers.get(SPLIT_EDGE_MARKER_HEADER)
    if (
        !suppliedMarker ||
        suppliedMarker.length < MINIMUM_MARKER_LENGTH ||
        !SHA256_HEX.test(expectedDigest) ||
        expectedDigest === DISABLED_MARKER_SHA256
    ) {
        return false
    }

    const suppliedDigest = createHash('sha256').update(suppliedMarker).digest()
    const expected = Buffer.from(expectedDigest, 'hex')
    return expected.length === suppliedDigest.length && timingSafeEqual(suppliedDigest, expected)
}

export function hasValidSplitManifestDigest(headers: Headers, expectedDigest: string | null): boolean {
    const suppliedValue = headers.get(SPLIT_MANIFEST_SHA256_HEADER)
    if (
        !suppliedValue ||
        suppliedValue.length > MAX_MANIFEST_DIGEST_HEADER_LENGTH ||
        !expectedDigest ||
        !SHA256_HEX.test(expectedDigest) ||
        expectedDigest === DISABLED_MARKER_SHA256
    ) {
        return false
    }

    const candidates = suppliedValue.split(',')
    if (
        candidates.length < 1 ||
        candidates.length > 2 ||
        candidates.some((candidate) => !SHA256_HEX.test(candidate) || candidate === DISABLED_MARKER_SHA256) ||
        new Set(candidates).size !== candidates.length ||
        candidates.join(',') !== [...candidates].sort().join(',')
    ) {
        return false
    }

    const expected = Buffer.from(expectedDigest, 'hex')
    // Always perform two fixed-width comparisons so an overlap does not reveal which candidate is
    // deployed. The all-zero padding value is forbidden above and cannot match a valid expected hash.
    const boundedCandidates = candidates.length === 1 ? [...candidates, DISABLED_MARKER_SHA256] : candidates
    let matched = 0
    for (const candidate of boundedCandidates) {
        matched |= Number(timingSafeEqual(Buffer.from(candidate, 'hex'), expected))
    }
    return matched === 1
}

export function splitEdgeIndexReleased(headers: Headers): boolean | null {
    const value = headers.get(SPLIT_EDGE_INDEX_RELEASED_HEADER)
    if (value === '0') return false
    if (value === '1') return true
    return null
}

export function inspectSplitTransport(
    kind: SplitTransportKind,
    headers: Headers,
    expectedMarkerDigest: string = SPLIT_EDGE_MARKER_SHA256,
    expectedManifestDigest: string | null = null
): SplitTransportDiagnostics {
    const markerValid = hasValidSplitMarker(headers, expectedMarkerDigest)
    const manifestValid = hasValidSplitManifestDigest(headers, expectedManifestDigest)
    const indexReleased = splitEdgeIndexReleased(headers)
    const indexHeaderValid = indexReleased !== null
    return {
        kind,
        hostPresent: headers.has('host'),
        forwardedHostPresent: headers.has('x-forwarded-host'),
        cookiePresent: headers.has('cookie'),
        authorizationPresent: headers.has('authorization'),
        markerValid,
        manifestValid,
        indexHeaderValid,
        indexReleased: indexReleased === true,
        releaseValid: markerValid && manifestValid && indexHeaderValid,
    }
}

/** Caller-supplied transport state must never become trusted internal request state. */
export function scrubSplitControlHeaders(headers: Headers): Headers {
    const sanitized = new Headers(headers)
    sanitized.delete(SPLIT_EDGE_MARKER_HEADER)
    sanitized.delete(SPLIT_MANIFEST_SHA256_HEADER)
    sanitized.delete(SPLIT_EDGE_INDEX_RELEASED_HEADER)
    sanitized.delete(SPLIT_CONTENT_RENDER_HEADER)
    sanitized.delete(SPLIT_CONTENT_INDEX_RENDER_HEADER)
    for (const header of Object.values(SPLIT_DIAGNOSTIC_HEADERS)) sanitized.delete(header)
    return sanitized
}

/** Credentials, release attestation, and caller diagnostics cannot reach React or a route handler. */
export function sanitizedSplitTransportHeaders(headers: Headers): Headers {
    const sanitized = scrubSplitControlHeaders(headers)
    sanitized.delete('cookie')
    sanitized.delete('authorization')
    return sanitized
}

const bit = (value: boolean): '0' | '1' => (value ? '1' : '0')

export function splitTransportResponseHeaders(diagnostics: SplitTransportDiagnostics, indexable: boolean): Headers {
    const headers = new Headers({
        [SPLIT_DIAGNOSTIC_HEADERS.hostPresent]: bit(diagnostics.hostPresent),
        [SPLIT_DIAGNOSTIC_HEADERS.forwardedHostPresent]: bit(diagnostics.forwardedHostPresent),
        [SPLIT_DIAGNOSTIC_HEADERS.cookiePresent]: bit(diagnostics.cookiePresent),
        [SPLIT_DIAGNOSTIC_HEADERS.authorizationPresent]: bit(diagnostics.authorizationPresent),
        [SPLIT_DIAGNOSTIC_HEADERS.markerValid]: bit(diagnostics.markerValid),
        [SPLIT_DIAGNOSTIC_HEADERS.manifestValid]: bit(diagnostics.manifestValid),
        [SPLIT_DIAGNOSTIC_HEADERS.indexHeaderValid]: bit(diagnostics.indexHeaderValid),
        [SPLIT_DIAGNOSTIC_HEADERS.indexReleased]: bit(diagnostics.indexReleased),
        [SPLIT_DIAGNOSTIC_HEADERS.releaseValid]: bit(diagnostics.releaseValid),
        [SPLIT_DIAGNOSTIC_HEADERS.content]: bit(diagnostics.kind === 'content'),
        [SPLIT_DIAGNOSTIC_HEADERS.asset]: bit(diagnostics.kind === 'asset'),
        [SPLIT_DIAGNOSTIC_HEADERS.sitemap]: bit(diagnostics.kind === 'sitemap'),
        'cache-control': 'private, no-store',
    })
    if (!indexable) headers.set('x-robots-tag', 'noindex, nofollow, noarchive')
    return headers
}

export function isSplitContentRender(headers: Headers): boolean {
    return headers.get(SPLIT_CONTENT_RENDER_HEADER) === '1'
}

export function isSplitContentIndexRender(headers: Headers): boolean {
    return headers.get(SPLIT_CONTENT_INDEX_RENDER_HEADER) === '1'
}
