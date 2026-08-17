import type { Locale } from '@/i18n/locales'
import type { Faq } from '@/lib/content'

const COLUMN = 'mx-auto w-full max-w-xl px-5'

/**
 * "Questions", the FAQ section heading, in the three shipped locales — copied from
 * `BLOCK_LABELS.faq` in `components.tsx`, not new copy (fun-engine.md Invariants #6). Not
 * imported from there: `components.tsx` imports this module for its `h1` override, and the
 * reverse import would be circular.
 */
const JUMP_LABEL: Record<Locale, string> = { en: 'Questions', 'es-419': 'Preguntas', 'pt-br': 'Perguntas' }

/**
 * The flat 2-line answer under an article's <h1> (fun-engine.md S4). Engine-placed, not authored:
 * `faq` is the page's own first frontmatter FAQ, so a translated article gets a translated summary
 * for free and there is nothing new to write (Invariants #6). Renders nothing when the page
 * declares no FAQ — most pages, and every page rendered outside `localizedMdxComponents`' native
 * content path (guides pass no faq this wave; see `GuideLayout`/`components.tsx`).
 *
 * `faq` arrives as an ordinary prop, not through React Context: `createContext` is unavailable to
 * a Server Component under Next's `react-server` module condition (it is not part of that
 * condition's export list, unlike `use`/`useId`/`useMemo`), so a Provider set up in one Server
 * Component cannot reach a `useContext` call in another. `h1`/`Hero` are bound to this page's FAQ
 * by closure instead, in `localizedMdxComponents` — the same mechanism that already binds them to
 * the page's locale.
 */
export function ShortVersionSlot({ faq, locale }: { faq?: Faq; locale: Locale }) {
    if (!faq) return null
    return (
        <p className={`${COLUMN} -mt-3 mb-6 text-sm leading-5 text-grey-1`}>
            <span className="line-clamp-2">{faq.answer}</span>{' '}
            <a href="#questions" className="whitespace-nowrap font-medium text-n-1 underline underline-offset-2">
                {JUMP_LABEL[locale]}
            </a>
        </p>
    )
}
