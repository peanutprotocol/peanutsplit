import { describe, expect, it } from 'vitest'
import { SPLIT_CONTENT_INDEX_RELEASED, SPLIT_CONTENT_INDEX_RELEASED_PATHS } from './index-release'
import { splitContentIndexable, splitContentIndexableFor } from './indexability'

const GUIDE = '/guides/split-a-group-trip-across-countries'
const LOCALIZED_GUIDE = '/es-419/guides/split-a-group-trip-across-countries'
const FUTURE_HUB = '/en/split'
const FUTURE_TOOLS_HUB = '/en/split/tools'
const FUTURE_CALCULATOR = '/en/split/tools/rent-split-calculator'

describe('Split content indexability', () => {
    it('ships with both source-controlled release authorities dark', () => {
        expect(SPLIT_CONTENT_INDEX_RELEASED).toBe(false)
        expect(SPLIT_CONTENT_INDEX_RELEASED_PATHS).toEqual([])
    })

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
        expect(splitContentIndexable(GUIDE)).toBe(false)
        expect(splitContentIndexable(LOCALIZED_GUIDE)).toBe(false)
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
        expect(policy(LOCALIZED_GUIDE)).toBe(false)
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
})
