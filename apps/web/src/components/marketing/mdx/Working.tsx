import type { CurrencyInfo } from '@/lib/api-types'
import { formatMoney } from '@/lib/money'
import type { ToolWorking } from '@/tools/types'

/**
 * The labelled-lines derivation strip behind a computed answer (fun-engine.md S4): one row per
 * `ToolWorking`, tabular-nums, an optional rounding sentence underneath. `ToolCalculator.tsx`
 * renders this exact shape inline for the two live calculators; `Script.tsx` is the other
 * consumer, for a single confirmed-amount row with no rounding to explain, which is why
 * `roundingNote` is optional rather than required.
 *
 * A server component using the STATIC `formatMoney` (`@/lib/money.ts`), not the animated
 * `<Money>`/`<AnimatedMoney>` (which pulls in NumberFlow): nothing here is live state to count up
 * from, and pulling the client formatter in would cost `CONTENT_JS_BUDGET` for no benefit.
 */
export function Working({
    workings,
    roundingNote,
    currency,
    catalog,
}: {
    workings: readonly ToolWorking[]
    roundingNote?: string
    currency: string
    catalog?: readonly CurrencyInfo[]
}) {
    // `split-working` carries the skin's working-strip treatment (globals.css). A class rather
    // than a shared component because `ToolCalculator` inlines its own <ul> of the same shape;
    // the class is the one thing the two have in common.
    return (
        <div className="split-working flex flex-col gap-1 text-xs text-grey-1">
            <ul className="flex flex-col gap-1">
                {workings.map((working) => (
                    <li key={working.label} className="flex justify-between gap-3">
                        <span>{working.label}</span>
                        <span className="tabular-nums">
                            {working.amountMinor === undefined
                                ? working.value
                                : formatMoney(String(working.amountMinor), currency, catalog)}
                        </span>
                    </li>
                ))}
            </ul>
            {roundingNote && <p className="pt-2 leading-4">{roundingNote}</p>}
        </div>
    )
}
