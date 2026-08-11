import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderSplitGuideBody } from '@/components/split-content/mdx'
import { LOCALES } from '@/i18n/locales'
import { listSplitGuides, loadSplitContentManifest, splitGuidePaths } from './artifact'

const FIXTURE = path.join(process.cwd(), 'src/lib/split-content/__fixtures__/valid')
const GUIDE_PATHS = splitGuidePaths(FIXTURE)

async function render(body: string, locale = 'en' as const): Promise<string> {
    return renderToStaticMarkup(await renderSplitGuideBody(body, { locale, guidePaths: GUIDE_PATHS }))
}

describe('Split V1 MDX AST policy', () => {
    it('accepts only the needed Markdown and all six V1 component shapes', async () => {
        const html = await render(`
## Safe heading

Plain **strong** copy and a [manifest sibling](/en/split/guides/synthetic-guide).

- One safe list item.

<Steps title="Safe steps">
<Step title="First step">Keep this literal.</Step>
</Steps>

<Callout type="info">
**Safe callout.** Literal content only.
</Callout>

<CTA text="Start a split" subtitle="Safe subtitle." href="https://split.peanut.me/new?locale=en" variant="card" />

<RelatedPages title="Related guide">
<RelatedLink href="/en/split/guides/synthetic-guide">Synthetic guide</RelatedLink>
</RelatedPages>
`)

        expect(html).toContain('Safe heading')
        expect(html).toContain('Safe callout.')
        expect(html).toContain('https://split.peanut.me/new?locale=en')
        expect(html).toContain('/en/split/guides/synthetic-guide')
    })

    it.each([
        ['raw lowercase HTML', '<div>unsafe</div>', /unknown or lowercase element/],
        ['script', '<script>alert(1)</script>', /unknown or lowercase element/],
        ['iframe', '<iframe src="https://evil.example" />', /unknown or lowercase element/],
        ['JSX image', '<img src="https://evil.example/pixel.png" />', /unknown or lowercase element/],
        ['Markdown image', '![pixel](https://evil.example/pixel.png)', /node type is not allowed: image/],
        ['product-relative Markdown link', '[create](/new)', /manifest-backed guide path/],
        ['external Markdown link', '[leave](https://evil.example)', /manifest-backed guide path/],
        ['javascript Markdown link', '[run](javascript:alert(1))', /manifest-backed guide path/],
        ['MDX expression', '{process.env.SECRET}', /node type is not allowed: mdx(?:Flow|Text)Expression/],
        ['MDX import', "import Exploit from './exploit'", /node type is not allowed: mdxjsEsm/],
        ['MDX export', 'export const exploit = true', /node type is not allowed: mdxjsEsm/],
        ['unknown component', '<Hero title="No" />', /unknown or lowercase element/],
        ['unknown component attribute', '<Callout type="info" title="No">copy</Callout>', /must have exactly: type/],
        [
            'non-string expression attribute',
            '<CTA text={"Start"} subtitle="No" href="https://split.peanut.me/new?locale=en" variant="card" />',
            /only literal string attributes/,
        ],
        ['wrong-locale Markdown link', '[Spanish](/es-419/split/guides/synthetic-guide)', /current guide locale/],
        [
            'unknown same-locale Markdown link',
            '[Unknown](/en/split/guides/not-in-manifest)',
            /manifest-backed guide path/,
        ],
        [
            'wrong-locale RelatedLink',
            '<RelatedPages title="Related"><RelatedLink href="/pt-br/split/guides/synthetic-guide">No</RelatedLink></RelatedPages>',
            /current guide locale/,
        ],
        [
            'unknown RelatedLink',
            '<RelatedPages title="Related"><RelatedLink href="/en/split/guides/not-in-manifest">No</RelatedLink></RelatedPages>',
            /manifest-backed guide path/,
        ],
    ])('rejects %s', async (_name, body, message) => {
        await expect(render(body)).rejects.toThrow(message)
    })
})

const mountedA1Root = process.env.SPLIT_CONTENT_A1_TEST_ROOT
const mountedA1Test = mountedA1Root ? it : it.skip

describe('mounted A1 artifact MDX compatibility', () => {
    mountedA1Test('renders all six real A1 bodies without committing them to PeanutSplit', async () => {
        const manifest = loadSplitContentManifest(mountedA1Root)
        expect(manifest?.entries).toHaveLength(6)
        const guidePaths = splitGuidePaths(mountedA1Root)
        const guides = LOCALES.flatMap((locale) => listSplitGuides(locale, mountedA1Root))
        expect(guides).toHaveLength(6)

        for (const guide of guides) {
            const html = renderToStaticMarkup(
                await renderSplitGuideBody(guide.body, { locale: guide.locale, guidePaths })
            )
            expect(html.length).toBeGreaterThan(0)
        }
    })
})
