import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { LandingPersona } from '@/components/marketing/LandingPersona'
import { buttonClassName } from '@/components/ui/button-style'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'
import { Icon } from '@/components/ui/Icon'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'
import { castPersona } from '@/lib/cast'
import type { Faq } from '@/lib/content'
import { publicFossReleased } from '@/lib/flags'
import type { Chapter } from '@/lib/split-content/chapter-tokens'
import { spotDoodle, spotPlan } from '@/lib/split-content/spot-placer'
import { ShortVersionSlot } from './ShortVersionSlot'

/**
 * The blocks an article can use. Split's article surface is one column at max-w-xl, the same
 * width as the LP and the room screen, so a marketing page and the app never feel like two
 * products. Everything here is a server component — an article ships zero client JS.
 *
 * These are re-implementations of the ideas in peanut.me's MDX component set, not imports of
 * it. Split's palette (primary-1 yellow, pink reserved for the Peanut mark) and its narrower
 * column are the reason; the shared-component version would have to be configurable in ways
 * neither site wants.
 *
 * Constraint worth knowing before adding one: next-mdx-remote strips JSX expression props, so
 * a component used from markdown can only take strings and children. No arrays, no objects.
 */

const COLUMN = 'mx-auto w-full max-w-xl px-5'

/** Prepared public-source copy stays in the reviewable document but emits no HTML before release. */
export function PublicSourceOnly({ children }: { children: ReactNode }) {
    return publicFossReleased() ? children : null
}

/**
 * What the engine knows about the page a block is rendering on (fun-engine.md S4). Built once per
 * render in `localizedMdxComponents` and handed down as ordinary props — never React Context,
 * which a Server Component cannot create (see `ShortVersionSlot.tsx`'s docstring). `Hero`/the
 * markdown `h1` override use `faq`; `Steps`/`Checklist` use the rest to place a doodle.
 */
export interface ContentRenderContext {
    faq?: Faq
    chapter: Chapter
    seed: number
    register: 'default' | 'flat'
    /** The page's own slug. Both SEO loops key their campaign code off it — never the locale, so
     *  the three translations of one article report as one campaign. */
    slug: string
    /** Root-relative canonical path — the same `frontmatter.canonical ?? doc.href` the metadata,
     *  the JSON-LD and `ArticleLayout` already use. `<Share>` runs it through `absoluteUrl`. */
    canonical: string
}

/**
 * The room-creation link: campaign-coded when we know which article it is on (SEO loop A), and
 * carrying the page's own language when — and only when — the page is on a locale-prefixed URL.
 *
 * The locale is not decoration. `/new` reads the language off a cookie, and a Spanish or
 * Portuguese page states its language in its URL and never sets that cookie — so a Spanish
 * landing handed its reader to an English room creator. `locale-handoff.ts` is the receiving end.
 *
 * English is the one language that must NOT say it, and this is the same rule
 * `providers.tsx` applies on the client: `/new?locale=…` is written to `ps-locale` for a year, so
 * an English page that stated `locale=en` re-languaged a Portuguese reader who never asked for it
 * — on prefetch, from the site footer, before any click. English pages are unprefixed
 * (`i18n/paths.ts`), so they already are what the cookie decides; only a prefixed URL carries
 * language the cookie cannot know.
 *
 * Only a `/new` href is rewritten, and an authored query survives — `ToolPage` writes its own
 * `campaign` — so the result stays one plain link attribute, deterministic per slug and language,
 * which is what lets a content-sourced room be counted without any app-side change to `/new`.
 * Precedent: `SettleDrawer`'s `campaign=split`.
 *
 * Every block an article can point at `/new` calls this: `Hero`, `CTA`, `RelatedLink` and the
 * prose `a` — the last two because who-pays-for-the-wine ends its related list with one and
 * fair-split-calculator sends its reader on mid-sentence, and a single uncoded link on a paid
 * page is a hole in the only number this loop exists to produce.
 */
export function newRoomHref(href: string, slug: string | undefined, locale: Locale): string {
    const [pathname, query] = href.split('?')
    if (pathname !== '/new') return href

    const params = new URLSearchParams(query)
    if (slug && !params.has('campaign')) params.set('campaign', `content-${slug}`)
    if (locale !== DEFAULT_LOCALE && !params.has('locale')) params.set('locale', locale)
    const search = params.toString()
    return search ? `${pathname}?${search}` : pathname
}

export function Hero({
    eyebrow,
    title,
    subtitle,
    cta,
    ctaHref = '/new',
    ctaHint,
    shortVersionFaq,
    locale = 'en',
    context,
}: {
    eyebrow?: string
    title: string
    subtitle?: string
    cta?: string
    ctaHref?: string
    ctaHint?: string
    /** Not MDX-authored — bound in `localizedMdxComponents` from the page's own frontmatter. */
    shortVersionFaq?: Faq
    locale?: Locale
    /** Not MDX-authored — bound in `localizedMdxComponents`. */
    context?: ContentRenderContext
}) {
    return (
        <section>
            {/* `split-hero-band` is on the band itself, not the section: a rule on the ancestor
                cannot repaint a child's own `bg-primary-1` (fun-engine.md Wave 2 / S2). */}
            <div className="split-hero-band border-b border-n-1 bg-primary-1">
                <div className={`${COLUMN} pb-8 pt-10`}>
                    {eyebrow && (
                        <span className="split-hero-eyebrow inline-flex items-center rounded-sm border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-wide text-n-1">
                            {eyebrow}
                        </span>
                    )}
                    <h1 className="split-page-title mt-5 text-h3 leading-tight text-n-1">{title}</h1>
                    {subtitle && <p className="mt-4 text-base font-medium leading-6 text-n-1">{subtitle}</p>}
                </div>
            </div>
            <ShortVersionSlot faq={shortVersionFaq} locale={locale} />
            {cta && (
                <div className={`${COLUMN} pt-6`}>
                    <Link
                        href={newRoomHref(ctaHref, context?.slug, locale)}
                        className={buttonClassName({ shadowSize: '4', className: 'split-btn justify-center text-h6' })}
                    >
                        {cta}
                    </Link>
                    {ctaHint && <p className="mt-3 text-center text-sm text-grey-1">{ctaHint}</p>}
                </div>
            )}
        </section>
    )
}

export function CTA({
    text,
    href = '/new',
    title,
    body,
    locale = 'en',
    context,
}: {
    text: string
    href?: string
    title?: string
    body?: string
    /** Not MDX-authored — bound in `localizedMdxComponents`. */
    locale?: Locale
    /** Not MDX-authored — bound in `localizedMdxComponents`. */
    context?: ContentRenderContext
}) {
    return (
        <section className={`${COLUMN} my-10`}>
            <div className="split-cta-card rounded-sm border border-n-1 bg-white p-5">
                {title && <h2 className="split-block-title text-h5">{title}</h2>}
                {body && <p className="mt-2 text-sm leading-5 text-grey-1">{body}</p>}
                <Link
                    href={newRoomHref(href, context?.slug, locale)}
                    className={buttonClassName({ shadowSize: '4', className: 'split-btn mt-4 justify-center text-h6' })}
                >
                    {text}
                </Link>
            </div>
        </section>
    )
}

/**
 * Chapter-scoped doodle placement, shared by `Steps` and `Checklist` (fun-engine.md S4). `context`
 * is absent for guides this wave (Invariants #2 — CSS-level treatment only), so `spotPlan` is
 * simply never called and every child renders exactly as it did before this stage.
 */
function withSpotDoodles(children: ReactNode, context: ContentRenderContext | undefined): ReactNode {
    if (!context) return children
    const spots = spotPlan(context.seed, context.chapter, Children.count(children), context.register)
    if (spots.length === 0) return children
    return Children.map(children, (child, index) => {
        if (!spots.includes(index) || !isValidElement(child)) return child
        const doodle = spotDoodle(context.seed, context.chapter, index)
        return cloneElement(child as ReactElement<{ doodle?: DoodleName }>, { doodle })
    })
}

export function Steps({
    title,
    children,
    context,
}: {
    title?: string
    children: ReactNode
    /** Not MDX-authored — bound in `localizedMdxComponents`. */
    context?: ContentRenderContext
}) {
    return (
        <section className={`${COLUMN} my-10`}>
            {title && <h2 className="split-block-title text-h5">{title}</h2>}
            {/* `split-steps` resets the `split-step` counter that numbers each row's leader digit
                (globals.css) — a receipt-grammar ledger mark, not a re-implementation of the `<ol>`'s
                own semantic numbering. */}
            <ol className="split-steps mt-4 flex flex-col gap-3">{withSpotDoodles(children, context)}</ol>
        </section>
    )
}

export function Step({ title, children, doodle }: { title: string; children: ReactNode; doodle?: DoodleName }) {
    return (
        <li className="split-step relative rounded-sm border border-n-1 bg-white py-4 pl-11 pr-4">
            {doodle && (
                <Doodle
                    name={doodle}
                    size={20}
                    weight={1.6}
                    aria-hidden="true"
                    className="absolute right-3 top-3 text-[color:var(--chapter-ink)]"
                />
            )}
            <h3 className="text-h7">{title}</h3>
            <div className="mt-2 text-sm leading-5 text-grey-1">{children}</div>
        </li>
    )
}

/**
 * Rendered FAQ. The JSON-LD counterpart is built from frontmatter `faqs`, not from these
 * children — markdown children are React nodes and cannot be serialised into schema. Keep the
 * two in step: if an article renders an <FAQ>, its questions belong in frontmatter too.
 */
export function FAQ({ title = 'Questions', children }: { title?: string; children: ReactNode }) {
    return (
        // `id="questions"` is the jump target `<ShortVersionSlot>`'s link points at.
        <section id="questions" className={`${COLUMN} my-10`}>
            <h2 className="split-block-title text-h5">{title}</h2>
            <dl className="mt-4 flex flex-col gap-3">{children}</dl>
        </section>
    )
}

export function FAQItem({ question, children }: { question: string; children: ReactNode }) {
    return (
        <div className="split-faq-item rounded-sm border border-n-1 bg-white p-4">
            <dt className="text-h7">{question}</dt>
            <dd className="mt-2 text-sm leading-5 text-grey-1">{children}</dd>
        </div>
    )
}

export function Callout({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <aside className={`${COLUMN} my-8`}>
            {/* Subtraction pass: no border/radius here (fun-engine.md S3) — the box reads as a
                "taped note" from `split-callout`'s ::before tape strip (globals.css) alone. */}
            <div className="split-callout relative bg-primary-3 p-4">
                {title && <h3 className="text-h7">{title}</h3>}
                <div className="mt-2 text-sm leading-5 text-n-1">{children}</div>
            </div>
        </aside>
    )
}

/**
 * A quote with its source spelled out. Used for the one thing an alternative page is allowed to
 * assert about somebody else's product: what that product says about itself, attributed. Anything
 * we would have to measure ourselves does not belong on these pages — it rots and we cannot
 * defend it.
 */
export function Quote({ children, source }: { children: ReactNode; source: string }) {
    return (
        // Two elements for the reason `Callout` needs two: the column wrapper is full-bleed, so a
        // skin rule that paints `split-quote` a ground, a border and a tilt has to land on an inner
        // box or the slip runs the whole page width. The inner box is the `<figure>` rather than a
        // plain div because `<figcaption>` is only a caption as a direct child of one — nesting it
        // a level deeper is invalid HTML and costs the figure its accessible name.
        <div className={`${COLUMN} my-8`}>
            {/* Evidence slip (fun-engine.md S3): a dashed top rule stands in for the left rule, so a
                verbatim competitor quote reads as a torn-off receipt line rather than a callout. */}
            <figure className="split-quote">
                <blockquote className="border-t border-dashed border-n-1 pt-3 text-sm italic leading-5 text-n-1">
                    {children}
                </blockquote>
                <figcaption className="mt-2 text-h9 uppercase tabular-nums tracking-wide text-grey-1">
                    {source}
                </figcaption>
            </figure>
        </div>
    )
}

/** Drawn sizes in px. `md` is the reading-column default; `lg` is a section opener. */
const CAST_SIZES = { sm: 40, md: 64, lg: 96 } as const

/**
 * One of the cast, drawn beside the prose.
 *
 * A figure, not a speaker. The characters have no dialogue anywhere in the product and they get
 * none here: `caption` is the article's own voice describing the drawing, and there is deliberately
 * no prop that would put words in a character's mouth. That division of labour — names carry the
 * whimsy, prose stays dry — is what keeps the tone off the register Konrad ruled out.
 *
 * `name` takes a character (`raincoat-duck`) or a landing role (`ana`); see `lib/cast.ts`. It is a
 * string because next-mdx-remote strips anything that is not, and it is validated by
 * `content.test.ts` rather than here — an unknown name renders the caption alone rather than
 * failing the build, because a bad article must never be able to break `next build`.
 *
 * The English display name is never rendered. The labels in `avatars.ts` are English literals
 * outside the i18n catalogs, so a Spanish page naming the character would ship an untranslated
 * string; the caption is the page's own words and translates with the page.
 */
export function Cast({
    name,
    size = 'md',
    caption,
}: {
    name: string
    size?: keyof typeof CAST_SIZES
    caption?: string
}) {
    const persona = castPersona(name)
    return (
        <figure className={`${COLUMN} my-8 flex items-center gap-4`}>
            {persona && <LandingPersona persona={persona} size={CAST_SIZES[size]} className="split-cast-art" />}
            {caption && <figcaption className="flex-1 text-sm leading-5 text-grey-1">{caption}</figcaption>}
        </figure>
    )
}

export function Checklist({
    title,
    children,
    context,
}: {
    title?: string
    children: ReactNode
    /** Not MDX-authored — bound in `localizedMdxComponents`. */
    context?: ContentRenderContext
}) {
    return (
        <section className={`${COLUMN} my-10`}>
            {title && <h2 className="split-block-title text-h5">{title}</h2>}
            <ul className="mt-4 flex flex-col gap-3">{withSpotDoodles(children, context)}</ul>
        </section>
    )
}

export function ChecklistItem({
    title,
    children,
    doodle,
}: {
    title: string
    children: ReactNode
    doodle?: DoodleName
}) {
    return (
        // `split-checklist-item` punches a perforated tear-line out of the left border via
        // mask-image (globals.css) — the border itself stays, per fun-engine.md S3's subtraction list.
        <li className="split-checklist-item relative flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4">
            <span
                aria-hidden="true"
                className="split-tick flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1 bg-green-1"
            >
                <Icon name="check" size={14} className="text-n-1" />
            </span>
            <span className="flex-1">
                <span className="block text-h7">{title}</span>
                <span className="mt-1 block text-sm leading-5 text-grey-1">{children}</span>
            </span>
            {doodle && (
                <Doodle
                    name={doodle}
                    size={20}
                    weight={1.6}
                    aria-hidden="true"
                    className="absolute right-3 top-3 text-[color:var(--chapter-ink)]"
                />
            )}
        </li>
    )
}

export function RelatedPages({ title = 'Keep reading', children }: { title?: string; children: ReactNode }) {
    return (
        <nav className={`${COLUMN} my-10`} aria-label={title}>
            <h2 className="split-block-title text-h5">{title}</h2>
            <ul className="split-related-list mt-4 flex flex-col gap-px overflow-hidden rounded-sm border border-n-1 [&>li:first-child>a]:rounded-t-sm [&>li:last-child>a]:rounded-b-sm">
                {children}
            </ul>
        </nav>
    )
}

export function RelatedLink({
    href,
    children,
    locale = 'en',
    context,
}: {
    href: string
    children: ReactNode
    /** Not MDX-authored — bound in `localizedMdxComponents`. */
    locale?: Locale
    /** Not MDX-authored — bound in `localizedMdxComponents`. A related list is the one other place
     *  an article authors `/new` (who-pays-for-the-wine does), so loop A has to reach it too. */
    context?: ContentRenderContext
}) {
    return (
        <li>
            <Link
                href={newRoomHref(href, context?.slug, locale)}
                data-focus-contained
                className="flex min-h-11 items-center gap-2 bg-white px-4 py-3 hover:bg-grey-3"
            >
                <span className="flex-1 text-sm font-medium text-n-1">{children}</span>
                <Icon name="arrow-right" size={16} className="shrink-0 text-grey-1" />
            </Link>
        </li>
    )
}
