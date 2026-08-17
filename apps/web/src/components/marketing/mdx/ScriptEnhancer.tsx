'use client'

import { useState, type ReactNode } from 'react'
import { Island } from '@/components/marketing/Island'
import { copyText } from '@/lib/clipboard'
import { parseAmountToMinor } from '@/lib/money'
import { Working } from './Working'

/** The first currency-shaped token in the message — "€12", "12.50 EUR", "$8" — reused as both the
 *  displayed figure and the editable field's starting value. */
const AMOUNT = /[€$£]\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:EUR|USD|GBP)/i

/** The three currencies `AMOUNT` can match, by symbol. Nothing else reaches this function. */
const CURRENCY_BY_SYMBOL: Record<string, string> = { '€': 'EUR', $: 'USD', '£': 'GBP' }

/** Which of the three currencies a matched amount is in, or null once editing has removed every
 *  symbol/code trace of one — the confirmation row below just disappears in that case. */
export function currencyOf(matched: string): string | null {
    const symbol = matched.match(/[€$£]/)?.[0]
    if (symbol) return CURRENCY_BY_SYMBOL[symbol]
    return matched.match(/EUR|USD|GBP/i)?.[0].toUpperCase() ?? null
}

export function EditableScript({ text }: { text: string }) {
    const match = text.match(AMOUNT)?.[0] ?? ''
    const [amount, setAmount] = useState(match)
    const [copied, setCopied] = useState(false)
    const rest = match ? text.replace(match, '').trim() : text
    const toCopy = match ? `${rest} ${amount}`.trim() : text

    // "€X each" (fun-engine.md S4): the same figure the reader is editing, run back through the
    // app's one money formatter — via `Working`, fun-engine.md S4's shared derivation primitive —
    // so a half-typed amount is confirmed in the format it will actually copy as.
    const currency = currencyOf(amount)
    // 2 decimals for all three: EUR/USD/GBP are the only currencies `currencyOf` ever returns, and
    // the catalog gives each of them 2 (currency-catalog.ts).
    const amountMinor = currency ? parseAmountToMinor(amount.replace(/[^\d.,]/g, ''), 2, 'en') : null

    return (
        <div className="border-t border-dashed border-n-1 pt-3 text-sm italic leading-5 text-n-1">
            <p>
                {rest}
                {match && (
                    <>
                        {' '}
                        <input
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            aria-label="Amount"
                            className="w-24 border-b border-n-1 bg-transparent not-italic tabular-nums"
                        />
                    </>
                )}
            </p>
            {currency && amountMinor !== null && (
                <div className="not-italic">
                    <Working workings={[{ label: 'Each', amountMinor: Number(amountMinor) }]} currency={currency} />
                </div>
            )}
            <button
                type="button"
                onClick={async () => setCopied(await copyText(toCopy))}
                className="mt-2 text-xs font-medium not-italic underline underline-offset-2"
            >
                {copied ? 'Copied' : 'Copy'}
            </button>
        </div>
    )
}

/**
 * The `'use client'` half of `<Script>` (fun-engine.md S4). `Island`'s `render` prop is a function
 * and cannot cross the Server-to-Client boundary, so it is built here rather than in `Script.tsx` —
 * only `text` and `children` (the server-rendered fallback) cross, and both are legal to pass.
 */
export function ScriptEnhancer({ text, children }: { text: string; children: ReactNode }) {
    return (
        <Island trigger="tap" render={() => <EditableScript text={text} />}>
            {children}
        </Island>
    )
}
