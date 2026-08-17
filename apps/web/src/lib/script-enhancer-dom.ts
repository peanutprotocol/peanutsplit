'use client'

/**
 * Plain-DOM behavior for every `<Script>` block on the page (fun-engine.md S4, Invariants #3): a
 * copy-to-clipboard button and a live per-person recompute, wired onto the server-rendered markup
 * via `data-script-*` attributes. No React component, no `next/dynamic` — this is imported and
 * called by `ContentAnalytics`, the one client chunk every content route already loads, so
 * `Script.tsx` itself never gains a `'use client'` chain of its own. The directive here is
 * otherwise redundant (it is only ever reached from an already-`'use client'` file) — it stays so
 * `js-budget.test.ts`'s walk counts this module honestly rather than shipping invisibly the way
 * the deleted `next/dynamic` boundary did (fun-engine.md Invariants #3).
 */

import { copyText } from './clipboard'
import { formatMoney, parseAmountToMinor } from './money'
import { currencyOf } from './script-message'

/** Wires one `[data-script-block]` root: the copy button always, the live "€X each" recompute
 *  only when the block shipped an editable amount (`[data-script-amount]`). */
export function enhanceScriptBlock(block: Element): void {
    const input = block.querySelector<HTMLInputElement>('[data-script-amount]')
    const copyButton = block.querySelector<HTMLButtonElement>('[data-script-copy]')
    const each = block.querySelector<HTMLElement>('[data-script-each]')
    const valueCell = each?.querySelector<HTMLElement>('.tabular-nums') ?? null
    const rest = block.getAttribute('data-script-rest') ?? ''

    if (copyButton) {
        const idleLabel = copyButton.textContent ?? 'Copy'
        copyButton.addEventListener('click', () => {
            const toCopy = input ? `${rest} ${input.value}`.trim() : rest
            void copyText(toCopy).then((copied) => {
                copyButton.textContent = copied ? 'Copied' : idleLabel
            })
        })
    }

    if (input && each && valueCell) {
        input.addEventListener('input', () => {
            const currency = currencyOf(input.value)
            const amountMinor = currency ? parseAmountToMinor(input.value.replace(/[^\d.,]/g, ''), 2, 'en') : null
            const confirmed = currency !== null && amountMinor !== null
            each.hidden = !confirmed
            if (confirmed) valueCell.textContent = formatMoney(amountMinor, currency)
        })
    }
}

/** Runs `enhanceScriptBlock` on every `[data-script-block]` found under `root`. */
export function enhanceScriptBlocks(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-script-block]').forEach(enhanceScriptBlock)
}
