import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Button } from '@/components/ui/Button'
import { absoluteUrl, breadcrumbSchema, pageMetadata } from '@/lib/seo'
import { TOOLS, toolPath } from '@/tools/registry'

/**
 * The calculators, listed.
 *
 * The tools were reachable from the sitemap and from nowhere a person could click, which is the
 * shape a set of pages takes when each one was shipped on its own. This is the fix: one hub, read
 * off the registry so a new calculator appears here by existing, linked from the footer of every
 * page and listed on the guides hub like any other page the site has.
 *
 * Deliberately thin. It ranks for nothing on its own and is not meant to — its job is to be the
 * one internal link that makes three calculators findable from anywhere on the site, and a hub
 * that argues its case is a hub that delays the click.
 */

const PATH = '/tools'
const TITLE = 'Calculators for splitting a cost fairly'

const copy = {
    h1: 'Calculators',
    intro: 'One sum each, and the working underneath it. Every amount reconciles to the cent, nothing here asks for an account, and the answer is on screen before you type anything.',
    ctaLabel: 'Start a split',
    ctaHint: 'Takes ten seconds. No email, no password, no download.',
}

export const metadata: Metadata = pageMetadata({
    title: TITLE,
    description: 'Calculators for a bill, a rent by room size, and a shared car costed at the official mileage rate.',
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
                <ul className="flex flex-col gap-px overflow-hidden rounded-sm border border-n-1">
                    {TOOLS.map((tool) => (
                        <li key={tool.slug}>
                            <Link href={toolPath(tool)} className="block bg-white px-4 py-4 hover:bg-grey-3">
                                <span className="block text-h7 text-n-1">{tool.copy.h1}</span>
                                <span className="mt-1 block text-sm leading-5 text-grey-1">
                                    {tool.meta.description}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>

                <Link href="/new" className="mt-8 block">
                    <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                        {copy.ctaLabel}
                    </Button>
                </Link>
                <p className="mt-3 text-center text-sm text-grey-1">{copy.ctaHint}</p>
            </section>

            <SiteFooter showLocaleSwitcher={false} />
        </main>
    )
}
