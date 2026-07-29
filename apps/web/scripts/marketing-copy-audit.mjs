import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const claimPattern = /\bfree\b|gratis|grátis/giu
const commitmentPattern = /free forever|gratis para siempre|grátis para sempre/iu
const failures = []
const seenExceptions = new Set()

const exceptions = [
    {
        id: 'splitwise-free-version',
        files: /src\/components\/marketing\/copy\.ts$/,
        phrase: 'the free version',
        reason: 'description of Splitwise’s free tier',
    },
    {
        id: 'splitwise-free-tier',
        files: /src\/components\/marketing\/copy\.ts$/,
        phrase: 'the free tier',
        reason: 'description of Splitwise’s free tier',
    },
    {
        id: 'splitwise-free-app',
        files: /src\/components\/marketing\/copy\.ts$/,
        phrase: 'The free app',
        reason: 'description of Splitwise’s app',
    },
    {
        id: 'splitwise-ad-free-quote',
        files: /src\/components\/marketing\/copy\.ts$/,
        phrase: 'ad-free',
        reason: 'quoted Splitwise Pro wording',
    },
    {
        id: 'splitwise-free-with-ads',
        files: /src\/components\/marketing\/copy\.ts$/,
        phrase: 'Free with ads',
        reason: 'description of Splitwise’s plan',
    },
    {
        id: 'tricount-quoted-claim',
        files: /src\/content\/alternatives\/tricount-alternative\/(?:en|es|pt-BR)\.md$/,
        phrase: '"100% free"',
        reason: 'quoted Tricount wording',
    },
]

function filesBelow(directory, extensions) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return filesBelow(path, extensions)
        return extensions.has(extname(entry.name)) ? [path] : []
    })
}

function exceptionFor(file, text, claimIndex) {
    return exceptions.find(({ files, phrase }) => {
        if (!files.test(file)) return false
        const phraseIndex = text.toLocaleLowerCase().indexOf(phrase.toLocaleLowerCase())
        return phraseIndex >= 0 && claimIndex >= phraseIndex && claimIndex < phraseIndex + phrase.length
    })
}

function auditText(file, location, text) {
    for (const match of text.matchAll(claimPattern)) {
        const exception = exceptionFor(file, text, match.index)
        if (exception) {
            seenExceptions.add(exception.id)
            continue
        }

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
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
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
    'src/lib/seo.ts',
    'src/server/og/roomCard.ts',
    'src/server/og/roomMeta.ts',
]) {
    auditTypescript(resolve(root, local))
}

for (const exception of exceptions) {
    if (!seenExceptions.has(exception.id)) {
        failures.push(`stale audit exception ${exception.id}; remove or update it`)
    }
}

if (failures.length) {
    console.error('Marketing copy audit failed:\n')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
}

console.log('Marketing copy audit clean')
for (const exception of exceptions) console.log(`  allowed: ${exception.id} — ${exception.reason}`)
