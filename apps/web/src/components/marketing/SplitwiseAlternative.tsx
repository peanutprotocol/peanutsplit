import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { CompareFaq } from '@/components/marketing/CompareFaq'
import { CompareTable } from '@/components/marketing/CompareTable'
import { JsonLd } from '@/components/marketing/JsonLd'
import { LanguageLinks } from '@/components/marketing/LanguageLinks'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { comparisonCopy } from '@/components/marketing/compare-copy'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { HREFLANG, LOCALES, type Locale } from '@/i18n/locales'
import { hreflangAlternates, localizedPath } from '@/i18n/paths'
import { breadcrumbSchema, pageMetadata } from '@/lib/seo'

const BASE_PATH = '/splitwise-alternative'

/** Metadata, canonical and hreflang all derive from the same locale-keyed object as the body. */
export function splitwiseAlternativeMetadata(locale: Locale): Metadata {
    const compare = comparisonCopy[locale]
    const meta = pageMetadata({
        title: compare.meta.title,
        description: compare.meta.description,
        path: localizedPath(BASE_PATH, locale),
        type: 'article',
        locale,
    })

    return {
        ...meta,
        alternates: {
            ...meta.alternates,
            languages: hreflangAlternates(BASE_PATH, [...LOCALES]),
        },
    }
}

/**
 * The hand-built comparison page, bound to a locale by three tiny route files.
 *
 * The importer remains English-only in this batch. Its link and migration sentence are therefore
 * hidden on translated pages; rendering translated copy around an English-only
 * destination would create a dead-end language switch in the highest-intent flow.
 */
export async function SplitwiseAlternative({ locale }: { locale: Locale }) {
    const compare = comparisonCopy[locale]
    const t = await getTranslations({ locale, namespace: 'content' })
    const showImporter = locale === 'en'
    const compareFaqItems = compare.faq.items.filter((item) => !('v2Only' in item && item.v2Only) || showImporter)
    const migrationBody = compare.migration.body.map((paragraph, index) =>
        index === 1 && showImporter ? `${paragraph} ${compare.migration.importSentence}` : paragraph
    )
    const crumbs = [
        { name: t('home'), href: '/' },
        { name: compare.meta.title, href: localizedPath(BASE_PATH, locale) },
    ]
    const faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: HREFLANG[locale],
        mainEntity: compareFaqItems.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
    }

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
                    <Link href="/app" className="block">
                        <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                            {compare.hero.cta}
                        </Button>
                    </Link>
                    <p className="mt-3 text-center text-sm text-grey-1">{compare.hero.ctaHint}</p>
                    {showImporter && (
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

            <CompareTable table={compare.table} />

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

            <CompareFaq title={compare.faq.title} items={compareFaqItems} />

            <section className="mx-auto w-full max-w-xl px-5">
                <div className="rounded-sm border border-n-1 bg-white p-5">
                    <h2 className="text-h5">{compare.cta.title}</h2>
                    <p className="mt-2 text-sm leading-5 text-grey-1">{compare.cta.body}</p>
                    <Link href="/app" className="mt-4 block">
                        <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                            {compare.cta.button}
                        </Button>
                    </Link>
                </div>
            </section>

            <LanguageLinks path={BASE_PATH} current={locale} available={[...LOCALES]} />
            <SiteFooter showCompareLink={false} showLocaleSwitcher={false} />
        </main>
    )
}

export default SplitwiseAlternative
