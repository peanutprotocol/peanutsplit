import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { CompareFaq } from '@/components/marketing/CompareFaq'
import { CompareTable } from '@/components/marketing/CompareTable'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { marketingCopy } from '@/components/marketing/copy'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { splitV2Enabled } from '@/lib/flags'
import { breadcrumbSchema, pageMetadata } from '@/lib/seo'

const { compare } = marketingCopy
const compareFaqItems = compare.faq.items.filter((item) => splitV2Enabled() || !('v2Only' in item && item.v2Only))

/**
 * The importer is behind the v2 flag, so the sentence that promises it is appended to the second
 * paragraph rather than carried in `body`. With the flag off the section has to read correctly on
 * its own, which is a different requirement from merely leaving a line out.
 */
const migrationBody = compare.migration.body.map((paragraph, index) =>
    index === 1 && splitV2Enabled() ? `${paragraph} ${compare.migration.importSentence}` : paragraph
)

/**
 * Built by hand rather than through the content engine — the copy here is argued over line by
 * line and carries an interactive comparison table. It goes through `pageMetadata` anyway so the
 * head does not drift from the generated pages: this is the highest-intent page on the site and
 * it was the one missing `og:site_name`, breadcrumbs and an Article node.
 */
export const metadata: Metadata = pageMetadata({
    title: compare.meta.title,
    description: compare.meta.description,
    path: '/splitwise-alternative',
    type: 'article',
})

const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Splitwise alternative', href: '/splitwise-alternative' },
]

/** Rich result for the FAQ block. Mirrors what's rendered — if the copy changes, this follows. */
const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: compareFaqItems.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
}

/**
 * The one SEO page. Everything above the fold answers the query someone typed ("splitwise
 * alternative") and the CTA goes straight to /new — there is no signup step to explain.
 */
export default function SplitwiseAlternativePage() {
    return (
        <main className="flex min-h-dvh flex-col gap-10 bg-background">
            <JsonLd data={faqJsonLd} />
            <JsonLd data={breadcrumbSchema(crumbs)} />

            <Breadcrumbs crumbs={crumbs} />

            <section>
                <div className="border-b border-n-1 bg-primary-1">
                    <div className="mx-auto w-full max-w-xl px-5 pb-8 pt-10">
                        <span className="inline-flex items-center rounded-sm border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-wide text-n-1">
                            {compare.hero.eyebrow}
                        </span>
                        <h1 className="mt-5 text-h3 leading-tight text-n-1">{compare.hero.title}</h1>
                        <p className="mt-4 text-base font-medium leading-6 text-n-1">{compare.hero.body}</p>
                    </div>
                </div>

                <div className="mx-auto w-full max-w-xl px-5 pt-6">
                    <Link href="/new" className="block">
                        <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                            {compare.hero.cta}
                        </Button>
                    </Link>
                    <p className="mt-3 text-center text-sm text-grey-1">{compare.hero.ctaHint}</p>
                    {splitV2Enabled() && (
                        <p className="mt-2 text-center text-sm text-grey-1">
                            <Link href="/import" className="text-black underline">
                                {compare.hero.importLink}
                            </Link>
                        </p>
                    )}
                </div>
            </section>

            <section className="mx-auto w-full max-w-xl px-5">
                <h2 className="text-h5">{compare.why.title}</h2>
                <p className="mt-2 text-sm leading-5 text-grey-1">{compare.why.intro}</p>
                <ul className="mt-4 flex flex-col gap-3">
                    {compare.why.items.map((item) => (
                        <li key={item.title} className="rounded-sm border border-n-1 bg-white p-4">
                            <h3 className="text-h7">{item.title}</h3>
                            <blockquote className="mt-3 border-l-2 border-n-1 pl-3 text-sm italic leading-5 text-n-1">
                                “{item.quote}”
                            </blockquote>
                            <p className="mt-3 text-sm leading-5 text-grey-1">{item.body}</p>
                        </li>
                    ))}
                </ul>
            </section>

            {/* The rescue action for a reader who is capped right now. It sits after `why` has
                established what Splitwise puts behind Pro and before the table, which is reference
                furniture — and ahead of `honest`, so the page still concedes once, immediately
                before the CTA. The link at the foot is the only thing here that leaves the page:
                the correction, the ways out and the full balance move belong to
                /splitwise-daily-limit, and two pages that repeat each other compete for one query
                instead of stacking. */}
            <section className="mx-auto w-full max-w-xl px-5">
                <div className="rounded-sm border border-n-1 bg-white p-4">
                    <h2 className="text-h5">{compare.migration.title}</h2>
                    <blockquote className="mt-3 border-l-2 border-n-1 pl-3 text-sm italic leading-5 text-n-1">
                        “{compare.migration.quote}”
                    </blockquote>
                    <p className="mt-2 text-sm leading-5 text-grey-1">{compare.migration.quoteNote}</p>
                    {migrationBody.map((paragraph) => (
                        <p key={paragraph} className="mt-3 text-sm leading-5 text-grey-1">
                            {paragraph}
                        </p>
                    ))}
                    <Link href={compare.migration.moreHref} className="mt-4 inline-block text-sm text-black underline">
                        {compare.migration.moreLabel}
                    </Link>
                </div>
            </section>

            <CompareTable />

            <section className="mx-auto w-full max-w-xl px-5">
                <h2 className="text-h5">{compare.features.title}</h2>
                <ul className="mt-4 flex flex-col gap-3">
                    {compare.features.items.map((item) => (
                        <li
                            key={item.title}
                            className="flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4"
                        >
                            <span
                                aria-hidden="true"
                                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1 bg-green-1"
                            >
                                <Icon name="check" size={14} className="text-n-1" />
                            </span>
                            <span className="flex-1">
                                <span className="block text-h7">{item.title}</span>
                                <span className="mt-1 block text-sm leading-5 text-grey-1">{item.body}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mx-auto w-full max-w-xl px-5">
                <div className="rounded-sm border border-n-1 bg-primary-3 p-4">
                    <h2 className="text-h7">{compare.honest.title}</h2>
                    <p className="mt-2 text-sm leading-5 text-n-1">{compare.honest.body}</p>
                </div>
            </section>

            <CompareFaq items={compareFaqItems} />

            <section className="mx-auto w-full max-w-xl px-5">
                <div className="rounded-sm border border-n-1 bg-white p-5">
                    <h2 className="text-h5">{compare.cta.title}</h2>
                    <p className="mt-2 text-sm leading-5 text-grey-1">{compare.cta.body}</p>
                    <Link href="/new" className="mt-4 block">
                        <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                            {compare.cta.button}
                        </Button>
                    </Link>
                </div>
            </section>

            <SiteFooter showCompareLink={false} />
        </main>
    )
}
