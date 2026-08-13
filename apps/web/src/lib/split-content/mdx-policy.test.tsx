import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderSplitGuideBody } from '@/components/split-content/mdx'
import { splitGuidePaths } from './artifact'

const FIXTURE = path.join(process.cwd(), 'src/lib/split-content/__fixtures__/valid')
const GUIDE_PATHS = splitGuidePaths(FIXTURE)

async function render(body: string, locale = 'en' as const): Promise<string> {
    return renderToStaticMarkup(await renderSplitGuideBody(body, { locale, guidePaths: GUIDE_PATHS }))
}

describe('Split V1 MDX AST policy', () => {
    it('accepts only the needed Markdown and all six V1 component shapes', async () => {
        const html = await render(`
## Safe heading

Plain **strong** copy and a [manifest sibling](/guides/synthetic-guide).

- One safe list item.

<Steps title="Safe steps">
<Step title="First step">Keep this literal.</Step>
</Steps>

<Callout type="info">
**Safe callout.** Literal content only.
</Callout>

<CTA text="Start a split" subtitle="Safe subtitle." href="https://peanutsplit.com/new?locale=en" variant="card" />

<RelatedPages title="Related guide">
<RelatedLink href="/guides/synthetic-guide">Synthetic guide</RelatedLink>
</RelatedPages>
`)

        expect(html).toContain('Safe heading')
        expect(html).toContain('Safe callout.')
        expect(html).toContain('https://peanutsplit.com/new?locale=en')
        expect(html).toContain('/guides/synthetic-guide')
    })

    // Added 2026-08-13 with the 15-guide cohort. Every construct here comes from a real published
    // body, and every one of them was a compile error — and so an HTTP 500 — before that day.
    it('accepts the quoting grammar the competitor guides are written in', async () => {
        const html = await render(`
{/* checked 2026-08-12 */}

## What they say

> Keep track of shared expenses, balances, and who owes who.

*[splitwise.com](https://www.splitwise.com/), checked 12 August 2026*

| Bedroom | Weight | Cost |
|---|---|---|
| Ensuite double | 1.25 | £650 |
| Bunk room | 0.75 | £390 |
`)

        expect(html).toContain('<blockquote')
        expect(html).toContain('Keep track of shared expenses, balances, and who owes who.')
        expect(html).toContain('<em')
        expect(html).toContain('href="https://www.splitwise.com/"')
        expect(html).toContain('rel="noopener noreferrer"')
        expect(html).toContain('<table')
        expect(html).toContain('Ensuite double')
        expect(html).toContain('£390')
        // The comment makes the page compile; it must not reach the reader.
        expect(html).not.toContain('checked 2026-08-12')
        expect(html).not.toContain('{/*')
        // A four-column table is wider than the column on a phone, so it scrolls in its own box.
        expect(html).toContain('overflow-x-auto')
        expect(html).toContain('min-w-[32rem]')
    })

    it('accepts a plain http citation, because one published quote links one', async () => {
        const html = await render('Read [the sign-up page](http://www.splitwise.com/signup).')
        expect(html).toContain('href="http://www.splitwise.com/signup"')
    })

    it.each([
        ['raw lowercase HTML', '<div>unsafe</div>', /unknown or lowercase element/],
        ['script', '<script>alert(1)</script>', /unknown or lowercase element/],
        ['iframe', '<iframe src="https://evil.example" />', /unknown or lowercase element/],
        ['JSX image', '<img src="https://evil.example/pixel.png" />', /unknown or lowercase element/],
        ['Markdown image', '![pixel](https://evil.example/pixel.png)', /node type is not allowed: image/],
        ['product-relative Markdown link', '[create](/new)', /manifest-backed guide path/],
        [
            'javascript Markdown link',
            '[run](javascript:alert(1))',
            /http\(s\) citation or a manifest-backed guide path/,
        ],
        ['data-URL Markdown link', '[open](data:text/html,<script>alert(1)</script>)', /http\(s\) citation/],
        ['mailto Markdown link', '[write](mailto:someone@evil.example)', /http\(s\) citation/],
        ['credentialled Markdown link', '[leave](https://user:pw@evil.example/)', /must not carry credentials/],
        // Citations point outward. The product is reached through the CTA, which checks the path
        // and the locale parameter, so a link cannot become a second, unchecked entry point.
        ['product-absolute Markdown link', '[create](https://peanutsplit.com/new)', /through a CTA, not a link/],
        // Each of these reaches the same product and each passed the old exact-origin test.
        ['plain-http product link', '[create](http://peanutsplit.com/new)', /through a CTA, not a link/],
        ['www product link', '[create](https://www.peanutsplit.com/new)', /through a CTA, not a link/],
        ['alias-host product link', '[create](https://split.peanut.me/new)', /through a CTA, not a link/],
        ['www alias product link', '[create](http://www.split.peanut.me/new)', /through a CTA, not a link/],
        ['ported product link', '[create](https://peanutsplit.com:8443/new)', /through a CTA, not a link/],
        // The fully qualified spelling of the same host, in both the forms a URL can carry it.
        ['root-dot product link', '[create](https://peanutsplit.com./new)', /through a CTA, not a link/],
        ['encoded root-dot product link', '[create](https://peanutsplit.com%2e/new)', /through a CTA, not a link/],
        ['root-dot alias product link', '[create](https://split.peanut.me./new)', /through a CTA, not a link/],
        ['MDX expression', '{process.env.SECRET}', /may hold a comment and nothing else/],
        ['inline MDX expression', 'Copy with {process.env.SECRET} inside.', /may hold a comment and nothing else/],
        [
            'MDX expression hiding behind a comment',
            '{/* looks inert */ process.env.SECRET}',
            /may hold a comment and nothing else/,
        ],
        ['empty MDX expression', '{}', /may hold a comment and nothing else/],
        ['MDX import', "import Exploit from './exploit'", /node type is not allowed: mdxjsEsm/],
        ['MDX export', 'export const exploit = true', /node type is not allowed: mdxjsEsm/],
        ['unknown component', '<Hero title="No" />', /unknown or lowercase element/],
        ['unknown component attribute', '<Callout type="info" title="No">copy</Callout>', /must have exactly: type/],
        [
            'non-string expression attribute',
            '<CTA text={"Start"} subtitle="No" href="https://peanutsplit.com/new?locale=en" variant="card" />',
            /only literal string attributes/,
        ],
        ['wrong-locale Markdown link', '[Spanish](/es-419/guides/synthetic-guide)', /current guide locale/],
        ['unknown same-locale Markdown link', '[Unknown](/guides/not-in-manifest)', /manifest-backed guide path/],
        [
            'wrong-locale RelatedLink',
            '<RelatedPages title="Related"><RelatedLink href="/pt-br/guides/synthetic-guide">No</RelatedLink></RelatedPages>',
            /current guide locale/,
        ],
        [
            'unknown RelatedLink',
            '<RelatedPages title="Related"><RelatedLink href="/guides/not-in-manifest">No</RelatedLink></RelatedPages>',
            /manifest-backed guide path/,
        ],
    ])('rejects %s', async (_name, body, message) => {
        await expect(render(body)).rejects.toThrow(message)
    })
})

// Removed 2026-08-13: a second env-gated block used to render a mounted six-guide cohort behind
// SPLIT_CONTENT_A1_TEST_ROOT. It skipped silently everywhere, and its `toHaveLength(6)` had gone
// stale against the fifteen guides now committed in-tree. published-artifact.test.tsx renders the
// installed artifact unconditionally, which is what that block was reaching for.
