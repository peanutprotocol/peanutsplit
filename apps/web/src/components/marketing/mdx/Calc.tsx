import { decimalsOf, formatMoney, isCatalogCode, parseAmountToMinor } from '@/lib/money'

const COLUMN = 'mx-auto w-full max-w-xl px-5'

/** One parsed shortcut: the authored label and its amount in minor units. */
interface CalcPreset {
    label: string
    minor: number
}

/**
 * `"Weekend=920|Week=1846|Blowout=3210"` → minor units, or `null` if any entry is malformed.
 *
 * All-or-nothing on purpose: a half-parsed chip row would ship a calculator whose shortcuts
 * silently disagree with the copy around it. `parseAmountToMinor` is called without a locale, the
 * same way batch callers do — the prop is authored source, not something a reader typed.
 */
function parsePresets(presets: string, decimals: number): CalcPreset[] | null {
    const entries = presets.split('|').filter((entry) => entry.length > 0)
    if (entries.length === 0) return null

    const parsed: CalcPreset[] = []
    const seen = new Set<string>()
    for (const entry of entries) {
        const separator = entry.indexOf('=')
        if (separator <= 0) return null
        const label = entry.slice(0, separator).trim()
        const minor = parseAmountToMinor(entry.slice(separator + 1).trim(), decimals)
        if (label.length === 0 || minor === null) return null
        // A repeated label would press two chips at once and collapse to one key in
        // `data-calc-presets` — the server and the enhancer would disagree about which one exists.
        if (seen.has(label)) return null
        seen.add(label)
        const value = Number(minor)
        if (!Number.isSafeInteger(value) || value <= 0) return null
        parsed.push({ label, minor: value })
    }
    return parsed
}

/**
 * The share of one preset, rounded to the smallest unit.
 *
 * `calc-enhancer-dom.ts` repeats this one expression rather than importing it: that module is
 * `'use client'`, and a Server Component importing from one gets a client reference it cannot
 * call during the render pass. The two copies are held together by `Calc.test.tsx` and
 * `calc-enhancer-dom.test.ts` asserting the same numbers, and by the authored `note` prop, which
 * is where the rounding rule is stated to the reader.
 */
function shareMinor(totalMinor: number, people: number): number {
    return Math.round(totalMinor / people)
}

/**
 * An inline "what does this cost each" block — the one place a marketing page does arithmetic in
 * front of the reader (Wave 2 / S4). Native-only, like `Script` beside it in `components.tsx`:
 * absent from mdx-policy.ts's COMPONENT_ATTRIBUTES, so a generated guide cannot author one.
 *
 * A pure Server Component in `Script.tsx`'s mould: the chips, the headline amount and all four
 * working rows are server HTML with the DEFAULT preset already computed, carrying `data-calc-*`
 * attributes at the exact size the enhanced state uses. `calc-enhancer-dom.ts` therefore only ever
 * attaches listeners and rewrites text — it never swaps markup in, and a reader with no JS still
 * gets the whole answer (Invariants #3).
 *
 * **Every word on screen arrives as an authored prop.** The component contributes formatted money
 * and digits and nothing else — which is why the chip's label and amount are two `<span>`s rather
 * than one `"Weekend · €920.00"` string: that `·` would be a glyph the component authored. A
 * separator, if one is ever wanted, is a `::before` on `.split-calc-chip-amount` in globals.css —
 * paint, never HTML. `Calc.test.tsx` gates this mechanically.
 *
 * Props are strings throughout. `compileMDX` would happily hand us `people={4}` as a number, so
 * this is not something the engine enforces — it is the corpus grammar mdx-policy.ts holds
 * generated guides to, kept by hand here so both corpora read the same. The flip side is that the
 * component validates its own inputs: a malformed prop renders an inert block (no `data-calc-block`,
 * so the enhancer skips it) rather than throwing a 500 over a decoration.
 *
 * It renders its own `<ul class="split-working">` instead of calling `<Working>`: that component
 * hard-codes its `<li>` with no attribute pass-through, and these rows have to carry
 * `data-calc-row`, which both the enhancer and globals.css's `[data-calc-row='total']` rule key
 * off. The shared visual treatment travels through the class, not the component.
 */
export function Calc({
    title,
    presets,
    preset,
    currency,
    people,
    eachLabel,
    totalLabel,
    peopleLabel,
    shareLabel,
    amountLabel,
    note,
    footLabel,
    footValue,
}: {
    title: string
    presets: string
    preset: string
    currency: string
    people: string
    eachLabel: string
    totalLabel: string
    peopleLabel: string
    shareLabel: string
    amountLabel: string
    note: string
    footLabel?: string
    footValue?: string
}) {
    const headcount = /^\d+$/.test(people) ? Number(people) : 0
    const parsed = isCatalogCode(currency) ? parsePresets(presets, decimalsOf(currency)) : null
    const active = parsed?.find((entry) => entry.label === preset) ?? parsed?.[0]

    if (!parsed || !active || headcount <= 0) {
        return (
            <section className={`${COLUMN} my-10`}>
                <figure className="split-calc rounded-sm border border-n-1 bg-white p-5">
                    <h2 className="split-block-title text-h5">{title}</h2>
                    <p className="split-calc-note mt-3 text-xs leading-4 text-grey-1">{note}</p>
                </figure>
            </section>
        )
    }

    const share = shareMinor(active.minor, headcount)
    const money = (minor: number) => formatMoney(String(minor), currency)

    return (
        <section className={`${COLUMN} my-10`}>
            <figure
                className="split-calc rounded-sm border border-n-1 bg-white p-5"
                data-calc-block
                data-calc-currency={currency}
                data-calc-people={headcount}
                data-calc-presets={JSON.stringify(Object.fromEntries(parsed.map((it) => [it.label, it.minor])))}
            >
                <h2 className="split-block-title text-h5">{title}</h2>
                <div className="split-calc-chips mt-3 flex flex-wrap gap-2">
                    {parsed.map((entry) => (
                        <button
                            key={entry.label}
                            type="button"
                            data-calc-preset={entry.label}
                            aria-pressed={entry.label === active.label}
                            className="flex items-center gap-2 rounded-sm border border-n-1 px-3 py-1 text-xs text-n-1"
                        >
                            <span className="split-calc-chip-label">{entry.label}</span>
                            <span className="split-calc-chip-amount tabular-nums">{money(entry.minor)}</span>
                        </button>
                    ))}
                </div>
                {/* The label is a visually-hidden span BEFORE the `<strong>`, not an `aria-label` on
                    it: `<strong>` maps to a generic role, and assistive tech ignores an aria-label
                    on a generic element, so the headline amount was announced as a bare number.
                    Inside the `<strong>` it would not survive either — the enhancer rewrites that
                    node's whole `textContent` on every chip click. */}
                <p className="split-calc-result mt-4 text-h6 text-n-1">
                    <span className="sr-only">{amountLabel}</span>
                    <strong data-calc-each>{money(share)}</strong> {eachLabel}
                </p>
                {/* Row order is a contract: globals.css rules the TOTAL off with
                    `[data-calc-row='total']` precisely so `foot` can sit last without being mistaken
                    for it, and the enhancer rewrites every row here except `foot`, whose value is
                    authored copy rather than a computed number. */}
                <ul className="split-working mt-4 flex flex-col gap-1 text-xs text-grey-1">
                    <li data-calc-row="total" className="flex justify-between gap-3">
                        <span>{totalLabel}</span>
                        <span className="tabular-nums">{money(active.minor)}</span>
                    </li>
                    <li data-calc-row="people" className="flex justify-between gap-3">
                        <span>{peopleLabel}</span>
                        <span className="tabular-nums">{headcount}</span>
                    </li>
                    <li data-calc-row="share" className="flex justify-between gap-3">
                        <span>{shareLabel}</span>
                        <span className="tabular-nums">{money(share)}</span>
                    </li>
                    {footLabel && footValue && (
                        <li data-calc-row="foot" className="flex justify-between gap-3">
                            <span>{footLabel}</span>
                            <span className="tabular-nums">{footValue}</span>
                        </li>
                    )}
                </ul>
                <p className="split-calc-note mt-3 text-xs leading-4 text-grey-1">{note}</p>
            </figure>
        </section>
    )
}
