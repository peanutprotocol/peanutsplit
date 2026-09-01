import { afterAll, describe, expect, it } from 'vitest'
import { STATIC_PAGES, staticPageIsSitemapped } from '@/data/static-pages'
import { landingVariant, publicFossReleased, publicSourceCommit, splitV2Enabled } from './flags'

const prior = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
const priorLandingVariant = process.env.NEXT_PUBLIC_LANDING_VARIANT
const priorFossRelease = process.env.NEXT_PUBLIC_FOSS_RELEASED
const priorBuildCommit = process.env.NEXT_PUBLIC_BUILD_COMMIT

afterAll(() => {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
    else process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = prior

    if (priorLandingVariant === undefined) delete process.env.NEXT_PUBLIC_LANDING_VARIANT
    else process.env.NEXT_PUBLIC_LANDING_VARIANT = priorLandingVariant

    if (priorFossRelease === undefined) delete process.env.NEXT_PUBLIC_FOSS_RELEASED
    else process.env.NEXT_PUBLIC_FOSS_RELEASED = priorFossRelease

    if (priorBuildCommit === undefined) delete process.env.NEXT_PUBLIC_BUILD_COMMIT
    else process.env.NEXT_PUBLIC_BUILD_COMMIT = priorBuildCommit
})

const COMMIT = '0123456789abcdef0123456789abcdef01234567'

describe('publicFossReleased', () => {
    it('fails closed unless the release opts in literally', () => {
        process.env.NEXT_PUBLIC_BUILD_COMMIT = COMMIT
        delete process.env.NEXT_PUBLIC_FOSS_RELEASED
        expect(publicFossReleased()).toBe(false)
        process.env.NEXT_PUBLIC_FOSS_RELEASED = 'true'
        expect(publicFossReleased()).toBe(false)
        process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
        expect(publicFossReleased()).toBe(true)
    })

    it('stays closed without a well-formed corresponding-source commit', () => {
        process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'

        delete process.env.NEXT_PUBLIC_BUILD_COMMIT
        expect(publicSourceCommit()).toBeNull()
        expect(publicFossReleased()).toBe(false)

        // A branch name is exactly the mutable pointer the commit requirement exists to reject.
        process.env.NEXT_PUBLIC_BUILD_COMMIT = 'main'
        expect(publicSourceCommit()).toBeNull()
        expect(publicFossReleased()).toBe(false)

        process.env.NEXT_PUBLIC_BUILD_COMMIT = COMMIT.slice(0, 12)
        expect(publicSourceCommit()).toBeNull()
        expect(publicFossReleased()).toBe(false)

        process.env.NEXT_PUBLIC_BUILD_COMMIT = COMMIT.toUpperCase()
        expect(publicSourceCommit()).toBeNull()

        process.env.NEXT_PUBLIC_BUILD_COMMIT = COMMIT
        expect(publicSourceCommit()).toBe(COMMIT)
        expect(publicFossReleased()).toBe(true)
    })

    it('keeps the source page out of the sitemap until the same gate opens', () => {
        const source = STATIC_PAGES.find((page) => page.href === '/source')!
        process.env.NEXT_PUBLIC_BUILD_COMMIT = COMMIT
        delete process.env.NEXT_PUBLIC_FOSS_RELEASED
        expect(staticPageIsSitemapped(source)).toBe(false)
        process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
        expect(staticPageIsSitemapped(source)).toBe(true)
    })
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
