import type { Metadata } from 'next'
import Link from 'next/link'
import { CompareFaq } from '@/components/marketing/CompareFaq'
import { CompareTable } from '@/components/marketing/CompareTable'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { marketingCopy } from '@/components/marketing/copy'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

const { compare } = marketingCopy

export const metadata: Metadata = {
    title: compare.meta.title,
    description: compare.meta.description,
    alternates: { canonical: '/splitwise-alternative' },
    openGraph: {
        type: 'article',
        url: '/splitwise-alternative',
        title: compare.meta.title,
        description: compare.meta.description,
    },
    twitter: {
        card: 'summary_large_image',
        title: compare.meta.title,
        description: compare.meta.description,
    },
}

/** Rich result for the FAQ block. Mirrors what's rendered — if the copy changes, this follows. */
const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: compare.faq.items.map((item) => ({
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
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

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

            <CompareFaq />

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
