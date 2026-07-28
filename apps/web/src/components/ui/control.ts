/**
 * Button heights, until `.btn-small` / `.btn-medium` can be corrected in
 * `tailwind.config.js`.
 *
 * Every declared button size is currently below the 44px tap floor — `small` is
 * h-8 (32px), `medium` h-9 (36px), `large` h-10 (40px) — which is why four call
 * sites had independently grown a hand-written `h-10` that also bypasses the
 * matching type size. These two tokens are the corrected scale, passed through
 * `className` so `twMerge` wins over the `btn-*` class.
 *
 * FOLD-IN: when tailwind.config.js is free, set `.btn-small` to
 * `h-11 px-4 text-sm font-bold` and `.btn-medium` to `h-12 px-4 text-sm
 * font-bold`, then delete this file and the `className` at each call site.
 */

/** 44px — the tap floor. The smallest button that should exist. */
export const BTN_SMALL = 'h-11 px-4 text-sm'

/** 48px — a secondary control sitting inside a row or a banner. */
export const BTN_MEDIUM = 'h-12 px-4 text-sm'
