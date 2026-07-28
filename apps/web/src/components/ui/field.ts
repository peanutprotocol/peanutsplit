/**
 * The one field size scale. Anything that looks like a form control — a text
 * input, the currency trigger, a select — takes its height and horizontal
 * padding from here and from nowhere else.
 *
 * It exists because the currency trigger used to carry `h-16 pl-4 pr-3` written
 * by hand, which agreed with neither `.input` (`px-5`) nor the amount field it
 * stands next to (`h-20 px-4`) — a 16px step and two different insets inside
 * what reads as a single control.
 */
export type FieldSize = 'sm' | 'md' | 'lg'

export const fieldSizes: Record<FieldSize, string> = {
    /** Compact — dense inline rows (per-person amounts, scan lines, the link box). 48px. */
    sm: 'h-12 px-3',
    /** Standard — the default for a labelled field. 64px. */
    md: 'h-16 px-5',
    /** Hero — the number the screen exists to collect, and whatever sits beside it. 80px. */
    lg: 'h-20 px-5',
}
