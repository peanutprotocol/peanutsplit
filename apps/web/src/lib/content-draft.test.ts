import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
    getAuthoredDoc,
    getDoc,
    isDocAvailable,
    listAllAuthoredTranslations,
    listAllDocs,
    listAllTranslations,
    listDocs,
    listSlugs,
    localesForSlug,
} from './content'

/**
 * `draft: true` — the gate a transcreation agent writes behind (`scripts/draft-translation.mjs`).
 *
 * The point of the flag is that a machine draft can sit in `src/content/` and be reviewed there:
 * parsed, shape-checked and style-gated by `content.test.ts`, while no route, listing, sitemap
 * entry or hreflang tag can reach it. Both halves are asserted here, against a scratch tree —
 * a draft cannot be committed to the real tree just to prove it is hidden, and asserting the
 * hiding against a tree with no draft in it is a test that cannot fail.
 */
describe('draft gate', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-draft-'))
    const cwd = process.cwd()

    beforeAll(() => {
        const write = (rel: string, body: string) => {
            const full = path.join(root, 'src/content', rel)
            fs.mkdirSync(path.dirname(full), { recursive: true })
            fs.writeFileSync(full, body)
        }
        const doc = (title: string, extra = '') =>
            `---\ntitle: ${title}\ndescription: d\ndate: 2026-08-22\n${extra}---\nbody\n`

        // One live page whose Spanish translation is an unreviewed draft, and one page that is a
        // draft in the only language it has.
        write('blog/live/en.md', doc('Live'))
        write('blog/live/es-419.md', doc('Vivo', 'draft: true\n'))
        write('blog/live/pt-br.md', doc('Vivo'))
        write('blog/machine/en.md', doc('Machine', 'draft: true\n'))

        process.chdir(root)
    })

    afterAll(() => {
        process.chdir(cwd)
        fs.rmSync(root, { recursive: true, force: true })
    })

    const listings: readonly (readonly [string, () => string[]])[] = [
        ['listDocs', () => listDocs('blog').map((doc) => doc.href)],
        ['listSlugs', () => listSlugs('blog').map((slug) => `/blog/${slug}`)],
        ['listAllDocs', () => listAllDocs().map((doc) => doc.href)],
        ['listAllTranslations', () => listAllTranslations().map((doc) => doc.href)],
    ]

    it.each(listings)('hides a draft from %s without hiding the live page', (_name, list) => {
        const hrefs = list()
        expect(hrefs).not.toContain('/blog/machine')
        expect(hrefs).toContain('/blog/live')
    })

    const routing: readonly (readonly [string, () => unknown, unknown])[] = [
        ['404s a draft', () => getDoc('blog', 'machine'), null],
        ['404s a drafted translation', () => getDoc('blog', 'live', 'es-419'), null],
        ['refuses a draft to the route', () => isDocAvailable(getAuthoredDoc('blog', 'machine')!), false],
        ['still serves a live page', () => isDocAvailable(getAuthoredDoc('blog', 'live')!), true],
        ['leaves a live page listed', () => getDoc('blog', 'live')?.frontmatter.title, 'Live'],
        ['drops only the drafted locale from hreflang', () => localesForSlug('blog', 'live'), ['en', 'pt-br']],
        ['gives an all-draft slug no locales at all', () => localesForSlug('blog', 'machine'), []],
        ['keeps the draft parseable for review', () => getAuthoredDoc('blog', 'machine')?.frontmatter.title, 'Machine'],
        [
            'keeps the draft in the review surface',
            () => listAllAuthoredTranslations().map((doc) => doc.href),
            ['/blog/live', '/blog/machine', '/es-419/blog/live', '/pt-br/blog/live'],
        ],
    ]

    it.each(routing)('%s', (_name, actual, expected) => {
        expect(actual()).toEqual(expected)
    })
})
