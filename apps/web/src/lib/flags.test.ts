import { afterAll, describe, expect, it } from 'vitest'
import { landingVariant, splitV2Enabled } from './flags'

const prior = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
const priorLandingVariant = process.env.NEXT_PUBLIC_LANDING_VARIANT

afterAll(() => {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
    else process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = prior

    if (priorLandingVariant === undefined) delete process.env.NEXT_PUBLIC_LANDING_VARIANT
    else process.env.NEXT_PUBLIC_LANDING_VARIANT = priorLandingVariant
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

describe('landingVariant', () => {
    it('ships the pass-the-link direction by default', () => {
        delete process.env.NEXT_PUBLIC_LANDING_VARIANT
        expect(landingVariant()).toBe('pass_link')
    })

    it('keeps the current compact hero as an explicit rollback', () => {
        process.env.NEXT_PUBLIC_LANDING_VARIANT = 'control'
        expect(landingVariant()).toBe('control')
    })

    it('does not let a typo silently activate the rollback', () => {
        for (const value of ['', 'pass_link', 'CONTROL', 'compact', 'unknown']) {
            process.env.NEXT_PUBLIC_LANDING_VARIANT = value
            expect(landingVariant()).toBe('pass_link')
        }
    })
})
