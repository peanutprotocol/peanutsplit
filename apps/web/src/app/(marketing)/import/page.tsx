import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { marketingCopy } from '@/components/marketing/copy'
import { SplitwiseImport } from '@/components/import/SplitwiseImport'
import { Button } from '@/components/ui/Button'
import { splitV2Enabled } from '@/lib/flags'
import { breadcrumbSchema, pageMetadata } from '@/lib/seo'

const { importPage } = marketingCopy

/**
 * The importer, wrapped in a page a search engine can read.
 *
 * Two audiences, two languages, on purpose. The frame — title, description, hero, the honesty
 * list, the FAQ and its JSON-LD — is English because it is indexed in English, exactly like
 * `/splitwise-alternative`; someone searching "import splitwise" is searching in English and the
 * structured data has to match what they are served. The importer itself is product surface and
 * speaks the reader's language, from `import.*` in the message catalogs.
 *
 * The tool sits above the fold and above the prose, because someone who arrived with a file in
 * hand should not have to scroll past an argument for the thing they already decided to do.
 */
export const metadata: Metadata = pageMetadata({
    title: importPage.meta.title,
    description: importPage.meta.description,
    path: '/import',
    type: 'article',
})

const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Import from Splitwise', href: '/import' },
]

/** Mirrors the rendered FAQ — if the copy changes, this follows. */
const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: importPage.faq.items.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
}

export default function ImportPage() {
    if (!splitV2Enabled()) notFound()

    return (
        <main className="flex min-h-dvh flex-col gap-10 bg-background">
            <JsonLd data={faqJsonLd} />
            <JsonLd data={breadcrumbSchema(crumbs)} />

            <Breadcrumbs crumbs={crumbs} />

            <section>
                <div className="border-b border-n-1 bg-primary-1">
                    <div className="mx-auto w-full max-w-xl px-5 pb-8 pt-10">
                        <span className="inline-flex items-center rounded-sm border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-wide text-n-1">
                            {importPage.hero.eyebrow}
                        </span>
                        <h1 className="mt-5 text-h3 leading-tight text-n-1">{importPage.hero.title}</h1>
                        <p className="mt-4 text-base font-medium leading-6 text-n-1">{importPage.hero.body}</p>
                    </div>
                </div>
            </section>

            <section className="mx-auto w-full max-w-xl px-5">
                <SplitwiseImport />
            </section>

            <section className="mx-auto w-full max-w-xl px-5">
                <h2 className="text-h5">{importPage.honest.title}</h2>
                <ul className="mt-4 flex flex-col gap-3">
                    {importPage.honest.items.map((item) => (
                        <li key={item.title} className="rounded-sm border border-n-1 bg-white p-4">
                            <h3 className="text-h7">{item.title}</h3>
                            <p className="mt-2 text-sm leading-5 text-grey-1">{item.body}</p>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mx-auto w-full max-w-xl px-5">
                <h2 className="text-h5">{importPage.faq.title}</h2>
                <dl className="mt-4 flex flex-col gap-4">
                    {importPage.faq.items.map((item) => (
                        <div key={item.q} className="rounded-sm border border-n-1 bg-white p-4">
                            <dt className="text-h7">{item.q}</dt>
                            <dd className="mt-2 text-sm leading-5 text-grey-1">{item.a}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <section className="mx-auto w-full max-w-xl px-5">
                <div className="rounded-sm border border-n-1 bg-white p-5">
                    <h2 className="text-h5">{importPage.cta.title}</h2>
                    <p className="mt-2 text-sm leading-5 text-grey-1">{importPage.cta.body}</p>
                    <Link href="/new" className="mt-4 block">
                        <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                            {importPage.cta.button}
                        </Button>
                    </Link>
                </div>
            </section>

            <SiteFooter showLocaleSwitcher={false} />
        </main>
    )
}
