import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
    COLLECTIONS,
    ROOT_COLLECTIONS,
    basePathFor,
    getDoc,
    hrefFor,
    listAllDocs,
    listAllTranslations,
    listDocs,
    listSlugs,
    localesForSlug,
    type Collection,
} from './content'
import { CAST_NAMES, isCastName } from './cast'
import { staticPageSlugs } from '@/data/static-pages'
import { LOCALES } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import { pageTitle } from './seo'

/**
 * These run against the real src/content/ tree rather than fixtures. That is deliberate: the
 * failure mode this engine actually has is a bad article, not a bad parser — a missing date, a
 * slug that collides with a hand-built route, an internal link to a page that was renamed. A
 * fixture directory would pass while the site 404s.
 */

/**
 * Every language of every article, not just English. The length limits, the link check and the
 * FAQ/schema agreement are properties of a published page — a translation is a published page,
 * and checking only `en` is how a 70-character Spanish title ships unnoticed.
 */
const ALL = listAllTranslations()

describe('content tree', () => {
    /**
     * The loader swallows a broken file on purpose — a half-written article must not be able to
     * fail `next build`. The cost is that a translation with one bad line of YAML silently does
     * not publish, which is exactly how three of these shipped unparsed. This turns that silence
     * into a red test: every .md on disk must survive the loader.
     *
     * (The usual culprit is `: ` inside an unquoted frontmatter scalar — YAML reads it as a
     * mapping. Quote the string.)
     */
    it('parses every markdown file that exists', () => {
        const root = path.join(process.cwd(), 'src/content')
        for (const collection of COLLECTIONS) {
            const dir = path.join(root, collection)
            // Directories only. A collection may hold a loose file (a README holding the directory
            // open before its first page lands), and the loader ignores those — so must this.
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue
                for (const file of fs.readdirSync(path.join(dir, entry.name))) {
                    const locale = file.replace(/\.md$/, '')
                    expect(LOCALES, `${collection}/${entry.name}/${file} is not a known locale`).toContain(locale)
                    expect(
                        getDoc(collection, entry.name, locale as (typeof LOCALES)[number]),
                        `${collection}/${entry.name}/${file} exists but did not parse`
                    ).not.toBeNull()
                }
            }
        }
    })

    /** A routed collection with no pages is a dead route. */
    it('publishes at least one doc per collection', () => {
        for (const collection of COLLECTIONS) {
            expect(listDocs(collection).length, `${collection} is empty`).toBeGreaterThan(0)
        }
    })

    /**
     * Both root-level collections are served by one `[page]` segment, so a slug in both of them is
     * two pages fighting over one URL. `generateStaticParams` would emit it twice and the route
     * would serve whichever collection is listed first — silently, and not necessarily the one the
     * author meant.
     */
    it('never gives two root-level collections the same slug', () => {
        for (const locale of LOCALES) {
            const slugs = ROOT_COLLECTIONS.flatMap((collection) => listSlugs(collection, locale))
            expect(new Set(slugs).size, `duplicate root slug in ${locale}`).toBe(slugs.length)
        }
    })

    /**
     * A capture page exists because a query exists. Without `intent` there is nothing to check the
     * page against later, and nothing stopping the next one from being written for a query nobody
     * types.
     */
    it('gives every capture page the query it answers', () => {
        for (const doc of ALL.filter((doc) => doc.collection === 'capture')) {
            expect(doc.frontmatter.intent, `capture/${doc.slug}/${doc.locale}.md has no intent`).toBeTruthy()
        }
    })

    it('gives every doc a title, a description and an ISO date', () => {
        for (const doc of ALL) {
            expect(doc.frontmatter.title, doc.slug).toBeTruthy()
            expect(doc.frontmatter.description, doc.slug).toBeTruthy()
            expect(doc.frontmatter.date, `${doc.slug} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
    })

    /**
     * Past these lengths the tail is truncated in the result, so the last clause is written for
     * nobody. The title budget has to include the ` | Peanut Split` suffix `pageTitle()` adds —
     * measuring the frontmatter alone is how three of four articles shipped over the limit.
     */
    it('keeps titles and descriptions inside what Google renders', () => {
        for (const doc of ALL) {
            expect(pageTitle(doc.frontmatter.title).length, `${doc.slug} title too long`).toBeLessThanOrEqual(60)
            expect(doc.frontmatter.description.length, `${doc.slug} description too long`).toBeLessThanOrEqual(160)
        }
    })

    it('reserves every root path Next already owns', () => {
        // The guard is only worth having if it knows the real routes — deriving it from the
        // marketing pages alone left /new, /blog and /api free to be shadowed by an article.
        for (const segment of ['new', 'blog', 'r', 'api', 'healthcheck', 'readiness']) {
            expect(staticPageSlugs.has(segment), `${segment} is not reserved`).toBe(true)
        }
        for (const collection of ROOT_COLLECTIONS) {
            for (const slug of listSlugs(collection)) {
                expect(staticPageSlugs.has(slug), `${slug} collides with a static route`).toBe(false)
            }
        }
    })

    it('derives hrefs that match the routes', () => {
        expect(hrefFor('blog', 'foo')).toBe('/blog/foo')
        expect(hrefFor('alternatives', 'foo-alternative')).toBe('/foo-alternative')
        expect(hrefFor('capture', 'split-bill-no-signup')).toBe('/split-bill-no-signup')
        expect(hrefFor('capture', 'split-bill-no-signup', 'es')).toBe('/es/split-bill-no-signup')
        // The canonical and the hreflang base are the same derivation as the href, minus the prefix.
        expect(basePathFor('blog', 'foo')).toBe('/blog/foo')
        expect(basePathFor('capture', 'foo')).toBe('/foo')
    })

    it('returns null for an unknown slug', () => {
        expect(getDoc('blog', 'no-such-article')).toBeNull()
    })

    it('refuses a slug that would walk out of the content tree', () => {
        expect(getDoc('blog', '../alternatives/tricount-alternative')).toBeNull()
        expect(getDoc('blog', 'Not-A-Slug')).toBeNull()
    })

    it('lists every doc exactly once in the hub', () => {
        const hrefs = listAllDocs().map((doc) => doc.href)
        expect(new Set(hrefs).size).toBe(hrefs.length)
    })

    it('keeps v2-only guides valid but undiscoverable in v1', () => {
        const prior = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
        try {
            delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
            expect(getDoc('blog', 'scan-a-receipt-to-split-a-bill')).not.toBeNull()
            expect(listSlugs('blog')).not.toContain('scan-a-receipt-to-split-a-bill')

            process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = '1'
            expect(listSlugs('blog')).toContain('scan-a-receipt-to-split-a-bill')
        } finally {
            if (prior === undefined) delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
            else process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = prior
        }
    })
})

/**
 * The loader's own behaviour, against a scratch tree rather than the real articles — a draft, a
 * malformed file and a dateless file cannot be committed to src/content/ just to be asserted on,
 * and asserting them against a tree that contains none of those is how the previous version of
 * these tests passed without being able to fail.
 */
describe('loader, against a scratch tree', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-content-'))
    const cwd = process.cwd()

    beforeAll(() => {
        const write = (rel: string, body: string) => {
            const full = path.join(root, 'src/content', rel)
            fs.mkdirSync(path.dirname(full), { recursive: true })
            fs.writeFileSync(full, body)
        }
        const doc = (title: string, date: string, extra = '') =>
            `---\ntitle: ${title}\ndescription: d\ndate: ${date}\n${extra}---\nbody\n`

        write('blog/older/en.md', doc('Older', '2026-01-01'))
        write('blog/newer/en.md', doc('Newer', '2026-06-01'))
        write('blog/draft/en.md', doc('Draft', '2026-06-02', 'published: false\n'))
        write('blog/dateless/en.md', '---\ntitle: Dateless\ndescription: d\n---\nbody\n')
        write('blog/broken/en.md', '---\ntitle: "unterminated\ndescription: d\ndate: 2026-06-03\n---\nbody\n')
        // Would be served by /new, not by the content route — must never be listed.
        write('alternatives/new/en.md', doc('New', '2026-06-04'))
        write('alternatives/keep-alternative/en.md', doc('Keep', '2026-06-05'))

        // Capture pages share the root slot with alternatives, and are shadowed by the same routes.
        write('capture/split-bill-no-signup/en.md', doc('No signup', '2026-06-06', 'intent: split bill no signup\n'))
        write('capture/split-bill-no-signup/es.md', doc('Sin registro', '2026-06-06', 'intent: dividir cuenta\n'))
        write('capture/blog/en.md', doc('Blog', '2026-06-07'))

        // Translations: one article fully localised, one Spanish-only draft, one English-only.
        write('blog/newer/es.md', doc('Nuevo', '2026-06-01'))
        write('blog/newer/pt-BR.md', doc('Novo', '2026-06-01'))
        write('blog/older/es.md', doc('Viejo', '2026-01-01', 'published: false\n'))

        process.chdir(root)
    })

    afterAll(() => {
        process.chdir(cwd)
        fs.rmSync(root, { recursive: true, force: true })
    })

    it('survives malformed frontmatter instead of failing the build', () => {
        expect(() => listDocs('blog')).not.toThrow()
        expect(listSlugs('blog')).not.toContain('broken')
    })

    it('drops drafts and dateless articles', () => {
        const slugs = listSlugs('blog')
        expect(slugs).not.toContain('draft')
        expect(slugs).not.toContain('dateless')
        expect(getDoc('blog', 'draft')).toBeNull()
    })

    it('sorts newest first', () => {
        expect(listSlugs('blog')).toEqual(['newer', 'older'])
    })

    it('hides a slug that a static route would shadow', () => {
        expect(listSlugs('alternatives')).toEqual(['keep-alternative'])
        expect(getDoc('alternatives', 'new')).toBeNull()
        // The shadow rule follows the root slot, not the collection name — a capture page called
        // `blog` is as unreachable as an alternative called `new`.
        expect(getDoc('capture', 'blog')).toBeNull()
        expect(listSlugs('capture')).toEqual(['split-bill-no-signup'])
    })

    /**
     * The whole point of generalising `[alternative]` to `[page]`: two collections, one root slot,
     * and a capture page that gets the same hrefs, the same translations and the same sitemap
     * treatment as a comparison page without another route.
     */
    it('serves capture pages from the root slot beside alternatives', () => {
        expect(getDoc('capture', 'split-bill-no-signup')?.href).toBe('/split-bill-no-signup')
        expect(getDoc('capture', 'split-bill-no-signup', 'es')?.href).toBe('/es/split-bill-no-signup')
        expect(getDoc('capture', 'split-bill-no-signup')?.frontmatter.intent).toBe('split bill no signup')
        expect(localesForSlug('capture', 'split-bill-no-signup')).toEqual(['en', 'es'])

        const hrefs = listAllTranslations().map((doc) => doc.href)
        expect(hrefs).toContain('/split-bill-no-signup')
        expect(hrefs).toContain('/es/split-bill-no-signup')
        expect(hrefs).toContain('/keep-alternative')
    })

    /**
     * The rule the whole design rests on: a missing translation is a missing page, never an
     * English body at a translated URL. Every assertion here is one that a fallback would break.
     */
    describe('translations', () => {
        it('serves each language its own file', () => {
            expect(getDoc('blog', 'newer', 'en')?.frontmatter.title).toBe('Newer')
            expect(getDoc('blog', 'newer', 'es')?.frontmatter.title).toBe('Nuevo')
            expect(getDoc('blog', 'newer', 'pt-BR')?.frontmatter.title).toBe('Novo')
        })

        it('never falls back to English for an untranslated article', () => {
            // `older` has no pt-BR file at all, and its es file is a draft.
            expect(getDoc('blog', 'older', 'pt-BR')).toBeNull()
            expect(getDoc('blog', 'older', 'es')).toBeNull()
        })

        it('lists only what exists in that language', () => {
            expect(listSlugs('blog', 'es')).toEqual(['newer'])
            expect(listSlugs('blog', 'pt-BR')).toEqual(['newer'])
        })

        it('reports the locales a slug has, in a stable order', () => {
            expect(localesForSlug('blog', 'newer')).toEqual(['en', 'es', 'pt-BR'])
            expect(localesForSlug('blog', 'dateless')).toEqual(['en'])
            expect(localesForSlug('blog', 'no-such-slug')).toEqual([])
        })

        it('prefixes non-default locales and leaves English bare', () => {
            expect(getDoc('blog', 'newer', 'en')?.href).toBe('/blog/newer')
            expect(getDoc('blog', 'newer', 'es')?.href).toBe('/es/blog/newer')
            expect(getDoc('blog', 'newer', 'pt-BR')?.href).toBe('/pt-br/blog/newer')
            expect(getDoc('alternatives', 'keep-alternative', 'en')?.href).toBe('/keep-alternative')
        })

        it('enumerates every published translation for the sitemap', () => {
            const hrefs = listAllTranslations().map((doc) => doc.href)
            expect(hrefs).toContain('/blog/newer')
            expect(hrefs).toContain('/es/blog/newer')
            expect(hrefs).toContain('/pt-br/blog/newer')
            // The Spanish draft of `older` is published:false — a live English page beside it
            // must not drag the unfinished translation into the sitemap.
            expect(hrefs).not.toContain('/es/blog/older')
            expect(new Set(hrefs).size).toBe(hrefs.length)
        })
    })
})

describe('article bodies', () => {
    /** Internal links are the only thing here that can rot silently — a renamed slug 404s. */
    it('only links internally to pages that exist', () => {
        const known = new Set<string>([
            ...LOCALES.flatMap((locale) => ['/', '/new', '/blog'].map((path) => localizedPath(path, locale))),
            ...ALL.map((doc) => doc.href),
            ...[...staticPageSlugs].map((slug) => `/${slug}`),
        ])

        for (const doc of ALL) {
            const links = [...doc.body.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1])
            for (const link of links) {
                expect(known.has(link), `${doc.slug} links to missing ${link}`).toBe(true)
            }
        }
    })

    /** Rendered FAQ and FAQPage schema come from different places; they have to agree. */
    it('puts every rendered FAQ question into frontmatter too', () => {
        for (const doc of ALL) {
            const rendered = [...doc.body.matchAll(/<FAQItem question="([^"]+)"/g)].map((m) => m[1])
            if (rendered.length === 0) continue

            const declared = new Set((doc.frontmatter.faqs ?? []).map((faq) => faq.question))
            for (const question of rendered) {
                expect(declared.has(question), `${doc.slug} renders an FAQ missing from frontmatter`).toBe(true)
            }
        }
    })

    /** next-mdx-remote parses the body as MDX, so an unbalanced brace is a build failure. */
    it('has balanced custom-component tags', () => {
        const paired = ['Hero', 'CTA', 'Steps', 'Step', 'FAQ', 'FAQItem', 'Callout', 'Quote', 'Cast', 'Checklist', 'ChecklistItem', 'RelatedPages', 'RelatedLink'] // prettier-ignore
        for (const doc of ALL) {
            for (const tag of paired) {
                const opens = (doc.body.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length
                const selfClosing = (doc.body.match(new RegExp(`<${tag}[^>]*/>`, 'gs')) ?? []).length
                const closes = (doc.body.match(new RegExp(`</${tag}>`, 'g')) ?? []).length
                expect(opens - selfClosing, `${doc.slug}: <${tag}> is unbalanced`).toBe(closes)
            }
        }
    })
})

/**
 * The mechanical half of the stylebook.
 *
 * Split has no CI in front of `main` and a push is production in about five minutes, so a tone rule
 * that lives only in a document is a tone rule that gets broken on a Friday. Every rule that CAN be
 * a regex is one, and it lives here because `pnpm test` is the gate a human actually runs.
 *
 * Each rule is one entry. Adding the next one is a line, and the `why` is the message the failure
 * prints — a rule whose failure does not say what to write instead gets worked around.
 *
 * The rules are deliberately narrow. A blanket ban on "real-time" would fail
 * `blog/split-expenses-in-real-time`, whose subject is a shipped feature; what is actually banned is
 * "real-time" applied to an FX RATE, which is the claim `fx.ts` cannot support. Same shape for the
 * money-amount rule: a guide teaches with "the €47 taxi" and should, while a comparison page with a
 * number in it is a competitor price that rots. Narrow rules survive; broad ones get suppressed.
 */

const RATE_WORD = 'rates?|exchange|conversion|fx|tasas?|tipo de cambio|cotizaci[óo]n|taxas?|c[âa]mbio'
const LIVE_WORD = 'live|real[-\\s]?time|en vivo|ao vivo|(?:en|em) tiempo real|(?:en|em) tempo real'

interface StyleRule {
    id: string
    /**
     * `prose` is everything we wrote in our own voice: the title, the description and the body with
     * attributed `<Quote>` blocks and MDX comments removed. The metadata is in there because it is
     * the most-read prose on the page and the least often re-read by us.
     *
     * `meta` is the title and description alone, for rules about how a search result renders.
     */
    target: 'prose' | 'meta'
    pattern: RegExp
    /** Printed on failure. Say what to write instead, not just what is wrong. */
    why: string
    /** Collections the rule applies to. Omitted means all of them. */
    collections?: readonly Collection[]
}

export const NEVER_STRINGS: readonly StyleRule[] = [
    {
        id: 'unguessable-link',
        target: 'prose',
        pattern: /\bunguessable\b|\binadivinable\b/i,
        why: 'we make no claim about room-slug entropy — see product-truths.md#link-is-the-key',
    },
    {
        id: 'minimal-transfers',
        target: 'prose',
        pattern:
            /\b(?:fewest|smallest|minimum|minimal|optimal|m[íi]nim\w+|menor n[úu]mero)\b[^.\n]{0,24}\b(?:transfers?|payments?|transferencias?|transfer[êe]ncias?|pagos?|pagamentos?)\b/i,
        why: 'the netting walk is greedy — say "two or three transfers instead of twenty" (product-truths.md#netting-is-greedy)',
    },
    {
        id: 'live-fx-rate',
        target: 'prose',
        pattern: new RegExp(`\\b(?:${LIVE_WORD})\\b[\\s-]*(?:${RATE_WORD})\\b`, 'i'),
        why: 'the FX ceiling is "converted at the day\'s rate" — never live or real-time (product-truths.md#twelve-currencies)',
    },
    {
        id: 'live-fx-rate-reversed',
        target: 'prose',
        pattern: new RegExp(`\\b(?:${RATE_WORD})\\b[^.\\n]{0,16}\\b(?:${LIVE_WORD})\\b`, 'i'),
        why: 'same rule, other word order: a rate is never described as live or in real time',
    },
    {
        id: 'unlimited',
        target: 'prose',
        pattern: /\bunlimited\b|\bilimitad\w+\b/i,
        why: 'nothing here is unlimited — "up to twenty people" (product-truths.md#room-size-20)',
    },
    {
        id: 'money-amount-on-a-root-page',
        target: 'prose',
        collections: ROOT_COLLECTIONS,
        // Both orders, because "€140" and "140 €" are the same claim in different languages and a
        // one-sided regex would gate English and wave Spanish through.
        pattern: /[$€£¥]\s?\d|\d[\d.,]*\s?[$€£¥]/,
        why: 'a comparison or capture page states no prices — the paid-tier fact without the number (competitor-claims.md rule 3)',
    },
    {
        id: 'emoji-in-metadata',
        target: 'meta',
        pattern: /\p{Extended_Pictographic}/u,
        why: 'Google renders the title and description as plain text; an emoji there is a truncated character',
    },
]

/**
 * What a prose rule is matched against. A `<Quote>` is somebody else's words, attributed and dated,
 * and it is the one place a phrase we would not write ourselves is allowed to appear — stripping it
 * is what lets the rules be absolute everywhere else. MDX comments go too: the check-date note at the
 * top of a comparison page is instructions to the next editor, not copy.
 */
function ownProse(doc: (typeof ALL)[number]): string {
    const body = doc.body.replace(/<Quote[\s\S]*?<\/Quote>/g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    return `${doc.frontmatter.title}\n${doc.frontmatter.description}\n${body}`
}

describe('style gate', () => {
    it.each(NEVER_STRINGS.map((rule) => [rule.id, rule] as const))('never says %s', (_id, rule) => {
        for (const doc of ALL) {
            if (rule.collections && !rule.collections.includes(doc.collection)) continue
            const subject =
                rule.target === 'meta' ? `${doc.frontmatter.title} ${doc.frontmatter.description}` : ownProse(doc)
            const hit = subject.match(rule.pattern)
            expect(hit?.[0], `${doc.collection}/${doc.slug}/${doc.locale}.md: ${rule.why}`).toBeUndefined()
        }
    })
})

/**
 * The other half of §11: the rules that count rather than ban.
 *
 * A never-string is a phrase we never write; these are phrases we write ONCE. One exclamation
 * mark is the voice's interjection, two is a sales floor; one "Peanut Split" is the product
 * entering by name, two is a brochure. A cap cannot be a `NEVER_STRINGS` row because a row is
 * matched against the page as a blob and has no idea it is the second hit — so they live here,
 * one `it` per rule, each iterating every published translation.
 *
 * They run in `pnpm test` rather than in `scripts/marketing-copy-audit.mjs` for the same reason
 * the style gate above does: the audit script is the "free" claim checker, it walks raw files and
 * knows nothing about frontmatter, drafts or locales, and the gate a human actually runs before
 * pushing to `main` is `pnpm test`.
 */

/**
 * Body copy only: no frontmatter, no attributed `<Quote>` (§7.1 — somebody else's words), no MDX
 * comments (instructions to the next editor), and no `![` image marker, which is a markdown
 * token rather than an exclamation mark.
 */
function bodyProse(doc: (typeof ALL)[number]): string {
    return doc.body
        .replace(/<Quote[\s\S]*?<\/Quote>/g, ' ')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
        .replace(/!\[/g, '[')
}

/**
 * The body chopped into the units a sentence rule can be applied to.
 *
 * MDX is not one stream of prose. A `<Step title="…">` holds a line of copy, a `|` divides two
 * table cells, and the tag syntax between them is not text — so every attribute value and every
 * cell becomes its own segment, and markdown scaffolding (bullets, blockquote and heading
 * markers, emphasis) is stripped off the front. Opening quotation marks go too: a line of quoted
 * dialogue (§3.12) still starts a sentence, and treating `"Just send it to me"` as mid-sentence
 * would fail approved copy.
 */
function proseSegments(doc: (typeof ALL)[number]): string[] {
    return bodyProse(doc)
        .replace(/<\/?[A-Za-z][\w.]*/g, '\n')
        .replace(/\/?>/g, '\n')
        .replace(/\b[a-zA-Z]+="/g, '\n')
        .replace(/\|/g, '\n')
        .split('\n')
        .map((line) =>
            line
                .replace(/^[\s>#*+-]+/, '')
                .replace(/["“”'‘’*_`]/g, '')
                .trim()
        )
        .filter(Boolean)
}

/** The places §11.2 allows no exclamation mark at all, labelled so the failure says which one. */
function noExclamationZones(doc: (typeof ALL)[number]): [string, string][] {
    const body = bodyProse(doc)
    const zones: [string, string][] = [
        ['the title', doc.frontmatter.title],
        ['the description', doc.frontmatter.description],
    ]
    for (const faq of doc.frontmatter.faqs ?? []) zones.push(['a frontmatter FAQ', `${faq.question} ${faq.answer}`])
    for (const [heading] of body.matchAll(/^#{1,6} .*/gm)) zones.push(['a heading', heading])
    for (const [row] of body.matchAll(/^\s*\|.*/gm)) zones.push(['a table row', row])
    for (const [, label] of body.matchAll(/\b(?:text|cta)="([^"]*)"/g)) zones.push(['a CTA label', label])
    for (const [item] of body.matchAll(/<FAQItem[\s\S]*?<\/FAQItem>/g)) zones.push(['an FAQ item', item])
    return zones
}

/**
 * §11.1 verbatim. Every banned minimising use of "just" sits mid-sentence — "it's just easy",
 * "just a few taps", "it's just a link" — and the one approved use (§3.18, the imperative of
 * relief) is always the first word of a sentence, so the check follows the grammar and leaves the
 * judgement to the cold read.
 */
const MID_SENTENCE_JUST = /(?:[^\s.!?\n][^.!?\n]*)\bjust\b/i
/** §11.2's cap on the approved use: one sentence may open on "Just", not three. */
const SENTENCE_INITIAL_JUST = /(?:^|[.!?]\s+)Just\s/gm

describe('page style gate', () => {
    /** §3.13: one interjection per page, and it is the only exclamation mark the page gets. */
    it('spends at most one exclamation mark per page', () => {
        for (const doc of ALL) {
            const count = (bodyProse(doc).match(/!/g) ?? []).length
            expect(
                count,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: one interjection per page (§3.13) — the rest of the page is deadpan`
            ).toBeLessThanOrEqual(1)
        }
    })

    it('keeps exclamation marks out of metadata, headings, tables, CTAs and FAQs', () => {
        for (const doc of ALL) {
            for (const [where, text] of noExclamationZones(doc)) {
                expect(
                    text.includes('!'),
                    `${doc.collection}/${doc.slug}/${doc.locale}.md: no exclamation mark in ${where} (§11.2) — the interjection lives in body copy`
                ).toBe(false)
            }
        }
    })

    /**
     * §3.13/§3.7.4: an exclamation mark next to money reads as a sales floor. Clauses are split on
     * `.` and `?` only, so the text either side of the `!` counts as its sentence — which is the
     * point, because "…! You are ninety euros down" is the same sales floor in two sentences.
     */
    it('never puts an exclamation mark near a number', () => {
        for (const doc of ALL) {
            for (const segment of proseSegments(doc)) {
                for (const clause of segment.split(/[.?]+/)) {
                    if (!clause.includes('!')) continue
                    expect(
                        /[\d$€£¥]/.test(clause),
                        `${doc.collection}/${doc.slug}/${doc.locale}.md: "${clause.trim()}" — no exclamation mark in a sentence with a number in it (§3.13)`
                    ).toBe(false)
                }
            }
        }
    })

    it('only uses "just" as the first word of a sentence', () => {
        for (const doc of ALL) {
            for (const segment of proseSegments(doc)) {
                const hit = segment.match(MID_SENTENCE_JUST)
                expect(
                    hit?.[0],
                    `${doc.collection}/${doc.slug}/${doc.locale}.md: mid-sentence "just" minimises what it describes (§3.18) — cut the word, or open the sentence with it`
                ).toBeUndefined()
            }
        }
    })

    it('opens at most one sentence with "Just"', () => {
        for (const doc of ALL) {
            const count = (proseSegments(doc).join('\n').match(SENTENCE_INITIAL_JUST) ?? []).length
            expect(
                count,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: "Just …" is the closing beat of relief (§3.18) — a page gets one`
            ).toBeLessThanOrEqual(1)
        }
    })

    /**
     * §3.17/§10: the product enters by name once, and is "Split" everywhere after that. Scoped to
     * the body because the title, the description and the FAQ schema are not the page's prose —
     * `pageTitle()` appends " | Peanut Split" to every title on the site as it is.
     */
    it('names "Peanut Split" in full once, then calls it Split', () => {
        for (const doc of ALL) {
            const count = (bodyProse(doc).match(/Peanut Split/g) ?? []).length
            expect(
                count,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: the product enters by name once (§3.17) — every later mention is "Split"`
            ).toBeLessThanOrEqual(1)
        }
    })

    /**
     * §3.12: a page may open on one line of quoted dialogue, and it is the first line or it is
     * nothing. Whether the next sentence falsifies it is a judgement no regex makes, so this
     * checks the countable half — one quoted line at the top of the page, not two.
     */
    it('opens on at most one quoted line', () => {
        for (const doc of ALL) {
            const opening = bodyProse(doc)
                .split('\n')
                .filter((line) => line.trim())
                .slice(0, 4)
            const quoted = opening.filter((line) => /^["“]/.test(line.trim()))
            expect(
                quoted.length,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: one quoted opening per page (§3.12) — the second line is the flat sentence that tests it`
            ).toBeLessThanOrEqual(1)
        }
    })
})

describe('cast references', () => {
    /**
     * A mistyped character name would render the caption with no drawing beside it — a gap nothing
     * reports, because `<Cast>` deliberately does not throw. This is the gate.
     */
    it('only names characters that exist', () => {
        for (const doc of ALL) {
            for (const [, name] of doc.body.matchAll(/<Cast[^>]*\bname="([^"]*)"/g)) {
                expect(
                    isCastName(name),
                    `${doc.slug} names "${name}", which is not in the cast — pick one of: ${CAST_NAMES.join(', ')}`
                ).toBe(true)
            }
        }
    })

    /** An unknown size falls back to the CSS default, which is the picker's 32px — too small to read. */
    it('draws the cast at a size the component knows', () => {
        for (const doc of ALL) {
            for (const [, size] of doc.body.matchAll(/<Cast[^>]*\bsize="([^"]*)"/g)) {
                expect(['sm', 'md', 'lg'], `${doc.slug} draws a cast member at size="${size}"`).toContain(size)
            }
        }
    })
})
