import { afterEach, describe, expect, it, vi } from 'vitest'
import { splitGuidePaths } from './artifact'
import { SPLIT_CONTENT_INDEX_RELEASED, SPLIT_CONTENT_INDEX_RELEASED_PATHS } from './index-release'
import { splitContentIndexable, splitContentIndexableFor, splitContentSourceReleased } from './indexability'
import { sourceReleasedSplitGuides } from './released'

const GUIDE = '/guides/ask-a-friend-to-pay-you-back'
const PARKED = [
    '/guides/split-a-group-trip-across-countries',
    '/es-419/guides/split-a-group-trip-across-countries',
    '/pt-br/guides/split-a-group-trip-across-countries',
    '/guides/split-expenses-across-currencies',
    '/es-419/guides/split-expenses-across-currencies',
    '/pt-br/guides/split-expenses-across-currencies',
]
const FUTURE_HUB = '/en/split'
const FUTURE_TOOLS_HUB = '/en/split/tools'
const FUTURE_CALCULATOR = '/en/split/tools/rent-split-calculator'

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('Split content release registry', () => {
    it('releases exactly the nine reviewed guide URLs', () => {
        expect(SPLIT_CONTENT_INDEX_RELEASED).toBe(true)
        expect([...SPLIT_CONTENT_INDEX_RELEASED_PATHS]).toEqual([
            '/es-419/guides/ask-a-friend-to-pay-you-back',
            '/guides/ask-a-friend-to-pay-you-back',
            '/guides/someone-drops-out-of-a-group-trip',
            '/guides/split-holiday-house-per-person-or-per-room',
            '/guides/splitwise-currency-conversion',
            '/guides/splitwise-vs-settle-up',
            '/guides/why-do-i-owe-someone-i-never-paid',
            '/pt-br/guides/ask-a-friend-to-pay-you-back',
            '/pt-br/guides/split-shared-house-bills',
        ])
    })

    /**
     * Both halves matter. A released path the artifact does not render is a sitemap entry pointing
     * at a 404; the pinned order is what keeps a diff to the list readable as an addition or a
     * removal rather than a reshuffle.
     */
    it('names only paths the installed artifact renders, in the artifact’s own order', () => {
        const guidePaths = splitGuidePaths()
        const released: readonly string[] = SPLIT_CONTENT_INDEX_RELEASED_PATHS

        expect(guidePaths.filter((publicPath) => released.includes(publicPath))).toEqual([...released])
    })

    /**
     * The two topics that already rank at `/blog/<slug>`. They stay installed as the validator's
     * byte-pinned fixture and stay out of every index — releasing them would put two pages with
     * one title on one domain.
     */
    it('keeps the six parked guides out of the registry in every locale', () => {
        const released: readonly string[] = SPLIT_CONTENT_INDEX_RELEASED_PATHS
        const guidePaths = splitGuidePaths()

        for (const publicPath of PARKED) {
            expect(guidePaths, publicPath).toContain(publicPath)
            expect(released, publicPath).not.toContain(publicPath)
        }
    })
})

describe('Split content indexability', () => {
    it('cannot be enabled by runtime configuration while the source release bit is false', () => {
        for (const runtimeValue of [undefined, '', 'false', 'true', '1', 'TRUE', ' true ']) {
            expect(
                splitContentIndexableFor({
                    runtimeValue,
                    sourceReleased: false,
                    releasedPaths: [GUIDE],
                    publicPath: GUIDE,
                })
            ).toBe(false)
        }
    })

    it('releases only exact source-reviewed paths after the global gate opens', () => {
        const policy = (publicPath: string) =>
            splitContentIndexableFor({
                runtimeValue: 'true',
                sourceReleased: true,
                releasedPaths: [GUIDE],
                publicPath,
            })

        expect(policy(GUIDE)).toBe(true)
        expect(policy('/es-419/guides/ask-a-friend-to-pay-you-back')).toBe(false)
        expect(policy(FUTURE_HUB)).toBe(false)
        expect(policy(FUTURE_TOOLS_HUB)).toBe(false)
        expect(policy(FUTURE_CALCULATOR)).toBe(false)
        expect(policy(`${GUIDE}/extra`)).toBe(false)
    })

    it('requires an exact runtime enable value for an otherwise released path', () => {
        for (const runtimeValue of [undefined, '', 'false', '1', 'TRUE', ' true ']) {
            expect(
                splitContentIndexableFor({
                    runtimeValue,
                    sourceReleased: true,
                    releasedPaths: [GUIDE],
                    publicPath: GUIDE,
                })
            ).toBe(false)
        }
        expect(
            splitContentIndexableFor({
                runtimeValue: 'true',
                sourceReleased: true,
                releasedPaths: [GUIDE],
                publicPath: GUIDE,
            })
        ).toBe(true)
    })

    it('stays dark on a deployment that has not set the runtime flag, released path or not', () => {
        for (const runtimeValue of [undefined, 'false']) {
            vi.stubEnv('SEO_INDEXABLE', runtimeValue)
            for (const publicPath of [...SPLIT_CONTENT_INDEX_RELEASED_PATHS, ...PARKED]) {
                expect(splitContentIndexable(publicPath), `${runtimeValue} ${publicPath}`).toBe(false)
            }
        }
    })

    it('indexes the released nine and nothing else once the runtime flag is on', () => {
        vi.stubEnv('SEO_INDEXABLE', 'true')

        expect(splitGuidePaths().filter((publicPath) => splitContentIndexable(publicPath))).toEqual([
            ...SPLIT_CONTENT_INDEX_RELEASED_PATHS,
        ])
        for (const publicPath of PARKED) expect(splitContentIndexable(publicPath), publicPath).toBe(false)
    })
})

/**
 * The reader-facing half. `splitContentIndexable` ends in `process.env.SEO_INDEXABLE`, which only
 * the deployed image sets — using it to decide a link would make the hub list nine guides in
 * production and none on any box that could check the markup before it shipped.
 */
describe('Split content source release, without the runtime flag', () => {
    it('names the registry paths whatever the runtime flag says', () => {
        for (const runtimeValue of [undefined, 'false', 'true']) {
            vi.stubEnv('SEO_INDEXABLE', runtimeValue)
            for (const publicPath of SPLIT_CONTENT_INDEX_RELEASED_PATHS) {
                expect(splitContentSourceReleased(publicPath), `${runtimeValue} ${publicPath}`).toBe(true)
            }
            for (const publicPath of PARKED) {
                expect(splitContentSourceReleased(publicPath), `${runtimeValue} ${publicPath}`).toBe(false)
            }
        }
    })

    it('lists one locale at a time, released only, on a box that never claimed to be indexed', () => {
        vi.stubEnv('SEO_INDEXABLE', undefined)

        expect(sourceReleasedSplitGuides('es-419').map((guide) => guide.href)).toEqual([
            '/es-419/guides/ask-a-friend-to-pay-you-back',
        ])
        expect(sourceReleasedSplitGuides('pt-br').map((guide) => guide.href)).toEqual([
            '/pt-br/guides/ask-a-friend-to-pay-you-back',
            '/pt-br/guides/split-shared-house-bills',
        ])
        expect(sourceReleasedSplitGuides('en').map((guide) => guide.href)).toEqual([
            '/guides/ask-a-friend-to-pay-you-back',
            '/guides/someone-drops-out-of-a-group-trip',
            '/guides/split-holiday-house-per-person-or-per-room',
            '/guides/splitwise-currency-conversion',
            '/guides/splitwise-vs-settle-up',
            '/guides/why-do-i-owe-someone-i-never-paid',
        ])
    })
})
