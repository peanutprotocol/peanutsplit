import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { ContentAnalytics } from '@/components/marketing/ContentAnalytics'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Doodle } from '@/components/ui/Doodle'
import { breadcrumbSchema } from '@/lib/seo'
import { TEMPLATES, TEMPLATES_PATH, templatePath } from '@/templates/registry'
import { TEMPLATES_HUB } from '@/templates/shared'

/**
 * The list of template rooms.
 *
 * A listing rather than a template, so it holds no room of its own and links onward to every one
 * that does. Each row prints the name the room will actually have, because that is the whole
 * claim the page makes.
 */
export async function TemplatesHub() {
    const t = await getTranslations({ locale: 'en', namespace: 'content' })
    const crumbs = [
        { name: t('home'), href: '/' },
        { name: TEMPLATES_HUB.title, href: TEMPLATES_PATH },
    ]

    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <ContentAnalytics template="room-template" source="templates-hub" />
            <JsonLd data={breadcrumbSchema(crumbs)} />

            <Breadcrumbs crumbs={crumbs} />

            <header className="mx-auto w-full max-w-xl px-5 pb-2 pt-4">
                <h1 className="split-page-title text-h4 leading-tight text-n-1">{TEMPLATES_HUB.h1}</h1>
                <p className="mt-4 text-base leading-6 text-n-1">{TEMPLATES_HUB.intro}</p>
            </header>

            <section className="mx-auto w-full max-w-xl px-5 py-4">
                <ul className="flex flex-col gap-3">
                    {TEMPLATES.map((template) => (
                        <li key={template.slug}>
                            <Link
                                href={templatePath(template)}
                                className="flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4 transition-transform hover:-translate-y-0.5"
                            >
                                <Doodle name={template.room.emblem} size={32} weight={1.6} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-h7 text-n-1">{template.meta.title}</span>
                                    <span className="mt-1 block text-sm leading-5 text-grey-1">
                                        {TEMPLATES_HUB.opens} {template.room.name}
                                    </span>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>

            <SiteFooter showLocaleSwitcher={false} />
        </main>
    )
}

export default TemplatesHub
