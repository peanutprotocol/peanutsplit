import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleLayout } from '@/components/marketing/ArticleLayout'
import { getDoc, listSlugs } from '@/lib/content'
import { renderArticle } from '@/lib/mdx'
import { pageMetadata, pageTitle } from '@/lib/seo'

/**
 * Root-level pages from src/content/alternatives/. The URL is the query someone typed
 * ("tricount alternative" → /tricount-alternative), so it stays at the root with no /compare/
 * prefix in front of it.
 *
 * A dynamic segment at the root is safe here for two reasons: Next resolves static segments
 * (/new, /r, /blog, /api, /healthcheck) before this one, and `dynamicParams = false` pins the
 * match set to the slugs on disk — anything else 404s rather than reaching this route.
 */
interface PageProps {
    params: Promise<{ alternative: string }>
}

export async function generateStaticParams() {
    return listSlugs('alternatives').map((slug) => ({ alternative: slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { alternative } = await params
    const doc = getDoc('alternatives', alternative)
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

export default async function AlternativePage({ params }: PageProps) {
    const { alternative } = await params
    const doc = getDoc('alternatives', alternative)
    if (!doc) notFound()

    const body = await renderArticle(doc.body)

    return (
        <ArticleLayout
            doc={doc}
            crumbs={[
                { name: 'Home', href: '/' },
                { name: doc.frontmatter.title, href: doc.href },
            ]}
        >
            {body}
        </ArticleLayout>
    )
}
