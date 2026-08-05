import type { ReactNode } from 'react'
import Link from 'next/link'
import { LandingPersona } from '@/components/marketing/LandingPersona'
import { buttonClassName } from '@/components/ui/button-style'
import { Icon } from '@/components/ui/Icon'
import { castPersona } from '@/lib/cast'

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

export function Hero({
    eyebrow,
    title,
    subtitle,
    cta,
    ctaHref = '/new',
    ctaHint,
}: {
    eyebrow?: string
    title: string
    subtitle?: string
    cta?: string
    ctaHref?: string
    ctaHint?: string
}) {
    return (
        <section>
            <div className="border-b border-n-1 bg-primary-1">
                <div className={`${COLUMN} pb-8 pt-10`}>
                    {eyebrow && (
                        <span className="inline-flex items-center rounded-sm border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-wide text-n-1">
                            {eyebrow}
                        </span>
                    )}
                    <h1 className="mt-5 text-h3 leading-tight text-n-1">{title}</h1>
                    {subtitle && <p className="mt-4 text-base font-medium leading-6 text-n-1">{subtitle}</p>}
                </div>
            </div>
            {cta && (
                <div className={`${COLUMN} pt-6`}>
                    <Link
                        href={ctaHref}
                        className={buttonClassName({ shadowSize: '4', className: 'justify-center text-h6' })}
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
}: {
    text: string
    href?: string
    title?: string
    body?: string
}) {
    return (
        <section className={`${COLUMN} my-10`}>
            <div className="rounded-sm border border-n-1 bg-white p-5">
                {title && <h2 className="text-h5">{title}</h2>}
                {body && <p className="mt-2 text-sm leading-5 text-grey-1">{body}</p>}
                <Link
                    href={href}
                    className={buttonClassName({ shadowSize: '4', className: 'mt-4 justify-center text-h6' })}
                >
                    {text}
                </Link>
            </div>
        </section>
    )
}

export function Steps({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <section className={`${COLUMN} my-10`}>
            {title && <h2 className="text-h5">{title}</h2>}
            <ol className="mt-4 flex flex-col gap-3">{children}</ol>
        </section>
    )
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
    return (
        <li className="rounded-sm border border-n-1 bg-white p-4">
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
        <section className={`${COLUMN} my-10`}>
            <h2 className="text-h5">{title}</h2>
            <dl className="mt-4 flex flex-col gap-3">{children}</dl>
        </section>
    )
}

export function FAQItem({ question, children }: { question: string; children: ReactNode }) {
    return (
        <div className="rounded-sm border border-n-1 bg-white p-4">
            <dt className="text-h7">{question}</dt>
            <dd className="mt-2 text-sm leading-5 text-grey-1">{children}</dd>
        </div>
    )
}

export function Callout({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <aside className={`${COLUMN} my-8`}>
            <div className="rounded-sm border border-n-1 bg-primary-3 p-4">
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
        <figure className={`${COLUMN} my-8`}>
            <blockquote className="border-l-2 border-n-1 pl-3 text-sm italic leading-5 text-n-1">{children}</blockquote>
            <figcaption className="mt-2 pl-3 text-h9 uppercase tracking-wide text-grey-1">{source}</figcaption>
        </figure>
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
            {persona && <LandingPersona persona={persona} size={CAST_SIZES[size]} />}
            {caption && <figcaption className="flex-1 text-sm leading-5 text-grey-1">{caption}</figcaption>}
        </figure>
    )
}

export function Checklist({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <section className={`${COLUMN} my-10`}>
            {title && <h2 className="text-h5">{title}</h2>}
            <ul className="mt-4 flex flex-col gap-3">{children}</ul>
        </section>
    )
}

export function ChecklistItem({ title, children }: { title: string; children: ReactNode }) {
    return (
        <li className="flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4">
            <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1 bg-green-1"
            >
                <Icon name="check" size={14} className="text-n-1" />
            </span>
            <span className="flex-1">
                <span className="block text-h7">{title}</span>
                <span className="mt-1 block text-sm leading-5 text-grey-1">{children}</span>
            </span>
        </li>
    )
}

export function RelatedPages({ title = 'Keep reading', children }: { title?: string; children: ReactNode }) {
    return (
        <nav className={`${COLUMN} my-10`} aria-label={title}>
            <h2 className="text-h5">{title}</h2>
            <ul className="mt-4 flex flex-col gap-px overflow-hidden rounded-sm border border-n-1 [&>li:first-child>a]:rounded-t-sm [&>li:last-child>a]:rounded-b-sm">
                {children}
            </ul>
        </nav>
    )
}

export function RelatedLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <li>
            <Link
                href={href}
                data-focus-contained
                className="flex min-h-11 items-center gap-2 bg-white px-4 py-3 hover:bg-grey-3"
            >
                <span className="flex-1 text-sm font-medium text-n-1">{children}</span>
                <Icon name="arrow-right" size={16} className="shrink-0 text-grey-1" />
            </Link>
        </li>
    )
}
