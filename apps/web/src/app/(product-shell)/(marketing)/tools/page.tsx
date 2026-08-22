import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { ContentAnalytics } from '@/components/marketing/ContentAnalytics'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Doodle } from '@/components/ui/Doodle'
import { Icon } from '@/components/ui/Icon'
import { absoluteUrl, breadcrumbSchema, pageMetadata, pageTitle } from '@/lib/seo'
import { TOOLS, toolPath } from '@/tools/registry'

/**
 * The calculators, listed — and the one job that is not a calculator, sent where it belongs.
 *
 * The tools were reachable from the sitemap and from nowhere a person could click, which is the
 * shape a set of pages takes when each one was shipped on its own. This is the fix: one hub, read
 * off the registry so a new calculator appears here by existing, linked from the footer of every
 * page and listed on the guides hub like any other page the site has.
 *
 * **The first card is the app, not a tool.** Splitting a bill between people is the product, so
 * offering a form for it here would be competing with ourselves and losing — a calculator hands
 * back a number one person then retypes into a group chat. The row that reads "splitting a bill"
 * therefore opens `/new`, and it is the only call to action on the page: a second one underneath
 * would be the same sentence twice.
 *
 * Deliberately thin otherwise. It ranks for nothing on its own and is not meant to.
 */

const PATH = '/tools'
const TITLE = 'Calculators for splitting a cost fairly'

const copy = {
    h1: 'Calculators',
    intro: 'One sum each, with the working underneath it. Every amount reconciles to the cent, nothing here asks for an account, and there is an answer on screen before you have typed anything.',
    app: {
        title: 'Splitting a bill',
        body: 'No calculator for that one, because it is the whole app. A bill wants everybody who was at the table, and a figure sitting in a form is a figure one person has to retype into the group chat.',
        label: 'Start a split',
        hint: 'Takes ten seconds. No email, no password, no download.',
    },
}

export const metadata: Metadata = pageMetadata({
    title: pageTitle(TITLE),
    description:
        'Calculators for rent by room size and for a shared car costed at the official mileage rate. Splitting a bill is the app itself.',
    path: PATH,
    type: 'website',
})

const crumbs = [
    { name: 'Home', href: '/' },
    { name: copy.h1, href: PATH },
]

/** ItemList tells a crawler this is a listing and gives it the crawl order the registry intends. */
const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: TOOLS.map((tool, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(toolPath(tool)),
        name: tool.copy.h1,
    })),
}

export default function ToolsHubPage() {
    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <ContentAnalytics template="tool" source="tools" />
            <JsonLd data={breadcrumbSchema(crumbs)} />
            <JsonLd data={listSchema} />

            <Breadcrumbs crumbs={crumbs} />

            <div className="mt-4 border-y border-n-1 bg-primary-1">
                <div className="mx-auto w-full max-w-xl px-5 pb-8 pt-8">
                    <h1 className="text-h3 leading-tight text-n-1">{copy.h1}</h1>
                    <p className="mt-3 text-base font-medium leading-6 text-n-1">{copy.intro}</p>
                </div>
            </div>

            <section className="mx-auto w-full max-w-xl px-5 py-8">
                <Link
                    href="/new?campaign=content-tools"
                    className="shadow-4 flex items-start gap-3 rounded-lg border-2 border-n-1 bg-primary-3 p-4 transition-transform hover:-translate-y-0.5"
                >
                    <Doodle name="wine" size={34} weight={1.6} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                        <span className="block text-h6 text-n-1">{copy.app.title}</span>
                        <span className="mt-1 block text-sm leading-5 text-n-1">{copy.app.body}</span>
                        <span className="mt-3 flex items-center gap-1 text-h8 text-n-1 underline">
                            {copy.app.label}
                            <Icon name="arrow-right" size={16} />
                        </span>
                    </span>
                </Link>
                <p className="mt-3 text-center text-sm text-grey-1">{copy.app.hint}</p>

                <ul className="mt-8 flex flex-col gap-px overflow-hidden rounded-sm border border-n-1 [&>li:first-child>a]:rounded-t-sm [&>li:last-child>a]:rounded-b-sm">
                    {TOOLS.map((tool) => (
                        <li key={tool.slug}>
                            <Link
                                href={toolPath(tool)}
                                data-focus-contained
                                className="flex items-start gap-3 bg-white px-4 py-4 hover:bg-grey-3"
                            >
                                <Doodle name={tool.doodle} size={28} weight={1.8} className="mt-0.5" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-h7 text-n-1">{tool.copy.h1}</span>
                                    <span className="mt-1 block text-sm leading-5 text-grey-1">
                                        {tool.meta.description}
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
