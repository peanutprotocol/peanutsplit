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

    it('publishes the receipts and exact stewardship deal after release', () => {
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
        expect(html).toContain(process.env.NEXT_PUBLIC_SOURCE_COMMIT)
        expect(html).toContain(process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL)
        expect(html).toContain(process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256)
        expect(html).not.toContain('/blob/main/')
        expect(html.match(/href="https:\/\/peanut\.me"/g)).toHaveLength(1)
        expect(html).not.toContain('utm_')
    })
})
