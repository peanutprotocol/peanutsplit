'use client'

import { useState, type ReactNode } from 'react'
import { Island } from '@/components/marketing/Island'
import { copyText } from '@/lib/clipboard'

/** The first currency-shaped token in the message — "€12", "12.50 EUR", "$8" — reused as both the
 *  displayed figure and the editable field's starting value. */
const AMOUNT = /[€$£]\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:EUR|USD|GBP)/i

function EditableScript({ text }: { text: string }) {
    const match = text.match(AMOUNT)?.[0] ?? ''
    const [amount, setAmount] = useState(match)
    const [copied, setCopied] = useState(false)
    const rest = match ? text.replace(match, '').trim() : text
    const toCopy = match ? `${rest} ${amount}`.trim() : text

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
 * The `'use client'` half of `<Script>` (fun-engine.md S4): everything that needs interactivity —
 * `Island`'s `render` closure, the editable amount, the copy button — lives in this one module so
 * no function has to cross the Server-to-Client Component boundary. `text` and `children` (the
 * server-rendered fallback) are the only things `Script.tsx` hands across it, and both are legal:
 * a string is serialisable, and a Server Component's rendered output is a normal `children` slot.
 */
export function ScriptEnhancer({ text, children }: { text: string; children: ReactNode }) {
    return (
        <Island trigger="tap" render={() => <EditableScript text={text} />}>
            {children}
        </Island>
    )
}
