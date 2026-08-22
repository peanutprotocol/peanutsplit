#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Draft one translation of one page.
 *
 *     node scripts/draft-translation.mjs <collection>/<slug> <locale> [--dry-run]
 *
 * It assembles the bundle a transcreation needs — the English page, the locale's rulebook, the
 * stylebook sections that bind, the claim registers — hands it to the Claude Code CLI, and writes
 * the answer to `src/content/<collection>/<slug>/<locale>.md` with `draft: true` in frontmatter.
 *
 * `draft: true` is the whole safety story: `src/lib/content.ts` refuses a draft to every route,
 * listing, sitemap entry and hreflang set, while `content.test.ts` still holds it to every shape
 * and style gate. So the output of this script is reviewable in place and unpublishable until a
 * human deletes one line. Nothing here writes a page a reader can reach.
 */

export const COLLECTIONS = ['blog', 'alternatives', 'capture']
export const TARGET_LOCALES = ['es-419', 'pt-br']
const LANGUAGE = { 'es-419': 'Latin American Spanish', 'pt-br': 'Brazilian Portuguese' }

/** `pageTitle()` appends this to every title, and the 60-char budget is measured after it. */
const TITLE_SUFFIX = ' | Peanut Split'

const webRoot = path.resolve(import.meta.dirname, '..')
const read = (file) => readFileSync(file, 'utf8')

/**
 * One `## §N …` block of the stylebook, up to the next `## §`. The whole book is 950 lines and
 * most of it is English-only prose rules a transcreation cannot act on; the sections that bind a
 * translation are the registers, the locale rules and the mechanical appendix.
 */
export function stylebookSection(markdown, heading) {
    const start = markdown.indexOf(`## ${heading}`)
    if (start === -1) throw new Error(`stylebook.md has no ${heading}`)
    const rest = markdown.slice(start + 3)
    const end = rest.indexOf('\n## §')
    return (end === -1 ? markdown.slice(start) : markdown.slice(start, start + 3 + end)).trim()
}

/** Every internal path the English body links to, in both MDX spellings. */
export function internalLinks(body) {
    const links = [
        ...[...body.matchAll(/href="(\/[^"#?]*)"/g)].map((match) => match[1]),
        ...[...body.matchAll(/\]\((\/[^)]*)\)/g)].map((match) => match[1].replace(/[#?].*$/, '')),
    ]
    return [...new Set(links.filter(Boolean))]
}

/**
 * What each of those links becomes in the target language.
 *
 * Only a content page moves under a locale prefix, and only once that language's file exists —
 * `content.ts` never falls back to English at a translated URL, so a prefix in front of a page
 * that has no such file is a link to a 404. Tools, guides and the marketing routes answer at one
 * URL in every language and keep their path. Re-running the script after a sibling is drafted
 * re-points the link.
 */
export function localizeLink(link, locale, root = webRoot) {
    if (['/new', '/blog'].includes(link)) return `/${locale}${link}`
    for (const collection of COLLECTIONS) {
        const slug = link.startsWith('/blog/') ? link.slice('/blog/'.length) : link.slice(1)
        const base = collection === 'blog' ? `/blog/${slug}` : `/${slug}`
        if (base !== link) continue
        if (existsSync(path.join(root, 'src/content', collection, slug, `${locale}.md`))) return `/${locale}${link}`
    }
    return link
}

/**
 * Add `draft: true` to the frontmatter block, replacing any the model wrote itself. Appended last
 * so the rest of the keys stay in the order the English page declares them — a review diff of a
 * draft against its source should be the prose, not a reshuffled header.
 */
export function withDraftFlag(markdown) {
    const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/)
    if (!match) throw new Error('the model returned no frontmatter block')
    const keys = match[1]
        .split('\n')
        .filter((line) => !/^draft:/.test(line))
        .join('\n')
    return `---\n${keys}\ndraft: true\n---\n${markdown.slice(match[0].length).replace(/^\n+/, '')}`
}

/** Strip a ``` fence if the model wrapped the file in one. */
export function unfence(text) {
    const fenced = text.trim().match(/^```(?:markdown|md|mdx)?\n([\s\S]*)\n```$/)
    return (fenced ? fenced[1] : text).trim() + '\n'
}

export function buildBundle({ collection, slug, locale, root = webRoot }) {
    const system = path.join(root, 'src/content/_system')
    const source = read(path.join(root, 'src/content', collection, slug, 'en.md'))
    const stylebook = read(path.join(system, 'stylebook.md'))

    const parts = [
        ['LOCALE RULEBOOK — localization.' + locale + '.md', read(path.join(system, `localization.${locale}.md`))],
        ['STYLEBOOK §2 — the two registers', stylebookSection(stylebook, '§2')],
        ['STYLEBOOK §9 — locale rules', stylebookSection(stylebook, '§9')],
        ['STYLEBOOK §11 — the mechanically checked rules', stylebookSection(stylebook, '§11')],
        ['PRODUCT TRUTHS — every claim resolves here', read(path.join(system, 'product-truths.md'))],
    ]
    if (collection === 'alternatives') {
        parts.push([
            'COMPETITOR CLAIMS — what may be asserted about somebody else',
            read(path.join(system, 'competitor-claims.md')),
        ])
    }
    if (/<Cast\b/.test(source)) parts.push(['CAST', read(path.join(system, 'cast.md'))])

    const links = internalLinks(source)
        .map((link) => `  ${link} → ${localizeLink(link, locale, root)}`)
        .join('\n')

    const instructions = `TASK
Transcreate this page into ${LANGUAGE[locale]} (${locale}).
Transcreate, never translate literally: keep the argument, the structure and the beat order, and
write the sentences a person in that language would have written. Reply with the complete markdown
file and nothing else — no preamble, no fence, no commentary.

MUST HOLD
- Frontmatter keys, their order, and the values of date, tags, type, claims, competitorClaims and
  canonical are copied verbatim. A claim ID is evidence, not copy.
- title, description, headTerm, intent and every faqs question/answer ARE transcreated.
- title at most ${60 - TITLE_SUFFIX.length} characters — "${TITLE_SUFFIX.trim()}" is appended to it and the budget is 60.
- description at most 160 characters.
- headTerm is the head term in the page's own language, and every word of it must appear in the
  title and in at least one rendered heading (the <Hero title> or a #/##/### line).
- Text inside <Quote> stays in English, byte for byte. A competitor's words are evidence.
- Every <FAQItem question="…"> in the body matches a faqs question in frontmatter exactly.
- No bare { or } anywhere — MDX reads a brace as an expression and silently drops the line.
  Escape it as \\{ if the prose needs one.
- Component tags, their attribute names, and any <Cast name="…"> stay as they are.
- Internal links use exactly these targets:
${links || '  (none)'}
- At most one exclamation mark in the whole body, and none in the title, the description, a
  heading, a table row, a CTA label or an FAQ. None in a sentence that contains a number.
- The product enters by name as "Peanut Split" once; every later mention is "Split".
- At most one question asked in our own voice, and at most one quoted line at the top of the page.
- Every accent that the language requires is written. A dropped diacritic fails the build.
- "Settle Up" is a brand and stays capitalised; the act of settling takes the language's own verb.
${collection === 'blog' ? '' : '- No price and no money amount anywhere: this page type states the paid-tier fact without the number.\n'}${collection === 'alternatives' ? '- Keep the source-check note, with its ISO date, in the target language ("verificados contra …" / "conferidos contra …").\n' : ''}${locale === 'pt-br' ? '- No heading, title or description may open with "Sem " — lead with what the reader gets.\n' : ''}
ENGLISH SOURCE — src/content/${collection}/${slug}/en.md
${source}`

    return [...parts.map(([label, text]) => `===== ${label} =====\n${text}`), instructions].join('\n\n')
}

/** Where the bundle is left when the CLI cannot be reached. */
const promptDir = () => process.env.DRAFT_PROMPT_DIR ?? path.join(os.tmpdir(), 'split-draft-prompts')

function main(argv) {
    const dryRun = argv.includes('--dry-run')
    const [target, locale] = argv.filter((arg) => !arg.startsWith('--'))
    const [collection, slug] = (target ?? '').split('/')

    if (!COLLECTIONS.includes(collection) || !slug || !TARGET_LOCALES.includes(locale)) {
        console.error(
            `usage: draft-translation.mjs <${COLLECTIONS.join('|')}>/<slug> <${TARGET_LOCALES.join('|')}> [--dry-run]`
        )
        return 1
    }

    const dir = path.join(webRoot, 'src/content', collection, slug)
    if (!existsSync(path.join(dir, 'en.md'))) {
        console.error(`${collection}/${slug} has no en.md to translate`)
        return 1
    }

    const outFile = path.join(dir, `${locale}.md`)
    // A reviewed page is a human's work. Only a draft may be redrafted.
    if (existsSync(outFile) && !/^draft:\s*true$/m.test(read(outFile))) {
        console.error(
            `${collection}/${slug}/${locale}.md exists and is not a draft — delete it first if you mean to replace it`
        )
        return 1
    }

    const bundle = buildBundle({ collection, slug, locale })
    if (dryRun) {
        console.log(bundle)
        return 0
    }

    const claude = spawnSync('claude', ['-p', '--model', 'opus'], {
        input: bundle,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    })
    if (claude.status !== 0 || !claude.stdout?.trim()) {
        const file = path.join(promptDir(), `${slug}.${locale}.md`)
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, bundle)
        console.error(
            `claude -p unavailable (${claude.error?.message ?? `exit ${claude.status}`}) — run the bundle at ${file} yourself and save the answer to ${outFile} with draft: true`
        )
        return 2
    }

    // A model that answers with prose instead of a file is a normal outcome, not a crash: say so
    // and write nothing, so a re-run is the whole fix.
    let page
    try {
        page = withDraftFlag(unfence(claude.stdout))
    } catch (error) {
        console.error(`${collection}/${slug}/${locale}.md not written — ${error.message}. Run it again.`)
        return 1
    }

    writeFileSync(outFile, page)
    console.log(`wrote ${path.relative(webRoot, outFile)} (draft — unpublished until reviewed)`)
    return 0
}

/** Every English page with no file in `locale` — what a full drafting pass iterates. */
export function untranslated(locale, root = webRoot) {
    return COLLECTIONS.flatMap((collection) => {
        const dir = path.join(root, 'src/content', collection)
        return readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .filter((entry) => existsSync(path.join(dir, entry.name, 'en.md')))
            .filter((entry) => !existsSync(path.join(dir, entry.name, `${locale}.md`)))
            .map((entry) => `${collection}/${entry.name}`)
    })
}

// `process.exitCode`, never `process.exit`: --dry-run prints a bundle far larger than the pipe
// buffer, and exiting outright truncates it mid-write.
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
    process.exitCode = main(process.argv.slice(2))
}
