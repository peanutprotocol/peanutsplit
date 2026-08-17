import type { Locale } from '@/i18n/locales'
import type { Faq } from '@/lib/content'

const COLUMN = 'mx-auto w-full max-w-xl px-5'

/** Copied from `BLOCK_LABELS.faq` in `components.tsx`, not new copy (Invariants #6) — not
 *  imported from there to avoid a circular import (`components.tsx` imports this module). */
const JUMP_LABEL: Record<Locale, string> = { en: 'Questions', 'es-419': 'Preguntas', 'pt-br': 'Perguntas' }

/**
 * The flat 2-line answer under an article's <h1> (fun-engine.md S4): the page's own first
 * frontmatter FAQ, engine-placed rather than authored (Invariants #6). Renders nothing when the
 * page declares no FAQ. `faq` arrives as an ordinary prop rather than React Context — `createContext`
 * is unavailable to a Server Component — bound by closure in `localizedMdxComponents` instead.
 */
export function ShortVersionSlot({ faq, locale }: { faq?: Faq; locale: Locale }) {
    if (!faq) return null
    return (
        <div className={`${COLUMN} mt-6`}>
            <p className="split-short-version rounded-sm border border-l-4 border-n-1 border-l-primary-1 bg-white p-4 text-sm leading-5 text-grey-1">
                <span className="line-clamp-2">{faq.answer}</span>{' '}
                <a href="#questions" className="whitespace-nowrap font-medium text-n-1 underline underline-offset-2">
                    {JUMP_LABEL[locale]}
                </a>
            </p>
        </div>
    )
}
