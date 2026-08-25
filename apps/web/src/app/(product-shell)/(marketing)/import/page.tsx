import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SkinFrame } from '@/components/marketing/SkinFrame'
import { CTA, FAQ, FAQItem, Hero } from '@/components/marketing/mdx/blocks'
import { marketingCopy } from '@/components/marketing/copy'
import { SplitwiseImport } from '@/components/import/SplitwiseImport'
import {
    DEFAULT_LOCALE,
    HREFLANG,
    LOCALE_COOKIE,
    isLocale,
    localeFromAcceptLanguage,
    type Locale,
} from '@/i18n/locales'
import { loadMessages } from '@/i18n/messages'
import { appBreadcrumbSchema, appPageMetadata } from '@/lib/seo'
import { hashSlug } from '@/lib/split-content/seed'
import { skinFor } from '@/lib/split-content/skin'

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
export const metadata: Metadata = {
    ...appPageMetadata({
        title: importPage.meta.title,
        description: importPage.meta.description,
        path: '/import',
        type: 'article',
    }),
    // Footer-linked but deliberately out of the sitemap — the page's own directive should match
    // that intent rather than contradict it, same as /new.
    robots: { index: false, follow: true },
}

const crumbs = [
    { name: 'Home', href: '/app' },
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

/**
 * The canonical page remains English, but its embedded product tool follows the reader's app
 * preference. The request-level locale cannot answer this because the proxy correctly pins the
 * English marketing shell to `en`; resolving the preference locally keeps the indexed prose and
 * `<html lang="en">` truthful while the tool itself speaks the language the reader chose.
 */
async function importToolLocale(): Promise<Locale> {
    const stored = (await cookies()).get(LOCALE_COOKIE)?.value
    if (isLocale(stored)) return stored

    return localeFromAcceptLanguage((await headers()).get('accept-language')) ?? DEFAULT_LOCALE
}

export default async function ImportPage() {
    const toolLocale = await importToolLocale()
    const toolMessages = await loadMessages(toolLocale)
    // Hand-built rather than a registry surface, so the skin is read straight off the one gate and
    // the wallpaper pool is named here. No map: `toolWallpaperChapter` and its template twin exist
    // because those are registries with N members, and a one-entry map is a list waiting to drift.
    // `versus` is the pool the Splitwise comparison pages already draw from, and this is that family.
    const skin = skinFor('import', 'default')

    const body = (
        <>
            <Hero eyebrow={importPage.hero.eyebrow} title={importPage.hero.title} subtitle={importPage.hero.body} />

            <section className="mx-auto w-full max-w-xl px-5 py-6" lang={HREFLANG[toolLocale]}>
                <NextIntlClientProvider locale={toolLocale} messages={toolMessages}>
                    <SplitwiseImport />
                </NextIntlClientProvider>
            </section>

            {/* Not `Checklist`: two of these four are caveats, and a green tick on "old exchange
                rates are not in the file" would read as a promise. Same card as `FAQItem`, so it
                takes the same hook and joins the sticker group — but it stays a list of statements
                rather than a `<dl>` of questions nobody asked. */}
            <section className="mx-auto w-full max-w-xl px-5 py-4">
                <h2 className="split-block-title text-h5">{importPage.honest.title}</h2>
                <ul className="mt-4 flex flex-col gap-3">
                    {importPage.honest.items.map((item) => (
                        <li key={item.title} className="split-faq-item rounded-sm border border-n-1 bg-white p-4">
                            <h3 className="text-h7">{item.title}</h3>
                            <p className="mt-2 text-sm leading-5 text-grey-1">{item.body}</p>
                        </li>
                    ))}
                </ul>
            </section>

            <FAQ title={importPage.faq.title}>
                {importPage.faq.items.map((item) => (
                    <FAQItem key={item.q} question={item.q}>
                        {item.a}
                    </FAQItem>
                ))}
            </FAQ>

            <CTA title={importPage.cta.title} body={importPage.cta.body} text={importPage.cta.button} />
        </>
    )

    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <JsonLd data={faqJsonLd} />
            <JsonLd data={appBreadcrumbSchema(crumbs)} />

            <Breadcrumbs crumbs={crumbs} />

            {/* Crumbs above, footer below — the `mt-auto` pin only works while `SiteFooter` is a
                direct flex child of this column. Same idiom as `ToolPage`. */}
            {skin === 'none' ? (
                body
            ) : (
                <SkinFrame skin={skin} seed={hashSlug('import')} chapter="versus" className="flex flex-1 flex-col">
                    {body}
                </SkinFrame>
            )}

            <SiteFooter showLocaleSwitcher={false} />
        </main>
    )
}
