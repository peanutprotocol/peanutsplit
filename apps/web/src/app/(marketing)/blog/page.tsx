import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Button } from '@/components/ui/Button'
import { STATIC_PAGES } from '@/data/static-pages'
import { listAllDocs } from '@/lib/content'
import { absoluteUrl, breadcrumbSchema, pageMetadata, pageTitle } from '@/lib/seo'

/**
 * The content hub. Every indexable article on the site is reachable from here in one click,
 * which is the entire job — an article that nothing links to is an article Google discovers late
 * and re-crawls rarely. It lists both markdown collections and the hand-built pages that opted
 * in via STATIC_PAGES, so a new .md file shows up with no edit to this route.
 */

const TITLE = 'Guides'
const DESCRIPTION = 'How to split expenses without an account, an app install, or a subscription.'

export const metadata: Metadata = pageMetadata({
    title: pageTitle(TITLE),
    description: DESCRIPTION,
    path: '/blog',
    type: 'website',
})

const crumbs = [
    { name: 'Home', href: '/' },
    { name: TITLE, href: '/blog' },
]

interface HubEntry {
    href: string
    title: string
    description: string
    date?: string
}

export default function BlogHubPage() {
    const docs = listAllDocs()
    const entries: HubEntry[] = [
        ...docs.map((doc) => ({
            href: doc.href,
            title: doc.frontmatter.title,
            description: doc.frontmatter.description,
            date: doc.collection === 'blog' ? doc.frontmatter.date : undefined,
        })),
        ...STATIC_PAGES.filter((page) => page.inHub).map((page) => ({
            href: page.href,
            title: page.title,
            description: page.description,
        })),
    ]

    /** ItemList tells a crawler this is a listing and gives it the crawl order we intend. */
    const listSchema = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: entries.map((entry, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: absoluteUrl(entry.href),
            name: entry.title,
        })),
    }

    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <JsonLd data={breadcrumbSchema(crumbs)} />
            <JsonLd data={listSchema} />

            <Breadcrumbs crumbs={crumbs} />

            <div className="mt-4 border-y border-n-1 bg-primary-1">
                <div className="mx-auto w-full max-w-xl px-5 pb-8 pt-8">
                    <h1 className="text-h3 leading-tight text-n-1">{TITLE}</h1>
                    <p className="mt-3 text-base font-medium leading-6 text-n-1">{DESCRIPTION}</p>
                </div>
            </div>

            <section className="mx-auto w-full max-w-xl px-5 py-8">
                {entries.length === 0 ? (
                    <p className="text-sm text-grey-1">Nothing published yet.</p>
                ) : (
                    <ul className="flex flex-col gap-px overflow-hidden rounded-sm border border-n-1">
                        {entries.map((entry) => (
                            <li key={entry.href}>
                                <Link href={entry.href} className="block bg-white px-4 py-4 hover:bg-grey-3">
                                    <span className="block text-h7 text-n-1">{entry.title}</span>
                                    <span className="mt-1 block text-sm leading-5 text-grey-1">
                                        {entry.description}
                                    </span>
                                    {entry.date && (
                                        <time dateTime={entry.date} className="mt-2 block text-xs text-grey-1">
                                            {entry.date}
                                        </time>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                <Link href="/new" className="mt-8 block">
                    <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                        Start a room
                    </Button>
                </Link>
                <p className="mt-3 text-center text-sm text-grey-1">No signup. No install. Free forever.</p>
            </section>

            <SiteFooter />
        </main>
    )
}
