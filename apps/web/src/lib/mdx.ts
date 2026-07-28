import { compileMDX } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { mdxComponents } from '@/components/marketing/mdx/components'

/**
 * Compile an article body into React on the server. Frontmatter is already stripped by
 * content.ts, so `parseFrontmatter` stays off — passing a body twice through a frontmatter
 * parser silently eats a leading `---` rule.
 *
 * format: 'mdx' is what allows JSX tags in a .md file, and it costs two things in prose. A `{…}`
 * is read as a JS expression and **silently disappears** from the rendered page — write `\{` for
 * a literal brace. An autolink like `<https://example.com>` is read as a JSX tag and fails the
 * build. The first is the dangerous one because nothing reports it, so `mdx.test.ts` compiles
 * every article and asserts no doc contains a bare brace.
 */
export async function renderArticle(body: string) {
    const { content } = await compileMDX({
        source: body,
        components: mdxComponents,
        options: { mdxOptions: { format: 'mdx', remarkPlugins: [remarkGfm] } },
    })
    return content
}
