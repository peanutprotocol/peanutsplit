import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import type { Locale } from '@/i18n/locales'
import {
    Callout,
    Cast,
    Checklist,
    ChecklistItem,
    CTA,
    FAQ,
    FAQItem,
    Hero,
    Quote,
    RelatedLink,
    RelatedPages,
    Step,
    Steps,
} from './blocks'

/**
 * What markdown can reach. Custom blocks plus prose overrides — Split has no `prose` plugin, so
 * every element an article can emit is styled here explicitly. Two consequences worth knowing:
 * an element missing from this map renders unstyled, and the column padding lives on each
 * element rather than a wrapper, so full-bleed blocks (Hero) can break out of the column.
 */
const COLUMN = 'mx-auto w-full max-w-xl px-5'

/** Internal links get next/link for client-side nav; external ones stay plain anchors. */
function ProseLink({ href = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
    const className = 'text-n-1 underline decoration-n-1/40 underline-offset-2 hover:decoration-n-1'
    if (/^https?:\/\//.test(href) || href.startsWith('mailto:')) {
        return <a href={href} className={className} rel="nofollow noopener noreferrer" {...props} />
    }
    return <Link href={href} className={className} {...props} />
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mdxComponents: Record<string, React.ComponentType<any>> = {
    Hero,
    CTA,
    Steps,
    Step,
    FAQ,
    FAQItem,
    Callout,
    Quote,
    Cast,
    Checklist,
    ChecklistItem,
    RelatedPages,
    RelatedLink,

    // A page with a `<Hero>` gets its h1 from the hero. A capture page has no hero by stylebook, so
    // its h1 is a markdown `#` — same typography as the hero's, inside the column instead of a band.
    h1: (props: HTMLAttributes<HTMLHeadingElement>) => (
        <h1 className={`${COLUMN} mb-5 mt-10 text-h3 leading-tight text-n-1`} {...props} />
    ),
    h2: (props: HTMLAttributes<HTMLHeadingElement>) => (
        <h2 className={`${COLUMN} mb-3 mt-12 text-h5 text-n-1`} {...props} />
    ),
    h3: (props: HTMLAttributes<HTMLHeadingElement>) => (
        <h3 className={`${COLUMN} mb-2 mt-8 text-h6 text-n-1`} {...props} />
    ),
    p: (props: HTMLAttributes<HTMLParagraphElement>) => (
        <p className={`${COLUMN} mb-5 text-base leading-7 text-grey-1`} {...props} />
    ),
    a: ProseLink,
    ul: (props: HTMLAttributes<HTMLUListElement>) => (
        <ul className={`${COLUMN} mb-5 list-disc space-y-2 pl-10`} {...props} />
    ),
    ol: (props: HTMLAttributes<HTMLOListElement>) => (
        <ol className={`${COLUMN} mb-5 list-decimal space-y-2 pl-10`} {...props} />
    ),
    li: (props: HTMLAttributes<HTMLLIElement>) => <li className="text-base leading-7 text-grey-1" {...props} />,
    strong: (props: HTMLAttributes<HTMLElement>) => <strong className="font-bold text-n-1" {...props} />,
    // Inherits colour on purpose: emphasis is the citation line under a quote, and it sits inside
    // both `p` (grey) and `blockquote` (near-black) without wanting to override either.
    em: (props: HTMLAttributes<HTMLElement>) => <em className="italic" {...props} />,
    blockquote: (props: HTMLAttributes<HTMLQuoteElement>) => (
        <blockquote
            className={`${COLUMN} mb-5 border-l-2 border-n-1 pl-3 text-base italic leading-7 text-n-1`}
            {...props}
        />
    ),
    hr: () => (
        <div className={`${COLUMN} my-10`}>
            <hr className="border-t border-n-1" />
        </div>
    ),
    // GFM tables scroll inside their own box — the column is 36rem and a comparison table is not.
    // `min-w-[32rem]` is what makes that true rather than decorative: without it `w-full` shrinks
    // a four-column table to the 335px a 375px phone leaves, and every cell wraps to one word per
    // line. 32rem is under the column's inner width, so the scrollbar appears on a phone and never
    // on a desktop, and the page itself never scrolls sideways.
    table: (props: HTMLAttributes<HTMLTableElement>) => (
        <div className={`${COLUMN} my-8`}>
            <div className="overflow-x-auto rounded-sm border border-n-1 bg-white">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm" {...props} />
            </div>
        </div>
    ),
    th: (props: HTMLAttributes<HTMLTableCellElement>) => (
        <th className="border-b border-n-1 px-4 py-3 text-h9 uppercase tracking-wide text-n-1" {...props} />
    ),
    td: (props: HTMLAttributes<HTMLTableCellElement>) => (
        <td className="border-b border-grey-2 px-4 py-3 align-top leading-5 text-grey-1" {...props} />
    ),
}

const BLOCK_LABELS: Record<Locale, { faq: string; related: string }> = {
    en: { faq: 'Questions', related: 'Keep reading' },
    'es-419': { faq: 'Preguntas', related: 'Sigue leyendo' },
    'pt-br': { faq: 'Perguntas', related: 'Continue lendo' },
}

/**
 * Bind defaults to the document locale before MDX is compiled.
 *
 * A translated file may still pass an explicit title, but omitting one can no longer drop an
 * English heading into the middle of a Spanish or Portuguese article. The locale comes from the
 * file being rendered, not from a cookie, so a build produces the same page every time.
 */
export function localizedMdxComponents(locale: Locale): Record<string, React.ComponentType<any>> {
    const labels = BLOCK_LABELS[locale]
    return {
        ...mdxComponents,
        FAQ: ({ title, children }: { title?: string; children: ReactNode }) => (
            <FAQ title={title ?? labels.faq}>{children}</FAQ>
        ),
        RelatedPages: ({ title, children }: { title?: string; children: ReactNode }) => (
            <RelatedPages title={title ?? labels.related}>{children}</RelatedPages>
        ),
    }
}
