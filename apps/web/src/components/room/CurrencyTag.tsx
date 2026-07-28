'use client'

import { Doodle } from '@/components/ui/Doodle'
import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { currencyDoodle } from '@/lib/currency-doodle'
import { currencyInfo, displaySymbol } from '@/lib/money'

interface CurrencyTagProps {
    code: string
    catalog?: readonly CurrencyInfo[]
    className?: string
}

/**
 * A currency, rendered as an object rather than a three-letter string: its sign, then its code.
 *
 * TWO ENCODINGS, NOT FOUR. This used to show a flag, a typographic symbol and the code —
 * `🇧🇷 R$ BRL` — three ways of saying one thing, in three visual languages, inside a 120px
 * trigger. The flag is gone. It was decorative by its own admission (`aria-hidden`, because
 * "flag: Brazil, R$, BRL" is noise to a screen reader), it cost width the code needed, and a
 * country is not a currency — the euro has twenty of them and the dollar sign has a dozen.
 *
 * The sign is drawn where a drawing exists (see `currency-doodle.ts`) and typographic where one
 * does not. That split is deliberate and permanent: a hand-drawn near-miss of a sign somebody
 * reads every day is worse than the real character.
 *
 * The sign yields first when space runs out — it is the decoration, the code is the fact. Losing
 * "THB" to an ellipsis inside a narrow picker is the bug that ordering prevents.
 */
export function CurrencyTag({ code, catalog, className }: CurrencyTagProps) {
    const info = currencyInfo(code, catalog)
    const drawn = currencyDoodle(info.code)
    const symbol = displaySymbol(info)

    return (
        <span className={cn('flex min-w-0 items-center gap-1.5 text-h8', className)}>
            {drawn ? (
                <Doodle name={drawn} size={16} weight={2.4} className="text-grey-1" />
            ) : (
                symbol && <span className="truncate text-grey-1">{symbol}</span>
            )}
            <span className="shrink-0">{info.code}</span>
        </span>
    )
}
