import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { staticPageSlugs } from '@/data/static-pages'
import { DEFAULT_LOCALE, INDEXED_LOCALES, isIndexedLocale, type IndexedLocale, type Locale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import { splitV2Enabled } from '@/lib/flags'

/**
 * Split's content engine. Same shape as the one on peanut.me — markdown + frontmatter on disk,
 * MDX components in the body, routes and sitemap derived from the directory — but deliberately
 * NOT shared with it. peanut.me reads a mirror of `mono/content/` through a git submodule and a
 * generation pipeline; Split owns its articles outright, in this repo, in this folder. Split
 * must never inherit a content change it did not ask for, so the duplication is the point.
 *
 * Layout: `src/content/{collection}/{slug}/{locale}.md` — a directory per article, a file per
 * language, locale codes taken from `@/i18n/locales` so there is exactly one list of locales in
 * the repo. peanut.me nests the same way for the same reason.
 *
 * **No fallback to English.** peanut.me renders the English body at a Spanish URL when the
 * translation is missing; that publishes the same text at two addresses and lets Google decide
 * which one to drop. Here, a locale a page has no file for simply has no page: the route 404s,
 * the sitemap omits it, the hub does not list it, and hreflang never points at it. Partial
 * translation is a normal state, and this is what makes it a safe one.
 *
 * Publishing an article is: drop `{slug}/en.md` in, push. Translating one is: drop `es-419.md` in
 * beside it. `generateStaticParams` and `sitemap.ts` both derive from the directory, so neither
 * has a list to update.
 */

/**
 * Resolved per call rather than once at module load. Next runs the build from the app root so
 * either would work in production, but a frozen root cannot be pointed at a fixture tree — which
 * is what let the loader's draft/malformed/shadowed handling go untested.
 */
const contentRoot = () => path.join(process.cwd(), 'src/content')

/** The collections that have a route. Adding one means adding a route; keep the two in step. */
export const COLLECTIONS = ['blog', 'alternatives', 'capture'] as const
export type Collection = (typeof COLLECTIONS)[number]

/**
 * Collections served from a root-level slug instead of a prefixed one.
 *
 * Both answer a query typed as-is — "tricount alternative", "split a bill without an app" — so
 * the slug is the head term and a folder in front of it would push that term a level down for no
 * reader benefit. They therefore share ONE dynamic segment, `/[page]`, because Next allows only
 * one dynamic name at a given path position. The route resolves an incoming slug across this
 * list in order; a slug that exists in two of these collections is a repo bug, and
 * `content.test.ts` fails on it rather than letting the first match quietly win.
 */
export const ROOT_COLLECTIONS = ['alternatives', 'capture'] as const satisfies readonly Collection[]
export type RootCollection = (typeof ROOT_COLLECTIONS)[number]

export const isRootCollection = (collection: Collection): collection is RootCollection =>
    (ROOT_COLLECTIONS as readonly Collection[]).includes(collection)

export interface Faq {
    question: string
    answer: string
}

export interface Frontmatter {
    /** <h1> and the base of the <title>. */
    title: string
    /** Meta description and the hub-card subtitle. Aim for 140–160 chars. */
    description: string
    /** ISO date (YYYY-MM-DD). Sitemap lastModified, article schema datePublished, hub sort key. */
    date: string
    /** ISO date of the last meaningful edit. Falls back to `date`. */
    updated?: string
    /** Byline. Organization-level by default — Split has no author pages. */
    author?: string
    /** Free-form, shown as chips on the hub. */
    tags?: string[]
    /** Lifted into FAQPage JSON-LD and rendered by the <Faq> component if the body uses one. */
    faqs?: Faq[]
    /** Set false to keep a draft in the repo but out of routes, sitemap and hub. */
    published?: boolean
    /**
     * A machine draft awaiting review. Same effect as `published: false` and a different word on
     * purpose: `published` is an editor's decision to hold a page, `draft` marks copy no human has
     * read yet. Held to every shape and style gate, routable by nothing.
     */
    draft?: boolean
    /** Available only in builds that explicitly expose the v2 product surface. */
    v2Only?: boolean
    /** Overrides the derived canonical path. Only needed for pages that moved. */
    canonical?: string
    /**
     * The search-query family this page answers, written the way a person types it. Required on
     * `capture` pages and meaningless elsewhere: a capture page exists because a query exists, and
     * one with no query behind it is a page nobody asked for. Not rendered — it is the editorial
     * contract, and `content.test.ts` is what enforces it.
     */
    intent?: string
    /**
     * The head term of that query — the two-to-four words a person types before the long tail,
     * written in this file's language. Required on `capture` and `comparison` pages. Not rendered:
     * `content.test.ts` checks that every word of it is in the `<title>` and in at least one
     * heading the page renders. Search engines that weigh a heading match heavily (Bing, and the
     * engines and assistants that read its index) will not rank a page whose headings are all
     * voice and no term — see stylebook §11.2, "Head term".
     */
    headTerm?: string
    /** Stylebook page type (§11.3): capture, comparison, editorial or guide. Drives the claims gate. */
    type?: string
    /**
     * IDs of the product truths this page's prose rests on, resolved against
     * `_system/product-truths.md` (stylebook §7.5). Not rendered — `content.test.ts` enforces it.
     */
    claims?: string[]
    /** IDs from the `_system/competitor-claims.md` register. Required on `type: comparison`. */
    competitorClaims?: string[]
}

export interface Doc {
    collection: Collection
    slug: string
    /** The language this doc was written in. Never a fallback — the file exists or the doc does not. */
    locale: IndexedLocale
    /** Path the page is served at, leading slash, no origin, locale prefix included. */
    href: string
    frontmatter: Frontmatter
    /** Markdown/MDX body with frontmatter stripped. */
    body: string
}

/**
 * The unprefixed path a page is served at — English's own URL, and what hreflang, the sitemap,
 * the language links and the canonical are all derived from.
 *
 * One function because this used to be `collection === 'blog' ? … : …` written out in four
 * places, and a fifth collection added to only three of them is a canonical that disagrees with
 * the route it is on. Root-level slugs are safe: Next matches the static segments (/new, /r,
 * /blog, /api) before the dynamic one, and the route pins `dynamicParams = false`.
 */
export function basePathFor(collection: Collection, slug: string): string {
    return isRootCollection(collection) ? `/${slug}` : `/${collection}/${slug}`
}

/** `basePathFor`, prefixed for the locale. English keeps the bare path — see `@/i18n/paths`. */
export function hrefFor(collection: Collection, slug: string, locale: Locale = DEFAULT_LOCALE): string {
    return localizedPath(basePathFor(collection, slug), locale)
}

function collectionDir(collection: Collection): string {
    return path.join(contentRoot(), collection)
}

/** `src/content/{collection}/{slug}/{locale}.md` */
function docPath(collection: Collection, slug: string, locale: Locale): string {
    return path.join(collectionDir(collection), slug, `${locale}.md`)
}

/**
 * Which languages this article is actually published in, English first. Drives hreflang, the
 * sitemap alternates and the language links on the page, so it must reflect docs a reader can
 * reach rather than files on disk — a committed draft or an unparseable translation 404s, and
 * hreflang pointing at a 404 is worse than offering nothing.
 */
export function localesForSlug(collection: Collection, slug: string): IndexedLocale[] {
    return INDEXED_LOCALES.filter((locale) => {
        const doc = getDoc(collection, slug, locale)
        return doc !== null && isDocAvailable(doc)
    })
}

/** A frontmatter date may come back from YAML as a Date; the rest of the app wants YYYY-MM-DD. */
function coerceDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    return typeof value === 'string' ? value : ''
}

function coerceStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined
    return value.filter((item): item is string => typeof item === 'string')
}

function coerceFaqs(value: unknown): Faq[] | undefined {
    if (!Array.isArray(value)) return undefined
    const faqs = value.filter(
        (item): item is Faq =>
            !!item && typeof item.question === 'string' && typeof item.answer === 'string' && !!item.question.trim()
    )
    return faqs.length ? faqs : undefined
}

/**
 * Parse one file. Returns null for anything unreadable or missing a title/description, so a
 * half-written article can sit in the tree without breaking the build or the sitemap. Content
 * is a publishing surface, not a code path — it should fail quiet and visible, not loud.
 */
function parseDoc(collection: Collection, slug: string, locale: Locale): Doc | null {
    // A slug reaches this from a route param. `dynamicParams = false` already pins the match set,
    // but the loader should not be the thing relying on that — `../` in a slug would otherwise
    // walk out of the content tree and produce a doc with a nonsense href.
    //
    // The typeof check is load-bearing and was learned the hard way: a route reading the wrong
    // param name hands this `undefined`, `.test()` stringifies that to "undefined", which matches
    // the pattern, and `path.join` then throws on a non-string — a 500 where a 404 belonged.
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
    // Same reasoning for the locale, which is a path segment on every non-English route.
    if (!isIndexedLocale(locale)) return null

    const filePath = docPath(collection, slug, locale)

    // Both the read and the YAML parse are inside the guard. gray-matter throws on malformed
    // frontmatter, and a half-written article must not be able to fail `next build` — every
    // caller here (sitemap, generateStaticParams, the hub) runs at build time.
    let data: Record<string, unknown>
    let content: string
    try {
        const parsed = matter(fs.readFileSync(filePath, 'utf8'))
        data = parsed.data
        content = parsed.content
    } catch {
        return null
    }

    const title = typeof data.title === 'string' ? data.title.trim() : ''
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    const date = coerceDate(data.date)
    // A dateless article emits an empty datePublished into BlogPosting schema, which is worse
    // than not publishing it — so the date is required, not defaulted.
    if (!title || !description || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

    return {
        collection,
        slug,
        locale,
        href: hrefFor(collection, slug, locale),
        frontmatter: {
            title,
            description,
            date,
            updated: data.updated ? coerceDate(data.updated) : undefined,
            author: typeof data.author === 'string' ? data.author : undefined,
            tags: coerceStringArray(data.tags),
            faqs: coerceFaqs(data.faqs),
            published: data.published !== false,
            draft: data.draft === true,
            v2Only: data.v2Only === true,
            canonical: typeof data.canonical === 'string' ? data.canonical : undefined,
            intent: typeof data.intent === 'string' ? data.intent.trim() || undefined : undefined,
            headTerm: typeof data.headTerm === 'string' ? data.headTerm.trim() || undefined : undefined,
            type: typeof data.type === 'string' ? data.type : undefined,
            claims: coerceStringArray(data.claims),
            competitorClaims: coerceStringArray(data.competitorClaims),
        },
        body: content.trim(),
    }
}

/**
 * Read the collection off disk. No cache: `next build` reads each collection a handful of
 * times and dev wants edits picked up without a restart. If this ever shows up in build
 * profiles, memoise on (collection, mtime) — not on collection alone.
 */
function readCollection(collection: Collection, locale: Locale): Doc[] {
    let entries: fs.Dirent[]
    try {
        entries = fs.readdirSync(collectionDir(collection), { withFileTypes: true })
    } catch {
        return []
    }

    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => parseDoc(collection, entry.name, locale))
        .filter((doc): doc is Doc => doc !== null)
}

/**
 * A root-level markdown slug that collides with a hand-built route is unreachable — Next matches
 * the static segment first — so it must not be listed or sitemapped either. Blog slugs live under
 * /blog/ and cannot collide.
 */
function isShadowed(doc: Doc): boolean {
    return isRootCollection(doc.collection) && staticPageSlugs.has(doc.slug)
}

/** Product-version visibility is separate from publishing: v2 content stays
 * valid and testable in v1 builds, but is not routable or discoverable. */
function isReleased(doc: Doc): boolean {
    return !doc.frontmatter.v2Only || splitV2Enabled()
}

/** Routable or not. Both reasons a valid page is withheld — unreviewed draft, unreleased version. */
export function isDocAvailable(doc: Doc): boolean {
    return doc.frontmatter.draft !== true && isReleased(doc)
}

/**
 * Everything in a collection whose copy is reviewable: the published docs plus the drafts hidden
 * from them. Not a routing list — nothing that serves a URL may call this. It exists so
 * `content.test.ts` can hold a draft to the same shape and style gates as a live page, which is
 * the only thing that makes a machine draft worth reviewing.
 */
export function listAuthoredDocs(collection: Collection, locale: Locale = DEFAULT_LOCALE): Doc[] {
    return readCollection(collection, locale)
        .filter((doc) => doc.frontmatter.published !== false && !isShadowed(doc) && isReleased(doc))
        .sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date))
}

/** `listAuthoredDocs` over every collection and locale — the review surface, drafts included. */
export function listAllAuthoredTranslations(): Doc[] {
    return COLLECTIONS.flatMap((collection) =>
        INDEXED_LOCALES.flatMap((locale) => listAuthoredDocs(collection, locale))
    )
}

/** `getDoc` without the draft gate, so a draft on disk still has to parse. */
export function getAuthoredDoc(collection: Collection, slug: string, locale: Locale = DEFAULT_LOCALE): Doc | null {
    const doc = parseDoc(collection, slug, locale)
    if (!doc || doc.frontmatter.published === false || isShadowed(doc)) return null
    return doc
}

/**
 * Published docs in a collection for one language, newest first. The only listing the app should
 * use. A doc with no file in `locale` is absent, not substituted — see the module docstring.
 */
export function listDocs(collection: Collection, locale: Locale = DEFAULT_LOCALE): Doc[] {
    return listAuthoredDocs(collection, locale).filter(isDocAvailable)
}

/** Published slugs in a collection — what generateStaticParams and the sitemap iterate. */
export function listSlugs(collection: Collection, locale: Locale = DEFAULT_LOCALE): string[] {
    return listDocs(collection, locale).map((doc) => doc.slug)
}

/** One published doc, or null. Draft, unpublished, shadowed or untranslated all read as missing. */
export function getDoc(collection: Collection, slug: string, locale: Locale = DEFAULT_LOCALE): Doc | null {
    const doc = getAuthoredDoc(collection, slug, locale)
    return doc && doc.frontmatter.draft !== true ? doc : null
}

/** Everything published in one language, across collections, newest first. Powers the hub. */
export function listAllDocs(locale: Locale = DEFAULT_LOCALE): Doc[] {
    return COLLECTIONS.flatMap((collection) => listDocs(collection, locale)).sort((a, b) =>
        b.frontmatter.date.localeCompare(a.frontmatter.date)
    )
}

/**
 * Every (collection, slug, locale) that has a file — the sitemap's whole input, and what proves
 * a translation is reachable. Published-gated per locale: a draft `es-419.md` beside a live `en.md`
 * hides only the Spanish URL.
 */
export function listAllTranslations(): Doc[] {
    return COLLECTIONS.flatMap((collection) => INDEXED_LOCALES.flatMap((locale) => listDocs(collection, locale)))
}
