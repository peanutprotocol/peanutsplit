/**
 * Filling a phrase in.
 *
 * A `compute` function that concatenated its own sentences would be writing English into the
 * arithmetic, so it reaches for a phrase by key and fills the figures in. The placeholder is
 * `{name}` because word order is the first thing a translation changes — "0.5 of 3 shares" is
 * "0,5 de 3 cotas", and a positional `%s` would have pinned the English order into every language.
 *
 * An unknown placeholder is left as it stands rather than blanked: a visible `{share}` is a bug
 * somebody reports, and a silent gap is a sentence with a hole in it that reads as finished.
 */
export const fill = (template: string, values: Record<string, string | number>): string =>
    template.replace(/\{(\w+)\}/g, (placeholder, key: string) => (key in values ? String(values[key]) : placeholder))
