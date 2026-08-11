import type { ReactNode } from 'react'
import Link from 'next/link'
import { JsonLd } from '@/components/marketing/JsonLd'
import { HREFLANG, LOCALE_LABELS, LOCALES } from '@/i18n/locales'
import type { SplitGuide } from '@/lib/split-content/artifact'
import { splitGuideSchemas } from '@/lib/split-content/metadata'
import { contentOrigin, contentUrl, guidePath } from '@/lib/split-content/urls'

const OTHER_LANGUAGES = {
    en: 'Other languages',
    'es-419': 'Otros idiomas',
    'pt-br': 'Outros idiomas',
} as const

export function SplitGuideLayout({ guide, children }: { guide: SplitGuide; children: ReactNode }) {
    const schemas = splitGuideSchemas(guide)
    const otherLocales = LOCALES.filter((locale) => locale !== guide.locale)

    return (
        <main className="min-h-dvh bg-background text-n-1">
            <JsonLd data={schemas.article} />
            <JsonLd data={schemas.breadcrumbs} />

            <header className="border-b border-n-1 bg-primary-1">
                <div className="mx-auto flex w-full max-w-xl items-center justify-between px-5 py-4">
                    <a href={contentOrigin()} className="font-bold text-n-1 underline-offset-2 hover:underline">
                        Peanut
                    </a>
                    <span className="text-sm font-bold">Split</span>
                </div>
            </header>

            <article className="pb-8">
                <div className="mx-auto w-full max-w-xl px-5 pb-3 pt-10">
                    <h1 className="text-h3 leading-tight">{guide.title}</h1>
                    <p className="mt-4 text-base leading-7 text-grey-1">{guide.description}</p>
                </div>
                {children}
                <div className="mx-auto w-full max-w-xl px-5 pt-4">
                    <time dateTime={guide.date} className="text-xs text-grey-1">
                        {guide.date}
                    </time>
                </div>
            </article>

            <nav aria-label={OTHER_LANGUAGES[guide.locale]} className="mx-auto w-full max-w-xl px-5 pb-8 text-xs">
                <span className="text-grey-1">{OTHER_LANGUAGES[guide.locale]}: </span>
                {otherLocales.map((locale, index) => (
                    <span key={locale}>
                        {index > 0 && <span className="text-grey-1"> · </span>}
                        <Link
                            href={guidePath(locale, guide.slug)}
                            hrefLang={HREFLANG[locale]}
                            lang={HREFLANG[locale]}
                            className="underline underline-offset-2"
                        >
                            {LOCALE_LABELS[locale]}
                        </Link>
                    </span>
                ))}
            </nav>

            <footer className="border-t border-n-1 bg-white">
                <div className="mx-auto w-full max-w-xl px-5 py-6 text-xs text-grey-1">
                    <a href={contentUrl(guide.href)}>{guide.title}</a>
                </div>
            </footer>
        </main>
    )
}
