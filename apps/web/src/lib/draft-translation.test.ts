import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    buildBundle,
    internalLinks,
    localizeLink,
    stylebookSection,
    unfence,
    withDraftFlag,
} from '../../scripts/draft-translation.mjs'

/**
 * `scripts/draft-translation.mjs`, minus the model.
 *
 * What can silently go wrong here is the bundle: a rulebook that was not attached, a link map
 * pointing at a locale that has no file, a `draft: true` that did not land — and every one of
 * those produces a plausible-looking page. The model call itself is never made from a test.
 *
 * Against a scratch tree, so the assertions are about assembly rather than about today's copy in
 * `_system/`, which is edited constantly.
 */
describe('draft-translation bundle', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-bundle-'))
    const write = (rel: string, body: string) => {
        const full = path.join(root, 'src/content', rel)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, body)
    }

    beforeAll(() => {
        for (const locale of ['es-419', 'pt-br']) write(`_system/localization.${locale}.md`, `RULEBOOK ${locale}`)
        write('_system/product-truths.md', 'TRUTHS')
        write('_system/competitor-claims.md', 'COMPETITORS')
        write('_system/cast.md', 'CAST FILE')
        write(
            '_system/stylebook.md',
            '## §1 North star\nnorth\n\n## §2 Two registers\nregisters\n\n## §9 Locale rules\nlocales\n\n## §11 Appendix\nmechanics\n'
        )

        const page = (body: string) => `---\ntitle: T\ndescription: d\ndate: 2026-08-22\n---\n${body}\n`
        write('blog/guide/en.md', page('<a href="/blog/translated">x</a> [y](/blog/guide) [z](/tools#rent)'))
        write('blog/translated/es-419.md', page('ya existe'))
        write('alternatives/rival-alternative/en.md', page('<Cast name="edie" /> compare'))
        write('capture/plain/en.md', page('no links, no cast'))
    })

    const bundle = (collection: string, slug: string, locale = 'es-419') =>
        buildBundle({ collection, slug, locale, root })

    const attachments: readonly (readonly [string, string, string, boolean])[] = [
        ['the locale rulebook', 'blog/guide', 'RULEBOOK es-419', true],
        ['the product truths', 'blog/guide', 'TRUTHS', true],
        ['the register section', 'blog/guide', '## §2 Two registers', true],
        ['the locale section', 'blog/guide', '## §9 Locale rules', true],
        ['the mechanical appendix', 'blog/guide', '## §11 Appendix', true],
        ['no unrelated stylebook section', 'blog/guide', '§1 North star', false],
        ['competitor claims on a guide', 'blog/guide', 'COMPETITORS', false],
        ['competitor claims on a comparison', 'alternatives/rival-alternative', 'COMPETITORS', true],
        ['the cast on a page with no cast', 'blog/guide', 'CAST FILE', false],
        ['the cast on a page that draws one', 'alternatives/rival-alternative', 'CAST FILE', true],
    ]

    it.each(attachments)('attaches %s', (_name, target, needle, expected) => {
        const [collection, slug] = target.split('/')
        expect(bundle(collection, slug).includes(needle)).toBe(expected)
    })

    /**
     * The link map is the one thing the model cannot work out for itself: `content.ts` never
     * serves English at a translated URL, so a prefix in front of an untranslated page is a 404.
     */
    const links: readonly (readonly [string, string])[] = [
        ['/blog/translated', '/es-419/blog/translated'],
        ['/blog/guide', '/blog/guide'],
        ['/tools', '/tools'],
        ['/new', '/es-419/new'],
        ['/blog', '/es-419/blog'],
    ]

    it.each(links)('maps %s to %s', (from, to) => {
        expect(localizeLink(from, 'es-419', root)).toBe(to)
    })

    it('reads both MDX link spellings and drops the fragment', () => {
        expect(internalLinks('<a href="/blog/translated">x</a> [y](/blog/guide) [z](/tools#rent)')).toEqual([
            '/blog/translated',
            '/blog/guide',
            '/tools',
        ])
    })

    it('carries the English page and its link map into the bundle', () => {
        const assembled = bundle('blog', 'guide')
        expect(assembled).toContain('src/content/blog/guide/en.md')
        expect(assembled).toContain('/blog/translated → /es-419/blog/translated')
        expect(assembled).toContain('/blog/guide → /blog/guide')
    })

    it('names the target language and the title budget', () => {
        expect(bundle('blog', 'guide', 'pt-br')).toContain('Brazilian Portuguese (pt-br)')
        expect(bundle('blog', 'guide')).toContain('title at most 45 characters')
    })

    it('asks a capture page for no money amounts and a guide for none of that rule', () => {
        expect(bundle('capture', 'plain')).toContain('No price and no money amount')
        expect(bundle('blog', 'guide')).not.toContain('No price and no money amount')
    })

    it('reads a stylebook section up to the next one', () => {
        expect(stylebookSection('## §2 A\nkeep\n\n## §3 B\ndrop\n', '§2')).toBe('## §2 A\nkeep')
    })
})

describe('draft-translation output', () => {
    const written: readonly (readonly [string, string, string])[] = [
        ['adds the flag', '---\ntitle: T\n---\nbody\n', '---\ntitle: T\ndraft: true\n---\nbody\n'],
        ['never adds it twice', '---\ntitle: T\ndraft: true\n---\nbody\n', '---\ntitle: T\ndraft: true\n---\nbody\n'],
        [
            'keeps the declared key order',
            '---\ntitle: T\ndate: 2026-08-22\n---\nbody\n',
            '---\ntitle: T\ndate: 2026-08-22\ndraft: true\n---\nbody\n',
        ],
    ]

    it.each(written)('%s', (_name, input, expected) => {
        expect(withDraftFlag(input)).toBe(expected)
    })

    it('refuses output with no frontmatter rather than writing a headless page', () => {
        expect(() => withDraftFlag('just prose\n')).toThrow(/frontmatter/)
    })

    it('strips a fence the model wrapped the file in', () => {
        expect(unfence('```markdown\n---\ntitle: T\n---\nbody\n```')).toBe('---\ntitle: T\n---\nbody\n')
        expect(unfence('---\ntitle: T\n---\nbody')).toBe('---\ntitle: T\n---\nbody\n')
    })
})
