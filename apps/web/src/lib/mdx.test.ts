import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderArticle } from './mdx'
import { getAuthoredDoc, listAllTranslations } from './content'

/**
 * The deploy gate is `typecheck && test && format` and a push to main goes straight to
 * production, so this file is the only thing standing between a bad article and the live site.
 * A regex tag-count in content.test.ts is not a substitute — MDX fails on things no regex
 * predicts, and it fails at build time, after the push.
 */

// Every locale, not just English: a translation compiles at build time too, and fails there.
const ALL = listAllTranslations()

describe('article compilation', () => {
    it.each(ALL.map((doc) => [`${doc.locale}/${doc.slug}`, doc] as const))('compiles %s', async (_id, doc) => {
        await expect(renderArticle(doc.body, doc.locale)).resolves.toBeTruthy()
    })

    /**
     * MDX reads `{…}` as a JS expression and drops it, with no error — the one failure mode here
     * that reaches production silently. Escaped braces (`\{`) are fine and stay readable.
     */
    it('has no unescaped braces in prose', () => {
        for (const doc of ALL) {
            // `{/* … */}` is an MDX comment and is meant to disappear — that is what it is for.
            const prose = doc.body.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
            const unescaped = [...prose.matchAll(/(^|[^\\])\{/g)]
            expect(unescaped.length, `${doc.locale}/${doc.slug}: unescaped { would vanish from the page`).toBe(0)
        }
    })

    it('fails loudly on MDX a regex tag-count would pass', async () => {
        await expect(renderArticle('See <https://example.com/> for details.\n')).rejects.toThrow()
    })

    it('emits no public-source copy from the progressive comparison before release', async () => {
        const prior = process.env.NEXT_PUBLIC_FOSS_RELEASED
        try {
            delete process.env.NEXT_PUBLIC_FOSS_RELEASED
            const doc = getAuthoredDoc('alternatives', 'splitwise-alternative')!
            const html = renderToStaticMarkup(await renderArticle(doc.body, doc.locale))

            expect(html).toContain('A free Splitwise alternative with no signup')
            expect(html).not.toMatch(/AGPL|open[- ]source|self[- ]host|Squirrel Labs|href="\/source"/i)
        } finally {
            if (prior === undefined) delete process.env.NEXT_PUBLIC_FOSS_RELEASED
            else process.env.NEXT_PUBLIC_FOSS_RELEASED = prior
        }
    })
})
