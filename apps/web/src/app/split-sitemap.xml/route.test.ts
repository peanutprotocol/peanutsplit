import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { splitSitemapResponse } from './route'

const FIXTURE = path.join(process.cwd(), 'src/lib/split-content/__fixtures__/valid')
const priorContentOrigin = process.env.CONTENT_ORIGIN

afterEach(() => {
    if (priorContentOrigin === undefined) delete process.env.CONTENT_ORIGIN
    else process.env.CONTENT_ORIGIN = priorContentOrigin
})

describe('the renderer-owned Split sitemap', () => {
    it('is valid, empty, noindex, and private when indexability is not explicitly enabled', async () => {
        const response = splitSitemapResponse({ root: FIXTURE })
        const body = await response.text()

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8')
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
        expect(body).toContain('<urlset')
        expect(body).not.toContain('<url>')
        expect(body).not.toContain('synthetic-guide')
    })

    it('lists only manifest-backed public URLs with reciprocal locale links after the exact flip', async () => {
        delete process.env.CONTENT_ORIGIN
        const response = splitSitemapResponse({ root: FIXTURE, isPathIndexable: () => true })
        const body = await response.text()

        expect(response.headers.get('x-robots-tag')).toBeNull()
        expect(body.match(/<url>/g)).toHaveLength(3)
        expect(body.match(/<xhtml:link /g)).toHaveLength(12)
        for (const locale of ['en', 'es-419', 'pt-br']) {
            expect(body).toContain(`https://peanut.me/${locale}/split/guides/synthetic-guide`)
        }
        expect(body).toContain('hreflang="pt-BR"')
        expect(body).toContain('hreflang="x-default"')
        expect(body).not.toContain('split.peanut.me')
        expect(body).not.toContain('renderer')
    })

    it('filters each path independently so a future cohort stays absent without deindexing released guides', async () => {
        const releasedGuide = '/en/split/guides/synthetic-guide'
        const released = new Set([releasedGuide])
        const response = splitSitemapResponse({
            root: FIXTURE,
            isPathIndexable: (publicPath) => released.has(publicPath),
        })
        const body = await response.text()

        expect(response.headers.get('x-robots-tag')).toBeNull()
        expect(body.match(/<url>/g)).toHaveLength(1)
        expect(body).toContain(`<loc>https://peanut.me${releasedGuide}</loc>`)
        expect(body).toContain('hreflang="en"')
        expect(body).toContain('hreflang="x-default"')
        expect(body).not.toContain('/es-419/split/')
        expect(body).not.toContain('/pt-br/split/')
        expect(body).not.toContain('/en/split/tools')
    })
})
