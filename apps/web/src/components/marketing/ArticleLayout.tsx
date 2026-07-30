import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { JsonLd } from './JsonLd'
import { Breadcrumbs } from './Breadcrumbs'
import { SiteFooter } from './SiteFooter'
import { LanguageLinks } from './LanguageLinks'
import { articleSchema, breadcrumbSchema, faqSchema, formatDate, type Breadcrumb } from '@/lib/seo'
import type { Locale } from '@/i18n/locales'
import { basePathFor, type Doc } from '@/lib/content'

/**
 * The frame every content page shares: structured data, a visible trail, the body, the footer.
 * Routes hand it a doc and a crumb trail and nothing else — a route that wants a different head
 * has an article problem, not a layout problem.
 *
 * `crumbs` is used twice on purpose (rendered + BreadcrumbList) so the two can't disagree.
 */
export async function ArticleLayout({
    doc,
    crumbs,
    /** Locales this article exists in. Anything but the current one becomes a link. */
    translations = [],
    children,
}: {
    doc: Doc
    crumbs: Breadcrumb[]
    translations?: Locale[]
    children: ReactNode
}) {
    const { frontmatter } = doc
    const t = await getTranslations({ locale: doc.locale, namespace: 'content' })

    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <JsonLd data={articleSchema(doc)} />
            <JsonLd data={breadcrumbSchema(crumbs)} />
            <JsonLd data={faqSchema(frontmatter.faqs)} />

            <Breadcrumbs crumbs={crumbs} />
            <article className="pb-4">
                {children}
                {frontmatter.date && (
                    <div className="mx-auto w-full max-w-xl px-5 pt-4">
                        <time dateTime={frontmatter.date} className="block text-xs text-grey-1">
                            {t('published', { date: formatDate(frontmatter.date, doc.locale) })}
                            {frontmatter.updated && frontmatter.updated !== frontmatter.date
                                ? ` · ${t('updated', { date: formatDate(frontmatter.updated, doc.locale) })}`
                                : ''}
                        </time>
                    </div>
                )}
            </article>

            <LanguageLinks path={basePathFor(doc.collection, doc.slug)} current={doc.locale} available={translations} />

            <SiteFooter showLocaleSwitcher={false} />
        </main>
    )
}

export default ArticleLayout
