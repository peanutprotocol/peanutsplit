import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { ContentAnalytics } from '@/components/marketing/ContentAnalytics'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { CTA, FAQ, FAQItem, RelatedLink, RelatedPages } from '@/components/marketing/mdx/blocks'
import { buttonClassName } from '@/components/ui/button-style'
import { Doodle } from '@/components/ui/Doodle'
import { CATALOG_BY_CODE } from '@/lib/currency-catalog'
import { breadcrumbSchema, faqSchema } from '@/lib/seo'
import type { Utm } from '@/lib/utm'
import { templateCtaHref } from '@/templates/links'
import { TEMPLATES_PATH, templatePath } from '@/templates/registry'
import {
    TEMPLATE_CTA_HINT,
    TEMPLATE_CTA_LABEL,
    TEMPLATE_FAQ_TITLE,
    TEMPLATE_GOOD_TO_KNOW,
    TEMPLATE_RELATED_TITLE,
    TEMPLATE_SETUP,
    TEMPLATES_HUB,
} from '@/templates/shared'
import type { RoomTemplate } from '@/templates/types'

/**
 * The frame every template renders through: what the link has already decided, what tends to go
 * in the room, when something else is the better tool, and the link itself.
 *
 * Server-rendered start to finish. There is no client half at all — the page's whole behaviour is
 * an anchor, which is what lets a link pasted into a group chat work for somebody whose browser
 * is doing its best on a train.
 *
 * The setup panel is the honesty: a page that says "already set up" without showing what it set up
 * is asking to be trusted about the one thing it can simply print. It carries the CTA as well,
 * because that is where a reader who came from a community post is ready to tap, and the CTA
 * further down is for the one who read first.
 *
 * The campaign is passed in rather than read here — see `utm.ts`. Both anchors carry the same
 * values the reader arrived on, so the room they open belongs to the post that sent them.
 */
export async function TemplatePage({ template, utm = {} }: { template: RoomTemplate; utm?: Utm }) {
    const t = await getTranslations({ locale: 'en', namespace: 'content' })
    const path = templatePath(template)
    const href = templateCtaHref(template, utm)
    const currency = template.room.currency ? CATALOG_BY_CODE.get(template.room.currency) : undefined
    const crumbs = [
        { name: t('home'), href: '/' },
        { name: TEMPLATES_HUB.title, href: TEMPLATES_PATH },
        { name: template.copy.h1, href: path },
    ]

    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <ContentAnalytics template="room-template" source={template.slug} />
            <JsonLd data={breadcrumbSchema(crumbs)} />
            <JsonLd data={faqSchema([...template.faqs])} />

            <Breadcrumbs crumbs={crumbs} />

            <header className="mx-auto w-full max-w-xl px-5 pb-2 pt-4">
                <div className="flex items-start gap-3">
                    <Doodle name={template.room.emblem} size={38} weight={1.5} />
                    <h1 className="split-page-title text-h4 leading-tight text-n-1">{template.copy.h1}</h1>
                </div>
                {template.copy.intro.map((paragraph) => (
                    <p key={paragraph} className="mt-4 text-base leading-6 text-n-1">
                        {paragraph}
                    </p>
                ))}
            </header>

            <section className="mx-auto w-full max-w-xl px-5 py-4">
                <div className="rounded-sm border border-n-1 bg-white p-5">
                    <h2 className="split-block-title text-h6">{TEMPLATE_SETUP.title}</h2>
                    <dl className="mt-3 flex flex-col gap-2 text-sm leading-5 text-n-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            <dt className="text-grey-1">{TEMPLATE_SETUP.name}</dt>
                            <dd className="text-h8">{template.room.name}</dd>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            <dt className="text-grey-1">{TEMPLATE_SETUP.currency}</dt>
                            <dd className="text-h8">
                                {currency ? `${currency.code} — ${currency.name}` : TEMPLATE_SETUP.currencyFromDevice}
                            </dd>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2">
                            <dt className="text-grey-1">{TEMPLATE_SETUP.emblem}</dt>
                            <dd>
                                <Doodle name={template.room.emblem} size={28} label={template.room.name} />
                            </dd>
                        </div>
                    </dl>
                    <p className="mt-3 text-sm leading-5 text-grey-1">{TEMPLATE_SETUP.hint}</p>
                    <Link
                        href={href}
                        className={buttonClassName({
                            shadowSize: '4',
                            className: 'split-btn mt-4 justify-center text-h6',
                        })}
                    >
                        {TEMPLATE_CTA_LABEL}
                    </Link>
                </div>
            </section>

            <section className="mx-auto w-full max-w-xl px-5 py-4">
                <h2 className="text-h6">{template.copy.lines.title}</h2>
                <p className="mt-3 text-sm leading-5 text-n-1">{template.copy.lines.intro}</p>
                <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-5 text-n-1">
                    {template.copy.lines.items.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </section>

            <section className="mx-auto w-full max-w-xl px-5 py-4">
                <h2 className="text-h6">{template.copy.concession.title}</h2>
                <p className="mt-3 text-sm leading-5 text-n-1">{template.copy.concession.body}</p>
            </section>

            <section className="mx-auto w-full max-w-xl px-5 py-4">
                <h2 className="text-h6">{TEMPLATE_GOOD_TO_KNOW.title}</h2>
                {TEMPLATE_GOOD_TO_KNOW.body.map((line) => (
                    <p key={line} className="mt-3 text-sm leading-5 text-n-1">
                        {line}
                    </p>
                ))}
            </section>

            <CTA title={template.copy.ctaTitle} body={TEMPLATE_CTA_HINT} text={TEMPLATE_CTA_LABEL} href={href} />

            <FAQ title={TEMPLATE_FAQ_TITLE}>
                {template.faqs.map((faq) => (
                    <FAQItem key={faq.question} question={faq.question}>
                        {faq.answer}
                    </FAQItem>
                ))}
            </FAQ>

            {template.related && template.related.length > 0 && (
                <RelatedPages title={TEMPLATE_RELATED_TITLE}>
                    {template.related.map((link) => (
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

export default TemplatePage
