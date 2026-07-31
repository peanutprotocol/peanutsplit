import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const claimPattern = /\bfree\b|gratis|grátis/giu
/**
 * The hyphen is not cosmetic: `free-forever` is how the commitment appears as a claim ID in
 * frontmatter, and matching only the spaced prose form failed every page that cited the claim.
 */
const commitmentPattern = /free[\s-]forever|gratis para siempre|grátis para sempre/iu
const failures = []

/**
 * The rule is about OUR pricing claim, so it runs on the sentences that make one.
 *
 * A comparison page is mostly a description of somebody else's free tier — "Free with ads", "the
 * free version", an ad-free quote from a Pro pitch — and none of that is a promise Peanut is making
 * about Peanut. Auditing every `free` on the page made the six comparison pages fire about sixty
 * times, and the only way to land them was a per-file exception list longer than the rule it
 * excepted. Scoping to the subject is what lets the rule stay absolute where it applies: inside a
 * sentence that names the product, `free` still has to arrive with the forever commitment.
 *
 * Case-sensitive on purpose. The verb ("split what one person consumes") is ordinary copy on these
 * pages, and `\b` already keeps "Splitwise" out of `\bSplit\b`.
 */
const ourNamePattern = /\bSplit\b|\bPeanut\b/u
/**
 * What ends a subject. A full stop only counts with whitespace behind it, so `kb.splitwise.com`
 * stays one sentence; a `|` counts because a comparison table puts our column and theirs on one
 * line, and a row that names Split in one cell must not vouch for the cell beside it.
 */
const subjectBreakPattern = /[.!?](?=\s|$)|\||\n/g

function sentenceAround(text, index) {
    let start = 0
    for (const match of text.matchAll(subjectBreakPattern)) {
        const end = match.index + match[0].length
        if (index < end) return text.slice(start, end)
        start = end
    }
    return text.slice(start)
}

/**
 * `_system` is the drafting agent's input layer, not a publishing surface — `COLLECTIONS` in
 * `lib/content.ts` never scans it and no URL serves it. It is also where the rules about the word
 * "free" are written down, quoted phrasing and all, so auditing it would fail on the file that
 * explains the audit.
 */
const isInputLayer = (name) => name.startsWith('_')

function filesBelow(directory, extensions) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return isInputLayer(entry.name) ? [] : filesBelow(path, extensions)
        return extensions.has(extname(entry.name)) ? [path] : []
    })
}

function auditText(file, location, text) {
    for (const match of text.matchAll(claimPattern)) {
        if (!ourNamePattern.test(sentenceAround(text, match.index))) continue

        const around = text.slice(Math.max(0, match.index - 24), match.index + 48)
        if (!commitmentPattern.test(around)) {
            failures.push(`${file}:${location} says “${match[0]}” without the forever commitment`)
        }
    }
}

function auditJson(path) {
    const local = relative(root, path)
    const visit = (value, key) => {
        if (typeof value === 'string') auditText(local, key, value)
        if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${key}[${index}]`))
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [childKey, child] of Object.entries(value)) {
                visit(child, key ? `${key}.${childKey}` : childKey)
            }
        }
    }
    visit(JSON.parse(readFileSync(path, 'utf8')), '')
}

function auditMarkdown(path) {
    const local = relative(root, path)
    readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .forEach((line, index) => auditText(local, index + 1, line))
}

function auditTypescript(path) {
    const local = relative(root, path)
    const source = readFileSync(path, 'utf8')
    // A .tsx parsed as .ts loses every string inside JSX, which is where a page's copy lives.
    const kind = extname(path) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
    const visit = (node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            auditText(local, line, node.text)
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
}

for (const path of filesBelow(resolve(root, 'src/i18n/messages'), new Set(['.json']))) auditJson(path)
for (const path of filesBelow(resolve(root, 'src/content'), new Set(['.md', '.mdx']))) auditMarkdown(path)

for (const local of [
    'src/components/marketing/copy.ts',
    'src/app/(marketing)/tools/page.tsx',
    'src/lib/seo.ts',
    'src/server/og/roomCard.ts',
    'src/server/og/roomMeta.ts',
]) {
    auditTypescript(resolve(root, local))
}

/**
 * The tool registry is a publishing surface written in TypeScript: every string in it is copy on a
 * page. Walked rather than listed, because the promise the registry makes is that adding a tool is
 * adding one file — a hand-kept list here would be the one place that promise leaked.
 */
for (const path of filesBelow(resolve(root, 'src/tools'), new Set(['.ts']))) {
    if (path.endsWith('.test.ts')) continue
    auditTypescript(path)
}

if (failures.length) {
    console.error('Marketing copy audit failed:\n')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
}

console.log('Marketing copy audit clean')
