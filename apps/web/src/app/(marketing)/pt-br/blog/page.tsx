import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ContentHub } from '@/components/marketing/ContentHub'
import { hreflangAlternates } from '@/i18n/paths'
import { LOCALES } from '@/i18n/locales'
import { pageMetadata, pageTitle } from '@/lib/seo'

/** The Portuguese guides hub. Implementation is shared — see ContentHub. */
const LOCALE = 'pt-BR' as const

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations({ locale: LOCALE, namespace: 'content' })
    const meta = pageMetadata({
        title: pageTitle(t('hubTitle')),
        description: t('hubDescription'),
        path: '/pt-br/blog',
        type: 'website',
        locale: LOCALE,
    })
    // The hub exists in every locale by construction, so it always advertises the full set.
    return { ...meta, alternates: { ...meta.alternates, languages: hreflangAlternates('/blog', [...LOCALES]) } }
}

export default function Page() {
    return <ContentHub locale={LOCALE} />
}
