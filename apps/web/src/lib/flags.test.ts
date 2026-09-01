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

    // The build commit sharpens the source link; it does not gate the surface. Requiring it made a
    // true claim depend on a hand-typed deploy setting, which goes stale on the next deploy and then
    // names the wrong tree. The page falls back to the branch and says so instead.
    it('does not depend on the deployment naming its build commit', () => {
        process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'

        delete process.env.NEXT_PUBLIC_BUILD_COMMIT
        expect(publicSourceCommit()).toBeNull()
        expect(publicFossReleased()).toBe(true)
    })

    it('accepts only a full lowercase commit as a pinned source reference', () => {
        for (const value of ['main', COMMIT.slice(0, 12), COMMIT.toUpperCase(), '', 'HEAD']) {
            process.env.NEXT_PUBLIC_BUILD_COMMIT = value
            expect(publicSourceCommit(), value || '(empty)').toBeNull()
        }

        process.env.NEXT_PUBLIC_BUILD_COMMIT = COMMIT
        expect(publicSourceCommit()).toBe(COMMIT)
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
