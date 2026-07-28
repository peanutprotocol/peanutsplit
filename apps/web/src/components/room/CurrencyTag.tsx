'use client'

import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { currencyFlag } from '@/lib/currency-hint'
import { currencyInfo, displaySymbol } from '@/lib/money'

interface CurrencyTagProps {
    code: string
    catalog?: readonly CurrencyInfo[]
    className?: string
}

/**
 * A currency, rendered as an object rather than a three-letter string: flag, symbol, code.
 *
 * The flag is decorative and `aria-hidden` — a screen reader announcing "flag: Brazil, R$, BRL"
 * is noise, and the code already says everything. It is also why flags live only in components
 * like this one and never reach the OG renderer: Satori has no flag glyphs in the bundled fonts,
 * so a flag there comes out as tofu.
 */
export function CurrencyTag({ code, catalog, className }: CurrencyTagProps) {
    const info = currencyInfo(code, catalog)
    const flag = currencyFlag(code)
    const symbol = displaySymbol(info)

    return (
        <span className={cn('flex min-w-0 items-center gap-1 text-h8', className)}>
            {flag && (
                <span aria-hidden className="shrink-0 text-sm leading-none">
                    {flag}
                </span>
            )}
            {/* The symbol yields first when space runs out — it is the decoration, the code is
                the fact. Losing "THB" to an ellipsis inside a 120px picker is the bug this
                ordering prevents. */}
            {symbol && <span className="truncate text-grey-1">{symbol}</span>}
            <span className="shrink-0">{info.code}</span>
        </span>
    )
}
