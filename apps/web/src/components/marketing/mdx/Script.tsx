import { isValidElement, type ReactNode } from 'react'
import { ScriptEnhancer } from './ScriptEnhancer'

const COLUMN = 'mx-auto w-full max-w-xl px-5'

/** Plain-text join of a children tree — for the copy button and the editable-amount parse, both
 *  of which need a string, not a React tree. */
function textOf(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textOf).join('')
    if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
    return ''
}

/**
 * A message-shaped blockquote — "Hey, you owe me €12 for pizza" — with a copy button and an
 * editable amount once the reader taps it (fun-engine.md S4). Native-only (see `components.tsx`):
 * not in mdx-policy.ts's COMPONENT_ATTRIBUTES, so a generated guide cannot author one.
 *
 * Server render = today's plain quote, in `<Quote>`'s own classes — the full static answer ships
 * before any JS runs (fun-engine.md Invariants #3). The copy-button/editable enhancement is an
 * `Island`, wrapped by the small `'use client'` `ScriptEnhancer` rather than built here: `Island`'s
 * `render` prop is a function, and a function cannot cross the Server-to-Client Component boundary
 * — it has to be constructed inside the same client module that calls `Island`, not passed in from
 * a Server Component. `text` (a plain string) and `children` (the server-rendered fallback) are
 * both legal to pass across that boundary, which is all this component sends.
 */
export function Script({ children, source }: { children: ReactNode; source: string }) {
    const text = textOf(children).trim()
    return (
        <figure className={`${COLUMN} my-8`}>
            <ScriptEnhancer text={text}>
                <blockquote className="border-t border-dashed border-n-1 pt-3 text-sm italic leading-5 text-n-1">
                    {children}
                </blockquote>
            </ScriptEnhancer>
            <figcaption className="mt-2 text-h9 uppercase tabular-nums tracking-wide text-grey-1">{source}</figcaption>
        </figure>
    )
}
