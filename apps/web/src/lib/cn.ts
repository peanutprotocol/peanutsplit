import { extendTailwindMerge } from 'tailwind-merge'

/**
 * `twMerge` with the display type scale taught to it.
 *
 * Out of the box tailwind-merge only knows Tailwind's stock font sizes, so it
 * files our custom `text-h1…text-h10` under *text colour* — which means
 * `twMerge('text-h10 uppercase', 'text-n-1')` silently deletes the size and the
 * label renders at whatever the parent inherits. That is exactly what was
 * happening to the balance-card tone labels ("OWES" at 16px instead of 10px)
 * and the split-mode toggle.
 *
 * Use `cn` anywhere a `text-h*` class can meet a `text-<colour>` class.
 */
export const cn = extendTailwindMerge({
    classGroups: {
        'font-size': [{ text: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'] }],
    },
})
