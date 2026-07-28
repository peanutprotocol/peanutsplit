import type { ReactNode } from 'react'
import { JsonLd } from './JsonLd'
import { Breadcrumbs } from './Breadcrumbs'
import { SiteFooter } from './SiteFooter'
import { articleSchema, breadcrumbSchema, faqSchema, type Breadcrumb } from '@/lib/seo'
import type { Doc } from '@/lib/content'

/**
 * The frame every content page shares: structured data, a visible trail, the body, the footer.
 * Routes hand it a doc and a crumb trail and nothing else — a route that wants a different head
 * has an article problem, not a layout problem.
 *
 * `crumbs` is used twice on purpose (rendered + BreadcrumbList) so the two can't disagree.
 * Blog posts show a date line; the alternative pages don't, because a visible date on an
 * evergreen comparison invites the reader to treat it as stale.
 */
export function ArticleLayout({ doc, crumbs, children }: { doc: Doc; crumbs: Breadcrumb[]; children: ReactNode }) {
    const { frontmatter } = doc
    const showDate = doc.collection === 'blog' && !!frontmatter.date

    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <JsonLd data={articleSchema(doc)} />
            <JsonLd data={breadcrumbSchema(crumbs)} />
            <JsonLd data={faqSchema(frontmatter.faqs)} />

            <Breadcrumbs crumbs={crumbs} />
            <article className="pb-4">
                {children}
                {showDate && (
                    <div className="mx-auto w-full max-w-xl px-5 pt-4">
                        <time dateTime={frontmatter.date} className="block text-xs text-grey-1">
                            Published {frontmatter.date}
                            {frontmatter.updated && frontmatter.updated !== frontmatter.date
                                ? ` · updated ${frontmatter.updated}`
                                : ''}
                        </time>
                    </div>
                )}
            </article>
            <SiteFooter />
        </main>
    )
}

export default ArticleLayout
