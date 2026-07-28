import { afterAll, describe, expect, it } from 'vitest'
import { splitV2Enabled } from './flags'

const prior = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED

afterAll(() => {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
    else process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = prior
})

describe('splitV2Enabled', () => {
    it('keeps v1 unless the deployment opts in literally', () => {
        delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
        expect(splitV2Enabled()).toBe(false)
        process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = 'true'
        expect(splitV2Enabled()).toBe(false)
    })

    it('enables v2 with the documented build value', () => {
        process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = '1'
        expect(splitV2Enabled()).toBe(true)
    })
})
