'use client'

/**
 * Plain-DOM behavior for every `<Calc>` block on the page (Wave 2 / S4, Invariants #3): clicking a
 * shortcut chip repoints the whole block at that preset. No React component, no `next/dynamic` —
 * this is imported and called by `ContentAnalytics`, the one client chunk every content route
 * already loads, so `Calc.tsx` itself stays a pure Server Component. The directive here is
 * otherwise redundant (nothing reaches it except an already-`'use client'` file); it stays so
 * `js-budget.test.ts`'s walk counts this module honestly rather than it shipping invisibly, the
 * same call `script-enhancer-dom.ts` makes.
 *
 * It writes no words. Every string it puts in the DOM is `formatMoney` output or a digit, so the
 * "every word arrives as an authored prop" rule `Calc.tsx` holds on the server survives the click.
 * `[data-calc-row='foot']` is deliberately left alone: its value is authored copy, not arithmetic.
 */

import { formatMoney } from './money'

/** `data-calc-presets`, or `null` if it is missing or not the label→minor-units object `Calc`
 *  serialises. Never throws: a decoration must not take the page down. */
function parsePresets(raw: string | null): Record<string, number> | null {
    if (!raw) return null
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return null
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const presets: Record<string, number> = {}
    for (const [label, minor] of Object.entries(parsed as Record<string, unknown>)) {
        if (!Number.isSafeInteger(minor)) return null
        presets[label] = minor as number
    }
    return presets
}

/**
 * Wires one `[data-calc-block]` root.
 *
 * A click repaints every money node in the block from `data-calc-presets` — including the chips'
 * own amounts, which do not change — so what the reader sees always comes from one parsed set of
 * minor units rather than from server text that could drift out of step with it.
 *
 * The share rounds the same way `Calc.tsx` does on the server; the two copies of that one
 * expression are held together by their tests and stated to the reader by the `note` prop.
 */
export function enhanceCalcBlock(block: Element): void {
    const presets = parsePresets(block.getAttribute('data-calc-presets'))
    const currency = block.getAttribute('data-calc-currency') ?? ''
    const people = Number(block.getAttribute('data-calc-people'))
    if (!presets || currency === '' || !Number.isInteger(people) || people <= 0) return

    const chips = Array.from(block.querySelectorAll<HTMLElement>('[data-calc-preset]'))
    const each = block.querySelector<HTMLElement>('[data-calc-each]')
    const valueCell = (row: string) =>
        block.querySelector<HTMLElement>(`[data-calc-row='${row}']`)?.querySelector<HTMLElement>('.tabular-nums') ??
        null

    for (const chip of chips) {
        chip.addEventListener('click', () => {
            const totalMinor = presets[chip.getAttribute('data-calc-preset') ?? '']
            if (totalMinor === undefined) return
            const shareMinor = Math.round(totalMinor / people)

            for (const other of chips) {
                other.setAttribute('aria-pressed', String(other === chip))
                const amount = other.querySelector<HTMLElement>('.split-calc-chip-amount')
                const otherMinor = presets[other.getAttribute('data-calc-preset') ?? '']
                if (amount && otherMinor !== undefined) amount.textContent = formatMoney(String(otherMinor), currency)
            }

            if (each) each.textContent = formatMoney(String(shareMinor), currency)
            const total = valueCell('total')
            if (total) total.textContent = formatMoney(String(totalMinor), currency)
            const headcount = valueCell('people')
            if (headcount) headcount.textContent = String(people)
            const share = valueCell('share')
            if (share) share.textContent = formatMoney(String(shareMinor), currency)
        })
    }
}

/** Runs `enhanceCalcBlock` on every `[data-calc-block]` found under `root`. */
export function enhanceCalcBlocks(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-calc-block]').forEach(enhanceCalcBlock)
}
