'use client'

/**
 * Plain-DOM behavior for every `<Share>` block on the page (SEO loop B, Invariants #3): one button
 * that opens the platform share sheet where there is one and copies the link where there is not.
 * No React component, no `next/dynamic` — this is imported and called by `ContentAnalytics`, the
 * one client chunk every content route already loads, so `Share.tsx` stays a pure Server Component.
 * The `'use client'` directive is otherwise redundant (nothing reaches this module except an
 * already-client file); it stays so `js-budget.test.ts`'s walk counts it rather than it shipping
 * invisibly, the same call `script-enhancer-dom.ts` and `calc-enhancer-dom.ts` make.
 *
 * It writes no words. The only string it ever puts in the DOM is `data-share-done`, which is the
 * authored `doneLabel` prop travelling as an attribute — so "every reader-visible word arrives as
 * an authored MDX string" survives the click.
 */

import { copyText } from './clipboard'

/** Wires one `[data-share-block]` root. A block missing its URL, its done label or its button is
 *  left inert rather than half-wired — a decoration must never throw. */
export function enhanceShareBlock(block: Element): void {
    const url = block.getAttribute('data-share-url') ?? ''
    const doneLabel = block.getAttribute('data-share-done') ?? ''
    const button = block.querySelector<HTMLButtonElement>('[data-share-button]')
    if (url === '' || doneLabel === '' || !button) return

    const idleLabel = button.textContent ?? doneLabel
    button.addEventListener('click', () => {
        // The share sheet is the better outcome and the one with no feedback to give: the OS owns
        // the UI from here, and a label swapped to "Copied" over a sheet the reader then cancelled
        // would be a lie. So a dismissal — `AbortError`, the reader's own decision — stays silent.
        // Any other rejection is a browser that advertises `share` and then refuses the payload,
        // which leaves the reader holding nothing; fall through to the copy this button would have
        // made had there been no sheet at all.
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            void Promise.resolve(navigator.share({ url })).catch((error: unknown) => {
                if ((error as { name?: string } | null)?.name === 'AbortError') return
                return copyText(url).then((copied) => {
                    button.textContent = copied ? doneLabel : idleLabel
                })
            })
            return
        }
        // Script.tsx's copy button, exactly: the label admits failure rather than claiming a copy
        // the clipboard refused (see `copyText`'s own docstring on why it answers with a boolean).
        void copyText(url).then((copied) => {
            button.textContent = copied ? doneLabel : idleLabel
        })
    })
}

/** Runs `enhanceShareBlock` on every `[data-share-block]` found under `root`. */
export function enhanceShareBlocks(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-share-block]').forEach(enhanceShareBlock)
}
