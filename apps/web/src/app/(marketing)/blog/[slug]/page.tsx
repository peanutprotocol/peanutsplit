import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleLayout } from '@/components/marketing/ArticleLayout'
import { getDoc, listSlugs } from '@/lib/content'
import { renderArticle } from '@/lib/mdx'
import { pageMetadata, pageTitle } from '@/lib/seo'

interface PageProps {
    params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
    return listSlugs('blog').map((slug) => ({ slug }))
}

/**
 * Only the slugs on disk exist. `false` means an unknown slug 404s at the edge instead of being
 * rendered on demand — the content tree is the whole universe of blog posts, so a miss is a typo
 * or a dead inbound link, and either way a soft 200 would be worse.
 */
export const dynamicParams = false

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params
    const doc = getDoc('blog', slug)
    if (!doc) return {}

    return pageMetadata({
        title: pageTitle(doc.frontmatter.title),
        description: doc.frontmatter.description,
        path: doc.frontmatter.canonical ?? doc.href,
        type: 'article',
        publishedTime: doc.frontmatter.date,
        modifiedTime: doc.frontmatter.updated,
    })
}

export default async function BlogPostPage({ params }: PageProps) {
    const { slug } = await params
    const doc = getDoc('blog', slug)
    if (!doc) notFound()

    const body = await renderArticle(doc.body)

    return (
        <ArticleLayout
            doc={doc}
            crumbs={[
                { name: 'Home', href: '/' },
                { name: 'Guides', href: '/blog' },
                { name: doc.frontmatter.title, href: doc.href },
            ]}
        >
            {body}
        </ArticleLayout>
    )
}
