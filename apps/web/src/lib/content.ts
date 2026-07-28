import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { staticPageSlugs } from '@/data/static-pages'

/**
 * Split's content engine. Same shape as the one on peanut.me — markdown + frontmatter on disk,
 * MDX components in the body, routes and sitemap derived from the directory — but deliberately
 * NOT shared with it. peanut.me reads a mirror of `mono/content/` through a git submodule and a
 * generation pipeline; Split owns its articles outright, in this repo, in this folder. Split
 * must never inherit a content change it did not ask for, so the duplication is the point.
 *
 * Layout: src/content/{collection}/{slug}.md — one file, one page, English only.
 * peanut.me nests a locale file per slug because it ships five locales; Split ships one, and a
 * `{slug}/en.md` directory per article would be ceremony with no payload. If Split ever
 * localises, that is the change: swap the leaf for a directory here and nowhere else.
 *
 * Publishing an article is: drop the .md in, push. The route's generateStaticParams and
 * sitemap.ts both read this module, so nothing else has to be touched.
 */

const CONTENT_ROOT = path.join(process.cwd(), 'src/content')

/** The collections that have a route. Adding one means adding a route; keep the two in step. */
export const COLLECTIONS = ['blog', 'alternatives'] as const
export type Collection = (typeof COLLECTIONS)[number]

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
    /** Overrides the derived canonical path. Only needed for pages that moved. */
    canonical?: string
}

export interface Doc {
    collection: Collection
    slug: string
    /** Path the page is served at, leading slash, no origin. */
    href: string
    frontmatter: Frontmatter
    /** Markdown/MDX body with frontmatter stripped. */
    body: string
}

/**
 * URL shape per collection. Blog posts sit under /blog/; alternative pages sit at the root
 * because that is what the query looks like ("splitwise alternative") and a /compare/ prefix
 * buys nothing. Root-level slugs are safe: Next matches the static segments (/new, /r, /blog,
 * /api) before the dynamic one, and the route pins `dynamicParams = false`.
 */
export function hrefFor(collection: Collection, slug: string): string {
    return collection === 'blog' ? `/blog/${slug}` : `/${slug}`
}

function collectionDir(collection: Collection): string {
    return path.join(CONTENT_ROOT, collection)
}

/** A frontmatter date may come back from YAML as a Date; the rest of the app wants YYYY-MM-DD. */
function coerceDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    return typeof value === 'string' ? value : ''
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
function parseDoc(collection: Collection, slug: string): Doc | null {
    const filePath = path.join(collectionDir(collection), `${slug}.md`)
    let raw: string
    try {
        raw = fs.readFileSync(filePath, 'utf8')
    } catch {
        return null
    }

    const { data, content } = matter(raw)
    const title = typeof data.title === 'string' ? data.title.trim() : ''
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    if (!title || !description) return null

    return {
        collection,
        slug,
        href: hrefFor(collection, slug),
        frontmatter: {
            title,
            description,
            date: coerceDate(data.date),
            updated: data.updated ? coerceDate(data.updated) : undefined,
            author: typeof data.author === 'string' ? data.author : undefined,
            tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : undefined,
            faqs: coerceFaqs(data.faqs),
            published: data.published !== false,
            canonical: typeof data.canonical === 'string' ? data.canonical : undefined,
        },
        body: content.trim(),
    }
}

/**
 * Read the collection off disk. No cache: `next build` reads each collection a handful of
 * times and dev wants edits picked up without a restart. If this ever shows up in build
 * profiles, memoise on (collection, mtime) — not on collection alone.
 */
function readCollection(collection: Collection): Doc[] {
    let entries: string[]
    try {
        entries = fs.readdirSync(collectionDir(collection))
    } catch {
        return []
    }

    return entries
        .filter((f) => f.endsWith('.md'))
        .map((f) => parseDoc(collection, f.replace(/\.md$/, '')))
        .filter((doc): doc is Doc => doc !== null)
}

/**
 * A root-level markdown slug that collides with a hand-built route is unreachable — Next matches
 * the static segment first — so it must not be listed or sitemapped either. Blog slugs live under
 * /blog/ and cannot collide.
 */
function isShadowed(doc: Doc): boolean {
    return doc.collection !== 'blog' && staticPageSlugs.has(doc.slug)
}

/** Published docs in a collection, newest first. The only listing the app should use. */
export function listDocs(collection: Collection): Doc[] {
    return readCollection(collection)
        .filter((doc) => doc.frontmatter.published !== false && !isShadowed(doc))
        .sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date))
}

/** Published slugs in a collection — what generateStaticParams and the sitemap iterate. */
export function listSlugs(collection: Collection): string[] {
    return listDocs(collection).map((doc) => doc.slug)
}

/** One published doc, or null. Unpublished or shadowed reads as missing so the route 404s. */
export function getDoc(collection: Collection, slug: string): Doc | null {
    const doc = parseDoc(collection, slug)
    if (!doc || doc.frontmatter.published === false || isShadowed(doc)) return null
    return doc
}

/** Everything published, across collections, newest first. Powers the /blog hub. */
export function listAllDocs(): Doc[] {
    return COLLECTIONS.flatMap((collection) => listDocs(collection)).sort((a, b) =>
        b.frontmatter.date.localeCompare(a.frontmatter.date)
    )
}
