import { isValidElement, type ReactNode } from 'react'
import { parseAmountToMinor } from '@/lib/money'
import { currencyOf, splitScriptMessage } from '@/lib/script-message'
import { Working } from './Working'

const COLUMN = 'mx-auto w-full max-w-xl px-5'

/** Plain-text join of a children tree — for the amount match and the copy fallback, both of which
 *  need a string, not a React tree. */
function textOf(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textOf).join('')
    if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
    return ''
}

/**
 * A message-shaped blockquote — "Hey, you owe me €12 for pizza" — with a copy button and an
 * editable amount (fun-engine.md S4). Native-only (see `components.tsx`): not in mdx-policy.ts's
 * COMPONENT_ATTRIBUTES, so a generated guide cannot author one.
 *
 * A pure Server Component: the blockquote, the amount `<input>`, the "€X each" row (via
 * `<Working>`), and the copy `<button>` are ALL server HTML — the full static answer, carrying
 * `data-script-*` attributes at the exact size the enhanced state uses, so `script-enhancer-dom.ts`
 * only has to attach listeners once `ContentAnalytics` mounts, never swap markup in (Invariants #3:
 * block-specific client components are forbidden in `mdxComponents`, so `Script` itself never has
 * a `'use client'` chain of its own).
 */
export function Script({ children, source }: { children: ReactNode; source: string }) {
    const text = textOf(children).trim()
    const { rest, amount } = splitScriptMessage(text)
    const currency = amount ? currencyOf(amount) : null
    const amountMinor = currency ? parseAmountToMinor(amount.replace(/[^\d.,]/g, ''), 2, 'en') : null

    return (
        <figure className={`${COLUMN} my-8`} data-script-block data-script-rest={rest}>
            <blockquote className="border-t border-dashed border-n-1 pt-3 text-sm italic leading-5 text-n-1">
                {amount ? (
                    <>
                        {rest}{' '}
                        <input
                            defaultValue={amount}
                            aria-label="Amount"
                            data-script-amount
                            className="w-24 border-b border-n-1 bg-transparent not-italic tabular-nums"
                        />
                    </>
                ) : (
                    children
                )}
            </blockquote>
            {currency && amountMinor !== null && (
                <div className="mt-2 not-italic" data-script-each>
                    <Working workings={[{ label: 'Each', amountMinor: Number(amountMinor) }]} currency={currency} />
                </div>
            )}
            <button
                type="button"
                data-script-copy
                className="mt-2 text-xs font-medium not-italic underline underline-offset-2"
            >
                Copy
            </button>
            <figcaption className="mt-2 text-h9 uppercase tabular-nums tracking-wide text-grey-1">{source}</figcaption>
        </figure>
    )
}
