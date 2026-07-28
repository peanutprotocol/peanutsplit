'use client'

import { Doodle } from '@/components/ui/Doodle'
import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { currencyDoodle } from '@/lib/currency-doodle'
import { currencyInfo } from '@/lib/money'

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
 * Every supported sign is drawn (see `currency-doodle.ts`), including the baht,
 * so the picker never falls into a second visual language halfway down its list.
 *
 * The sign yields first when space runs out — it is the decoration, the code is the fact. Losing
 * "THB" to an ellipsis inside a narrow picker is the bug that ordering prevents.
 */
export function CurrencyTag({ code, catalog, className }: CurrencyTagProps) {
    const info = currencyInfo(code, catalog)
    const drawn = currencyDoodle(info.code)

    return (
        <span className={cn('flex min-w-0 items-center gap-1.5 text-h8', className)}>
            {drawn ? (
                <Doodle name={drawn} size={16} weight={2.4} className="text-grey-1" />
            ) : (
                <Doodle name="question" size={16} weight={2.4} className="text-grey-1" />
            )}
            <span className="shrink-0">{info.code}</span>
        </span>
    )
}
