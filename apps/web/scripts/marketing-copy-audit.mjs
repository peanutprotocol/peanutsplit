import { readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const includeGenerated = process.argv.includes('--include-generated')
const failures = []
const FOSS_RELEASE_LABEL = 'claims FOSS, open-source, or AGPL status before the public-release gate'
const APPROVED_PUBLIC_SOURCE_CANDIDATES = new Set(
    ['en', 'es-419', 'pt-br'].map((locale) => `src/content/alternatives/splitwise-alternative/${locale}.md`)
)

/**
 * These are posture failures, not a word-choice score. The official host has no paid tier today,
 * but FOSS cannot guarantee that a hosted service will run or retain one price forever. Likewise,
 * Peanut may be referenced by the official service, but Squirrel Labs is the maintainer and funder.
 * Rejecting the old claims at source keeps every authored locale from regressing while the generated
 * SEO pipeline is cleared separately for public release.
 */
const prohibitedClaims = [
    {
        label: 'makes an unverifiable lifetime promise about the official host',
        pattern:
            /free[\s-]forever|forever free|always (?:be )?free|free for life|gratis para siempre|siempre gratis|siempre (?:será|es) gratis|grátis para sempre|sempre grátis|sempre (?:será|é) grátis|für immer kostenlos|kostenlos für immer|immer kostenlos|gratuit(?:e)? pour toujours|toujours gratuit(?:e)?|gratuit(?:e)? à vie|za darmo na zawsze|darmow\w* na zawsze|zawsze (?:będzie|jest) darmow\w*|безкоштовно назавжди|назавжди безкоштовн\w*|завжди (?:буде )?безкоштовн\w*/giu,
    },
    {
        label: 'uses the misleading product name “Split by Peanut”',
        pattern: /Split by Peanut/giu,
    },
    {
        label: FOSS_RELEASE_LABEL,
        pattern:
            /\b(?:Peanut Split|Split)\s+(?:is|remains|ships as|will (?:be|remain)|is licensed under)\s+(?:a\s+)?(?:free and open[- ]source|open[- ]source|FOSS|AGPL(?:-3\.0(?:-or-later)?)?)\b|\b(?:FOSS|open[- ]source|free and open[- ]source|AGPL(?:-3\.0(?:-or-later)?)?)\s+(?:alternatives?(?:\s+to\s+Splitwise)?|Splitwise\s+alternatives?|expense[- ]sharing app|bill[- ]splitting app|expense splitter|bill splitter)\b|\bSplit\s+(?:es|seguirá siendo)\s+(?:FOSS|software libre|de código abierto)\b|\b(?:O\s+)?Split\s+(?:é|continua sendo)\s+(?:FOSS|software livre|de código aberto)\b|\bSplit\s+(?:ist|bleibt)\s+(?:Open Source|quelloffen)\b|\bSplit\s+(?:est|reste)\s+(?:open source|un logiciel libre)\b|\bSplit\s+(?:jest|pozostaje)\s+(?:open source|otwartym oprogramowaniem)\b|\bSplit\s+(?:є|залишається)\s+(?:open source|програмним забезпеченням з відкритим кодом)\b/giu,
    },
    {
        label: 'guarantees that future versions will keep the same FOSS terms',
        pattern:
            /(?:all|every)\s+(?:(?:future|next|subsequent)\s+)?(?:versions?|releases?)(?:\s+(?:we|Squirrel Labs)\s+(?:publish|release|ship))?.{0,60}\b(?:will|shall|always|remain|stay|keep|use)\b.{0,40}(?:FOSS|open[- ]source|AGPL)|(?:future|next|subsequent)\s+(?:Peanut Split\s+)?releases?\s+(?:will|shall)\s+(?:remain|stay|keep|use).{0,40}(?:FOSS|open[- ]source|AGPL)|(?:we|Squirrel Labs)\s+will\s+(?:keep|continue)\s+(?:releasing|publishing|shipping).{0,60}(?:FOSS|open[- ]source|AGPL)|(?:FOSS|open[- ]source|AGPL).{0,30}(?:forever|for life)|(?:always|forever) (?:be|remain|stay) (?:FOSS|open[- ]source)|todas? las (?:(?:futuras|próximas)\s+)?(?:versiones|publicaciones)(?:\s+(?:futuras|próximas))?.{0,60}(?:será|serán|seguirá|seguirán|usará|usarán).{0,40}(?:código abierto|software libre|AGPL)|todas? as (?:(?:futuras|próximas)\s+)?(?:versões|publicações)(?:\s+(?:futuras|próximas))?.{0,60}(?:será|serão|continuará|continuarão|usará|usarão).{0,40}(?:código aberto|software livre|AGPL)/giu,
    },
    {
        label: 'misapplies the source license to the hosted service',
        pattern:
            /(?:(?:the|our)\s+)?(?:official|hosted)\s+(?:Peanut Split\s+)?(?:service|site|website|web(?:\s+app)?|app|host)(?:\s+at\s+peanutsplit\.com)?\s+(?:is|remains|runs\s+(?:as|under))\s+(?:FOSS|open[- ]source|AGPL)|peanutsplit\.com\s+(?:is|remains|runs\s+(?:as|under))\s+(?:FOSS|open[- ]source|AGPL)|(?:la\s+)?(?:web|aplicación)\s+(?:oficial|alojada)(?:\s+de\s+Peanut Split)?\s+(?:es|sigue siendo|funciona como|corre bajo)\s+(?:FOSS|software libre|de código abierto|AGPL)|(?:el\s+)?servicio\s+(?:oficial|alojado)(?:\s+de\s+Peanut Split)?\s+(?:es|sigue siendo|funciona como|corre bajo)\s+(?:FOSS|software libre|de código abierto|AGPL)|(?:o\s+)?(?:site|app|aplicativo)\s+(?:oficial|hospedado)(?:\s+(?:do|de)\s+Peanut Split)?\s+(?:é|continua sendo|funciona como|roda sob)\s+(?:FOSS|software livre|de código aberto|AGPL)|(?:o\s+)?serviço\s+(?:oficial|hospedado)(?:\s+(?:do|de)\s+Peanut Split)?\s+(?:é|continua sendo|funciona como|roda sob)\s+(?:FOSS|software livre|de código aberto|AGPL)/giu,
    },
    {
        label: 'turns a Peanut reference into a software-license condition',
        pattern:
            /(?:AGPL|licen[cs]e|licencia|licença).{0,80}(?<!not\s)(?<!no\s)(?<!não\s)(?:requires?|must|have to|condition|means.{0,30}(?:forks?\s+)?have to|exige|obriga|obliga|condición|condição|significa.{0,30}(?:forks?\s+)?(?:tienen que|têm que)).{0,50}(?:Peanut|promot|retain|conservar|promocionar)|forks?.{0,40}(?<!not\s)(?<!no\s)(?<!não\s)(?:must|have to|are required to|tienen que|têm que).{0,50}(?:Peanut|promot|retain|conservar|promocionar).{0,50}(?:AGPL|licen[cs]e|licencia|licença)/giu,
    },
    {
        label: 'incorrectly attributes maintenance or funding to Peanut',
        pattern:
            /\bPeanut\s+(?:makes?|made|builds?|built|funds?|funded|pays?|paid|maintains?|operates?|runs?|supports?)\b|\b(?:made|built|funded|paid|maintained|operated)\s+by\s+Peanut\b|\bPeanut\s+(?:lo\s+)?(?:hace|crea|creó|paga|mantiene|opera|financia)\b|\bSplit\s+lo\s+hace\s+Peanut\b|\b(?:(?:A|O)\s+)?Peanut\s+(?:[oa]\s+)?(?:faz|fez|cria|criou|paga|mantém|opera|financia)\b|\b(?:feito|feita|criado|criada|mantido|mantida)\s+pela\s+Peanut\b|\bPeanut\s+(?:betreibt|wartet|pflegt|finanziert|maintient|exploite|finance|utrzymuje|prowadzi|finansuje|підтримує|утримує|фінансує)\b/giu,
    },
    {
        label: 'incorrectly labels the Squirrel Labs maintainers as Peanut support',
        pattern:
            /Peanut support|support Peanut|Peanut-Support|soporte de Peanut|suporte da Peanut|pomocy Peanut|підтримки Peanut/giu,
    },
]

const stewardshipRequirements = {
    en: [/Squirrel Labs/u, /sole maintainer/u, /every cost/u, /work hours/u, /never/u],
    de: [/Squirrel Labs/u, /betreut nur Squirrel Labs/u, /alle Kosten/u, /Arbeitszeit/u, /nie/u],
    fr: [/Squirrel Labs/u, /assure seul la maintenance/u, /tous les coûts/u, /temps de travail/u, /jamais/u],
    pl: [/Squirrel Labs/u, /jedynym opiekunem/u, /wszystkie koszty/u, /czas pracy/u, /bez wymuszonych/u],
    uk: [/Squirrel Labs/u, /лише Squirrel Labs підтримує/u, /всі витрати/u, /робочий час/u, /без примусових/u],
    'es-419': [
        /Squirrel Labs/u,
        /única entidad mantenedora/u,
        /todos los costos/u,
        /horas de trabajo/u,
        /sin clics obligados/u,
    ],
    'pt-br': [
        /Squirrel Labs/u,
        /única mantenedora/u,
        /todos os custos/u,
        /horas de trabalho/u,
        /sem clique obrigatório/u,
    ],
}

/**
 * `_system` is the drafting agent's input layer, not a publishing surface — `COLLECTIONS` in
 * `lib/content.ts` never scans it and no URL serves it. It is also where the rules about the word
 * "free" are written down, quoted phrasing and all, so auditing it would fail on the file that
 * explains the audit.
 */
const isInputLayer = (name) => name.startsWith('_')

function filesBelow(directory, extensions, skipDirectory = () => false) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory())
            return skipDirectory(entry.name, path) ? [] : filesBelow(path, extensions, skipDirectory)
        return extensions.has(extname(entry.name)) ? [path] : []
    })
}

export function productionTypescriptFiles() {
    return filesBelow(resolve(root, 'src'), new Set(['.ts', '.tsx'])).filter((path) => {
        const local = relative(root, path).replaceAll('\\', '/')
        return !/\.test\.(?:ts|tsx)$/u.test(path) && !local.startsWith('src/server/test/')
    })
}

export function findPostureFailures(text, { allowPublicSourceCandidate = false } = {}) {
    const found = []
    for (const { label, pattern } of prohibitedClaims) {
        if (allowPublicSourceCandidate && label === FOSS_RELEASE_LABEL) continue
        for (const match of text.matchAll(pattern)) {
            found.push({ label, match: match[0] })
        }
    }
    return found
}

export function markdownParagraphs(source) {
    const paragraphs = []
    let lines = []
    let firstLine = 1
    const flush = () => {
        if (lines.length === 0) return
        paragraphs.push({ line: firstLine, text: lines.join(' ').replace(/\s+/gu, ' ').trim() })
        lines = []
    }

    source.split(/\r?\n/u).forEach((line, index) => {
        if (line.trim() === '') {
            flush()
            firstLine = index + 2
            return
        }
        if (lines.length === 0) firstLine = index + 1
        lines.push(line)
    })
    flush()
    return paragraphs
}

function auditText(file, location, text, options = {}) {
    for (const failure of findPostureFailures(text, options)) {
        failures.push(`${file}:${location} ${failure.label}: “${failure.match}”`)
    }
}

function auditJson(path) {
    const local = relative(root, path)
    const catalog = JSON.parse(readFileSync(path, 'utf8'))
    const visit = (value, key) => {
        if (typeof value === 'string') auditText(local, key, value)
        if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${key}[${index}]`))
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [childKey, child] of Object.entries(value)) {
                visit(child, key ? `${key}.${childKey}` : childKey)
            }
        }
    }
    visit(catalog, '')

    const locale = basename(path, '.json')
    const story = catalog?.marketing?.readMore?.who
    const storyText = [story?.built?.title, story?.built?.body, story?.free?.title, story?.free?.body]
        .filter((value) => typeof value === 'string')
        .join(' ')
    for (const requirement of stewardshipRequirements[locale] ?? []) {
        if (!requirement.test(storyText)) {
            failures.push(`${local}:marketing.readMore.who is missing required stewardship fact ${requirement}`)
        }
    }
}

function auditMarkdown(path) {
    const local = relative(root, path)
    const source = readFileSync(path, 'utf8')
    // Only the three translations of the one canonical comparison may carry launch copy. The path
    // allowlist prevents a pair of magic frontmatter lines from creating an indexable doorway.
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
    const allowPublicSourceCandidate =
        APPROVED_PUBLIC_SOURCE_CANDIDATES.has(local) &&
        /^releaseGate:\s*public-source\s*$/mu.test(frontmatter) &&
        /^\s*-\s*public-source-and-self-hosting\s*$/mu.test(frontmatter)

    for (const paragraph of markdownParagraphs(source)) {
        auditText(local, paragraph.line, paragraph.text, { allowPublicSourceCandidate })
    }
}

function auditTypescript(path, options = {}) {
    const local = relative(root, path)
    const source = readFileSync(path, 'utf8')
    // A .tsx parsed as .ts loses every string inside JSX, which is where a page's copy lives.
    const kind = extname(path) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
    const visit = (node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            auditText(local, line, node.text, options)
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
}

for (const path of filesBelow(resolve(root, 'src/i18n/messages'), new Set(['.json']))) auditJson(path)
for (const path of filesBelow(resolve(root, 'src/content'), new Set(['.md', '.mdx']), isInputLayer)) auditMarkdown(path)
if (includeGenerated) {
    for (const path of filesBelow(resolve(root, 'src/generated/seo'), new Set(['.md', '.mdx']))) {
        auditMarkdown(path)
    }
}

const publicSourcePage = resolve(root, 'src/app/(product-shell)/(marketing)/source/page.tsx')
for (const path of productionTypescriptFiles()) {
    auditTypescript(path, { allowPublicSourceCandidate: path === publicSourcePage })
}

if (failures.length) {
    console.error('Marketing copy audit failed:\n')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
}

console.log(`Marketing copy audit clean${includeGenerated ? ' (including generated SEO)' : ''}`)
