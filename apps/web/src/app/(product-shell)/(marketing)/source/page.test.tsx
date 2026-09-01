import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SourceAndStewardshipPage, { generateMetadata } from './page'

vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('NEXT_NOT_FOUND')
    },
}))

vi.mock('@/components/marketing/SiteFooter', () => ({
    SiteFooter: () => <footer data-testid="site-footer" />,
}))

const prior = process.env.NEXT_PUBLIC_FOSS_RELEASED

afterEach(() => {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_FOSS_RELEASED
    else process.env.NEXT_PUBLIC_FOSS_RELEASED = prior
})

describe('/source release boundary', () => {
    it('404s before an explicit public-source release', () => {
        delete process.env.NEXT_PUBLIC_FOSS_RELEASED
        expect(() => generateMetadata()).toThrow('NEXT_NOT_FOUND')
        expect(() => SourceAndStewardshipPage()).toThrow('NEXT_NOT_FOUND')
    })

    // A build that cannot name its own commit still has a public repository to offer, which is the
    // customary means AGPL section 13 asks for. It links the branch and says the branch moves —
    // rather than pinning a commit that a later deploy would silently make wrong.
    it('falls back to the deploy branch, and says so, when no build commit is supplied', () => {
        process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
        const priorCommit = process.env.NEXT_PUBLIC_BUILD_COMMIT
        delete process.env.NEXT_PUBLIC_BUILD_COMMIT
        try {
            const html = renderToStaticMarkup(SourceAndStewardshipPage())
            expect(html).toContain('/tree/main')
            expect(html).toContain('/blob/main/LICENSE')
            expect(html).toContain('The branch this service deploys from')
            expect(html).not.toContain('Exact deployed source commit')
        } finally {
            process.env.NEXT_PUBLIC_BUILD_COMMIT = priorCommit
        }
    })

    it('publishes the corresponding source and exact stewardship deal after release', () => {
        process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
        expect(generateMetadata()).toMatchObject({
            description: expect.stringContaining('AGPL'),
        })
        const html = renderToStaticMarkup(SourceAndStewardshipPage())

        expect(html).toContain('AGPL-3.0-or-later')
        expect(html).toContain('sole maintainer')
        expect(html).toContain('maintainer work hours')
        expect(html).toContain('Open source without contributor theatre')
        expect(html).toContain('href="https://github.com/peanutprotocol/peanutsplit"')
        expect(html).toContain(`/tree/${process.env.NEXT_PUBLIC_BUILD_COMMIT}`)
        expect(html).toContain(`/blob/${process.env.NEXT_PUBLIC_BUILD_COMMIT}/LICENSE`)
        expect(html).not.toContain('/blob/main/')
        expect(html).not.toContain('/tree/main')
        expect(html.match(/href="https:\/\/peanut\.me"/g)).toHaveLength(1)
        expect(html).not.toContain('utm_')
    })
})
