import type { CurrencyInfo } from '@/lib/api-types'
import { formatMoney } from '@/lib/money'
import type { ToolWorking } from '@/tools/types'

/**
 * The labelled-lines derivation strip behind a computed answer (fun-engine.md S4): one row per
 * `ToolWorking`, tabular-nums, the rounding sentence underneath. A presentational extraction —
 * `ToolCalculator.tsx` already renders this exact shape inline for the two live calculators — so a
 * Wave 2 `<Calc>` block and `<Script>`'s "€X each" line have one place to reuse rather than a
 * second copy each. No consumer wires it in this stage.
 *
 * A server component, and the STATIC `formatMoney` (`@/lib/money.ts`) rather than the animated
 * `<Money>`/`<AnimatedMoney>` (`@/components/room/Money.tsx`, which pulls in NumberFlow): nothing
 * here is live state to count up from, and a server component can never re-render to animate
 * anyway. Pulling the client formatter in would cost `CONTENT_JS_BUDGET`
 * (`js-budget.test.ts`) for zero benefit.
 */
export function Working({
    workings,
    roundingNote,
    currency,
    catalog,
}: {
    workings: readonly ToolWorking[]
    roundingNote: string
    currency: string
    catalog?: readonly CurrencyInfo[]
}) {
    return (
        <div className="flex flex-col gap-1 text-xs text-grey-1">
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
            <p className="pt-2 leading-4">{roundingNote}</p>
        </div>
    )
}
