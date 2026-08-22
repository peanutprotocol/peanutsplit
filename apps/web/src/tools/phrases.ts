/**
 * Filling a phrase in.
 *
 * `{name}`, not `%s` — word order is the first thing a translation changes. An unknown placeholder
 * is left standing rather than blanked: a visible `{share}` is a bug somebody reports.
 */
export const fill = (template: string, values: Record<string, string | number>): string =>
    template.replace(/\{(\w+)\}/g, (placeholder, key: string) => (key in values ? String(values[key]) : placeholder))
