import { getTranslations } from 'next-intl/server'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { CTA, FAQ, FAQItem, RelatedLink, RelatedPages } from '@/components/marketing/mdx/blocks'
import { ToolCalculator } from '@/components/tools/ToolCalculator'
import { breadcrumbSchema, faqSchema, toolSchema } from '@/lib/seo'
import { toolPath } from '@/tools/registry'
import type { Tool } from '@/tools/types'

/**
 * The frame every tool renders through: structured data, the intro, the calculator, the method
 * note, the concession, the CTA, the questions.
 *
 * Server-rendered apart from the calculator itself. That split is the whole point of the shell —
 * the intro, the concession and the FAQ are the page's ranking surface and have to be real HTML in
 * the first response, while the only thing that needs the client is the arithmetic. A page that
 * put the copy inside the client component would rank on an empty div.
 *
 * Section order is §4.6: the concession earns the CTA, so it comes before it. The method note
 * (§8.1) sits between the result and the concession, where the reader has just seen a number they
 * might be about to over-apply.
 *
 * Blocks are reused from the MDX set rather than re-styled here. A tool page and an article are
 * the same column at the same width on purpose — a calculator that looked like a different site
 * would be a second design system to keep in step.
 */
export async function ToolPage({ tool }: { tool: Tool }) {
    const t = await getTranslations({ locale: 'en', namespace: 'content' })
    const path = toolPath(tool)
    const crumbs = [
        { name: t('home'), href: '/' },
        { name: tool.copy.h1, href: path },
    ]

    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <JsonLd data={toolSchema({ path, title: tool.meta.title, description: tool.meta.description })} />
            <JsonLd data={breadcrumbSchema(crumbs)} />
            <JsonLd data={faqSchema(tool.faqs)} />

            <Breadcrumbs crumbs={crumbs} />

            <header className="mx-auto w-full max-w-xl px-5 pb-2 pt-4">
                <h1 className="text-h4 leading-tight text-n-1">{tool.copy.h1}</h1>
                {tool.copy.intro.map((paragraph) => (
                    <p key={paragraph} className="mt-4 text-base leading-6 text-n-1">
                        {paragraph}
                    </p>
                ))}
            </header>

            <ToolCalculator slug={tool.slug} />

            {tool.copy.method && (
                <section className="mx-auto w-full max-w-xl px-5 py-6">
                    <h2 className="text-h6">{tool.copy.method.title}</h2>
                    {tool.copy.method.body.map((paragraph) => (
                        <p key={paragraph} className="mt-3 text-sm leading-5 text-n-1">
                            {paragraph}
                        </p>
                    ))}
                </section>
            )}

            <section className="mx-auto w-full max-w-xl px-5 py-4">
                <h2 className="text-h6">{tool.copy.concession.title}</h2>
                <p className="mt-3 text-sm leading-5 text-n-1">{tool.copy.concession.body}</p>
            </section>

            <section className="mx-auto w-full max-w-xl px-5 py-4">
                <h2 className="text-h6">{tool.copy.goodToKnow.title}</h2>
                {tool.copy.goodToKnow.body.map((line) => (
                    <p key={line} className="mt-3 text-sm leading-5 text-n-1">
                        {line}
                    </p>
                ))}
            </section>

            {/*
             * Straight to `/new`, with nothing carried across. `CreateRoomForm` holds its three
             * fields in local state and reads no search params, and `POST /api/rooms` takes a body
             * rather than a query — so there is nothing to prefill against today, and inventing a
             * link shape the form ignores would be a CTA that silently drops what the reader typed.
             *
             * What prefill would need, if it is ever wanted: `CreateRoomForm` reading `name`,
             * `currency` and a member-count hint through nuqs (the pattern `room-params.ts`
             * already uses for the room drawers), seeding its initial state from them, and this
             * CTA building the query from the calculator's own state — which would make it a
             * client component. No API change either way; the create endpoint is untouched.
             */}
            <CTA title={tool.copy.cta.title} body={tool.copy.cta.body} text={tool.copy.cta.label} href="/new" />

            <FAQ title={tool.copy.faqTitle}>
                {tool.faqs.map((faq) => (
                    <FAQItem key={faq.question} question={faq.question}>
                        {faq.answer}
                    </FAQItem>
                ))}
            </FAQ>

            {/* Same block an article ends on, for the same reason: a page nothing links onward from
                is where a reader's session ends and where a crawler turns round. */}
            {tool.related && tool.related.length > 0 && (
                <RelatedPages>
                    {tool.related.map((link) => (
                        <RelatedLink key={link.href} href={link.href}>
                            {link.label}
                        </RelatedLink>
                    ))}
                </RelatedPages>
            )}

            <SiteFooter showLocaleSwitcher={false} />
        </main>
    )
}

export default ToolPage
