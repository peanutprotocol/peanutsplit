import { afterAll, describe, expect, it } from 'vitest'
import { STATIC_PAGES, staticPageIsSitemapped } from '@/data/static-pages'
import { landingVariant, publicFossReleased, publicSourceReceipt, splitV2Enabled } from './flags'

const prior = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
const priorLandingVariant = process.env.NEXT_PUBLIC_LANDING_VARIANT
const priorFossRelease = process.env.NEXT_PUBLIC_FOSS_RELEASED
const priorBuildCommit = process.env.NEXT_PUBLIC_BUILD_COMMIT
const priorSourceCommit = process.env.NEXT_PUBLIC_SOURCE_COMMIT
const priorSourceArchiveUrl = process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL
const priorSourceArchiveSha256 = process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256

afterAll(() => {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
    else process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = prior

    if (priorLandingVariant === undefined) delete process.env.NEXT_PUBLIC_LANDING_VARIANT
    else process.env.NEXT_PUBLIC_LANDING_VARIANT = priorLandingVariant

    if (priorFossRelease === undefined) delete process.env.NEXT_PUBLIC_FOSS_RELEASED
    else process.env.NEXT_PUBLIC_FOSS_RELEASED = priorFossRelease

    if (priorBuildCommit === undefined) delete process.env.NEXT_PUBLIC_BUILD_COMMIT
    else process.env.NEXT_PUBLIC_BUILD_COMMIT = priorBuildCommit

    if (priorSourceCommit === undefined) delete process.env.NEXT_PUBLIC_SOURCE_COMMIT
    else process.env.NEXT_PUBLIC_SOURCE_COMMIT = priorSourceCommit
    if (priorSourceArchiveUrl === undefined) delete process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL
    else process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL = priorSourceArchiveUrl
    if (priorSourceArchiveSha256 === undefined) delete process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256
    else process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256 = priorSourceArchiveSha256
})

describe('publicFossReleased', () => {
    it('fails closed unless the release pipeline opts in literally', () => {
        delete process.env.NEXT_PUBLIC_FOSS_RELEASED
        expect(publicFossReleased()).toBe(false)
        process.env.NEXT_PUBLIC_FOSS_RELEASED = 'true'
        expect(publicFossReleased()).toBe(false)
        process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
        expect(publicFossReleased()).toBe(true)
    })

    it('stays closed when any corresponding-source receipt field is absent or malformed', () => {
        process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
        const commit = process.env.NEXT_PUBLIC_SOURCE_COMMIT!
        const archiveUrl = process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL!
        const archiveSha256 = process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256!

        delete process.env.NEXT_PUBLIC_SOURCE_COMMIT
        expect(publicSourceReceipt()).toBeNull()
        expect(publicFossReleased()).toBe(false)
        process.env.NEXT_PUBLIC_SOURCE_COMMIT = commit

        process.env.NEXT_PUBLIC_BUILD_COMMIT = 'fedcba9876543210fedcba9876543210fedcba98'
        expect(publicSourceReceipt()).toBeNull()
        expect(publicFossReleased()).toBe(false)
        process.env.NEXT_PUBLIC_BUILD_COMMIT = commit

        process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL = 'http://example.com/source.tar.gz'
        expect(publicSourceReceipt()).toBeNull()

        process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL = `https://example.com/latest.tar.gz?commit=${commit}`
        expect(publicSourceReceipt()).toBeNull()
        process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL = archiveUrl

        process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256 = 'not-a-sha256'
        expect(publicSourceReceipt()).toBeNull()
        process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256 = archiveSha256
        expect(publicSourceReceipt()).toEqual({
            commit,
            archiveUrl,
            archiveSha256,
        })
    })

    it('keeps the source receipt out of the sitemap until the same gate opens', () => {
        const source = STATIC_PAGES.find((page) => page.href === '/source')!
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
