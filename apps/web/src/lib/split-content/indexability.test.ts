import { describe, expect, it } from 'vitest'
import { SPLIT_CONTENT_INDEX_RELEASED, SPLIT_CONTENT_INDEX_RELEASED_PATHS } from './index-release'
import { splitContentIndexable, splitContentIndexableFor, splitContentIndexableFromHeaders } from './indexability'
import {
    SPLIT_CONTENT_INDEX_RENDER_HEADER,
    SPLIT_EDGE_INDEX_RELEASED_HEADER,
    SPLIT_MANIFEST_SHA256_HEADER,
} from './transport'

const GUIDE = '/en/split/guides/split-a-group-trip-across-countries'
const FUTURE_HUB = '/en/split'
const FUTURE_TOOLS_HUB = '/en/split/tools'
const FUTURE_CALCULATOR = '/en/split/tools/rent-split-calculator'

describe('Split content indexability', () => {
    it('ships with both source-controlled release authorities dark', () => {
        expect(SPLIT_CONTENT_INDEX_RELEASED).toBe(false)
        expect(SPLIT_CONTENT_INDEX_RELEASED_PATHS).toEqual([])
    })

    it('cannot be enabled by runtime or edge configuration while the source release bit is false', () => {
        for (const runtimeValue of [undefined, '', 'false', 'true', '1', 'TRUE', ' true ']) {
            expect(
                splitContentIndexableFor({
                    runtimeValue,
                    sourceReleased: false,
                    releasedPaths: [GUIDE],
                    publicPath: GUIDE,
                    edgeReleased: true,
                })
            ).toBe(false)
        }
        expect(splitContentIndexable(GUIDE, true)).toBe(false)
    })

    it('releases only exact source-reviewed paths after the global and edge gates open', () => {
        const policy = (publicPath: string, edgeReleased = true) =>
            splitContentIndexableFor({
                runtimeValue: 'true',
                sourceReleased: true,
                releasedPaths: [GUIDE],
                publicPath,
                edgeReleased,
            })

        expect(policy(GUIDE)).toBe(true)
        expect(policy(GUIDE, false)).toBe(false)
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
                    edgeReleased: true,
                })
            ).toBe(false)
        }
        expect(
            splitContentIndexableFor({
                runtimeValue: 'true',
                sourceReleased: true,
                releasedPaths: [GUIDE],
                publicPath: GUIDE,
                edgeReleased: true,
            })
        ).toBe(true)
    })

    it('ignores caller edge controls and remains closed while the committed source registry is empty', () => {
        const caller = new Headers({
            [SPLIT_EDGE_INDEX_RELEASED_HEADER]: '1',
            [SPLIT_MANIFEST_SHA256_HEADER]: 'a'.repeat(64),
        })
        expect(splitContentIndexableFromHeaders(caller, GUIDE)).toBe(false)
        caller.set(SPLIT_CONTENT_INDEX_RENDER_HEADER, '1')
        expect(splitContentIndexableFromHeaders(caller, GUIDE)).toBe(false)
    })
})
