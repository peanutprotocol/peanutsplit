import { billSplitCalculator } from './bill-split-calculator'
import { rentSplitCalculator } from './rent-split-calculator'
import type { Tool } from './types'

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
 * Ordered by search volume, which is the order the tools hub would list them in if there were one.
 */
export const TOOLS: readonly Tool[] = [billSplitCalculator, rentSplitCalculator]

export const TOOL_SLUGS: readonly string[] = TOOLS.map((tool) => tool.slug)

/**
 * One tool, or null. Takes an unvalidated route param: `/[page]` asks this first and falls through
 * to the content tree, so anything that is not a tool slug — including `undefined` from a route
 * reading the wrong param name — has to read as "not a tool" rather than throw.
 */
export function getTool(slug: string | undefined): Tool | null {
    if (typeof slug !== 'string') return null
    return TOOLS.find((tool) => tool.slug === slug) ?? null
}

/** Root-relative path a tool is served at. Tools are English-only, so there is no locale here. */
export const toolPath = (tool: Tool): string => `/${tool.slug}`
