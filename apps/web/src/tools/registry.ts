import { mileageSplitCalculator } from './mileage-split-calculator'
import { rentSplitCalculator } from './rent-split-calculator'
import type { Tool, ToolField, ToolFieldWords, ToolWords } from './types'
import { INDEXED_LOCALES, type IndexedLocale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'

/**
 * Every fairness microtool on the site.
 *
 * The list is the only thing a new tool has to be added to. `/[page]` builds its static params
 * from it, `sitemap.ts` lists it, `static-pages.ts` reserves its slugs against the content tree,
 * and `content.test.ts` runs the style gate over its copy — none of them holds a second list, for
 * the same reason `src/content` derives its routes from the directory: a list that has to be kept
 * in step is a list that stops being in step.
 *
 * Deliberately not a directory scan. Content is markdown a non-dev drops in a folder; a tool is
 * TypeScript with a compute function in it, so the import graph is already the registration and a
 * `readdirSync` here would only be able to find files the bundler already had to know about.
 *
 * **A tool never duplicates the app's core loop.** Splitting a bill between people is the whole
 * product, so there is no bill-split calculator here and there will not be one: the job goes to
 * `/new`, where the answer is a room the group can open rather than a number one person copies out
 * of a form. What survives as a tool is the arithmetic the app deliberately does not do — costing
 * a room by floor area, costing a drive at an official rate — which ends in a figure somebody then
 * puts into a room.
 *
 * Ordered by search volume, which is the order `/tools` lists them in.
 */
export const TOOLS: readonly Tool[] = [rentSplitCalculator, mileageSplitCalculator]

export const TOOL_SLUGS: readonly string[] = TOOLS.map((tool) => tool.slug)

/** English is the source: the configs above ARE the English tools, and every other locale is words. */
const SOURCE_LOCALE = 'en' satisfies IndexedLocale

/**
 * The languages a tool is published in. English always, and every locale that has a `ToolWords`
 * block — which is the same rule the content tree runs on: a translation exists because its words
 * exist, not because the locale does.
 */
export const toolLocales = (tool: Tool): IndexedLocale[] =>
    INDEXED_LOCALES.filter((locale) => locale === SOURCE_LOCALE || tool.locales?.[locale] !== undefined)

/** Words override structure key by key, so an omitted string is missing rather than English. */
const inWords = (field: ToolField, words: ToolFieldWords | undefined): ToolField =>
    words ? { ...field, label: words.label, help: words.help, unit: words.unit, notches: words.notches } : field

/**
 * The tool as one language renders it.
 *
 * Everything but the words comes through untouched — same fields, same limits, same `compute` —
 * so a translated calculator cannot drift from the English one in anything but its sentences.
 */
function inLocale(tool: Tool, words: ToolWords): Tool {
    return {
        ...tool,
        meta: words.meta,
        copy: words.copy,
        phrases: words.phrases,
        faqs: [...words.faqs],
        related: words.related,
        fields: tool.fields.map((field) => inWords(field, words.fields[field.name])),
        rows: tool.rows && {
            ...tool.rows,
            ...(words.rows ?? {}),
            columns: tool.rows.columns.map((column) => inWords(column, words.fields[column.name])),
        },
        choices: tool.choices?.map((choice) => {
            const said = words.choices?.[choice.name]
            return said
                ? {
                      ...choice,
                      label: said.label,
                      help: said.help,
                      options: choice.options.map((option) => ({
                          ...option,
                          label: said.options[option.value]?.label ?? option.label,
                          note: said.options[option.value]?.note,
                      })),
                  }
                : choice
        }),
        builder: tool.builder &&
            words.builder && {
                ...tool.builder,
                ...words.builder,
                fields: tool.builder.fields.map((field) => inWords(field, words.builder?.fields[field.name])),
            },
    }
}

/**
 * One tool in one language, or null. Takes an unvalidated route param: `/[page]` asks this first
 * and falls through to the content tree, so anything that is not a tool slug — including
 * `undefined` from a route reading the wrong param name — has to read as "not a tool" rather than
 * throw. A slug that exists but is untranslated is null too, for the same reason an untranslated
 * article 404s: no English calculator ever renders at a Spanish URL.
 */
export function getTool(slug: string | undefined, locale: IndexedLocale = SOURCE_LOCALE): Tool | null {
    if (typeof slug !== 'string') return null
    const tool = TOOLS.find((entry) => entry.slug === slug)
    if (!tool) return null
    if (locale === SOURCE_LOCALE) return tool
    const words = tool.locales?.[locale]
    return words ? inLocale(tool, words) : null
}

/** Every tool published in a language, in registry order. */
export const toolsIn = (locale: IndexedLocale): Tool[] =>
    TOOLS.map((tool) => getTool(tool.slug, locale)).filter((tool): tool is Tool => tool !== null)

/** Root-relative path a tool is served at. English keeps the bare path it already ranks on. */
export const toolPath = (tool: Tool, locale: IndexedLocale = SOURCE_LOCALE): string =>
    localizedPath(`/${tool.slug}`, locale)
