import { compileMDX } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { mdxComponents } from '@/components/marketing/mdx/components'

/**
 * Compile an article body into React on the server. Frontmatter is already stripped by
 * content.ts, so `parseFrontmatter` stays off — passing a body twice through a frontmatter
 * parser silently eats a leading `---` rule.
 *
 * format: 'mdx' is what allows JSX tags in a .md file. The tradeoff is that a stray `<` in prose
 * becomes a parse error, which surfaces as a build failure on the article that caused it.
 */
export async function renderArticle(body: string) {
    const { content } = await compileMDX({
        source: body,
        components: mdxComponents,
        options: { mdxOptions: { format: 'mdx', remarkPlugins: [remarkGfm] } },
    })
    return content
}
