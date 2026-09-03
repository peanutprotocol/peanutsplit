import { readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import matter from 'gray-matter'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const includeGenerated = process.argv.includes('--include-generated')
const failures = []
const FOSS_RELEASE_LABEL = 'claims FOSS, open-source, or AGPL status before the public-release gate'
const APPROVED_PUBLIC_SOURCE_CANDIDATES = new Set(
    ['en', 'es-419', 'pt-br'].map((locale) => `src/content/alternatives/splitwise-alternative/${locale}.md`)
)
const PUBLIC_SOURCE_FRONTMATTER_KEYS = new Set(['publicSourceTitle', 'publicSourceDescription', 'publicSourceFaqs'])
// Internal evidence IDs are validated by content.test.ts but never rendered or emitted as metadata.
const NON_COPY_FRONTMATTER_KEYS = new Set(['claims', 'competitorClaims'])
const PUBLIC_SOURCE_WRAPPER_LABEL = 'has an unbalanced or nested PublicSourceOnly release boundary'
const PUBLIC_SOURCE_BOUNDARY_PATTERN =
    /\b(?:AGPL(?:[- ]?v?3(?:\.0)?(?:[- ]or[- ]later)?)?|FOSS|GNU Affero (?:General Public License|GPL)(?: v?3(?:\.0)?(?: or later)?)?|Affero General Public License|open[- ]source|free software|self[- ]host(?:ed|ing|able)?|public (?:source|repository)|source code|host (?:it|the (?:code|software|release)) yourself|run your own copy|host your own.{0,25}(?:copy|instance))\b|\b(?:source(?: code)?|code|repository)\b.{0,35}\b(?:is )?(?:now )?(?:public|publicly available|available(?: on GitHub)?)\b|código abierto|código aberto|código fonte|código[- ]fonte|código fuente|software libre|software livre|repositorio público|repositório público|alojar(?:lo|la|se| Split)?.{0,35}(?:por tu cuenta|propio servidor)|auto[- ]?alojar|auto[- ]?hospedar|hospedar.{0,30}por conta própria|(?:https:\/\/peanutsplit\.com)?\/source(?:[\/?#\s]|$)/giu

const NAMED_ENTITY_VALUES = new Map(
    Object.entries({
        amp: '&',
        apos: "'",
        colon: ':',
        equals: '=',
        gt: '>',
        lbrace: '{',
        lcub: '{',
        lpar: '(',
        lt: '<',
        nbsp: ' ',
        ensp: ' ',
        emsp: ' ',
        hairsp: ' ',
        mediumspace: ' ',
        newline: '\n',
        num: '#',
        period: '.',
        quest: '?',
        quot: '"',
        rbrace: '}',
        rcub: '}',
        rpar: ')',
        sol: '/',
        tab: '\t',
        thinsp: ' ',
    })
)

/** Normalize the text a Markdown/MDX reader sees before applying posture semantics. */
export function normalizeMarketingCopy(text) {
    const numericEntities = text.replace(/&#(x[0-9a-f]+|[0-9]+);?/giu, (_entity, value) => {
        const hexadecimal = value.slice(0, 1).toLowerCase() === 'x'
        const codePoint = Number.parseInt(hexadecimal ? value.slice(1) : value, hexadecimal ? 16 : 10)
        if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return ' '
        try {
            return String.fromCodePoint(codePoint)
        } catch {
            return ' '
        }
    })
    return (
        numericEntities
            .replace(/&([a-z][a-z0-9]+);/giu, (entity, name) => NAMED_ENTITY_VALUES.get(name.toLowerCase()) ?? entity)
            .replace(/%([0-9a-f]{2})/giu, (_escape, value) => {
                const byte = Number.parseInt(value, 16)
                return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ' '
            })
            .replace(/[\u00ad\u200b-\u200d\ufeff]/gu, '')
            .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/gu, '-')
            .replace(/\p{Zs}/gu, ' ')
            .replace(/!\[([^\]]*)\]\(([^)]*)\)/gu, ' $1 $2 ')
            .replace(/\[([^\]]+)\]\(([^)]*)\)/gu, ' $1 $2 ')
            // Strip tag names but preserve attributes (especially href) for route auditing.
            .replace(/<\s*\/?\s*[a-z][\w:-]*([^>]*)>/giu, (_tag, attributes) =>
                /^\s*\/?\s*$/u.test(attributes) ? ' ' : ` ${attributes} `
            )
            .replace(/[*_~`\[\](){},='"<>]/gu, ' ')
            .replace(/\s+/gu, ' ')
            .trim()
    )
}

/**
 * These are posture failures, not a word-choice score. The official host is free and stays free
 * (a price promise, not an uptime promise), so lifetime-price wording is allowed. Peanut may be
 * referenced by the official service, but Squirrel Labs is the maintainer and funder.
 * Rejecting the old claims at source keeps every authored locale from regressing while the generated
 * SEO pipeline is cleared separately for public release.
 */
const prohibitedClaims = [
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
        // Interrogative FAQ/schema copy is still visible copy. Without this order, “Is Split open
        // source?” bypasses the statement-shaped rule above and leaks from an ungated base FAQ.
        label: FOSS_RELEASE_LABEL,
        pattern:
            /\b(?:is|isn['’]t|is not)\s+(?:Peanut Split|Split)\s+(?:an?\s+)?(?:free and open[- ]source|open[- ]source|FOSS|AGPL(?:-3\.0(?:-or-later)?)?)\b/giu,
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
    const normalized = normalizeMarketingCopy(text)
    for (const { label, pattern } of prohibitedClaims) {
        if (allowPublicSourceCandidate && label === FOSS_RELEASE_LABEL) continue
        for (const match of normalized.matchAll(pattern)) {
            found.push({ label, match: match[0] })
        }
    }
    return found
}

function findBoundaryPostureFailures(text, { candidate, gated }) {
    const found = findPostureFailures(text, { allowPublicSourceCandidate: candidate && gated })
    if (!candidate || gated) return found

    if (!found.some((failure) => failure.label === FOSS_RELEASE_LABEL)) {
        const match = normalizeMarketingCopy(text).match(PUBLIC_SOURCE_BOUNDARY_PATTERN)?.[0]
        if (match) found.push({ label: FOSS_RELEASE_LABEL, match })
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

function lineAt(source, index) {
    return source.slice(0, index).split('\n').length
}

function commentRanges(source) {
    const ranges = []
    for (const pattern of [/\{\/\*[\s\S]*?(?:\*\/|$)/gu, /<!--[\s\S]*?(?:-->|$)/gu]) {
        for (const match of source.matchAll(pattern)) ranges.push([match.index, match.index + match[0].length])
    }
    return ranges
}

function fencedCodeRanges(source) {
    const ranges = []
    const lines = source.matchAll(/^.*(?:\r?\n|$)/gmu)
    let fence = null
    for (const line of lines) {
        const marker = line[0].match(/^\s*(`{3,}|~{3,})/u)?.[1]
        if (!marker) continue
        if (fence === null) {
            fence = { character: marker[0], length: marker.length, start: line.index }
        } else if (marker[0] === fence.character && marker.length >= fence.length) {
            ranges.push([fence.start, line.index + line[0].length])
            fence = null
        }
    }
    if (fence !== null) ranges.push([fence.start, source.length])
    return ranges
}

function inRanges(index, ranges) {
    return ranges.some(([start, end]) => index >= start && index < end)
}

function maskRanges(source, ranges) {
    if (ranges.length === 0) return source
    // `String#matchAll` reports UTF-16 offsets. `split('')` deliberately uses the same units so an
    // emoji before a comment cannot shift the masked range onto rendered prose.
    const characters = source.split('')
    for (const [start, end] of ranges) {
        for (let index = start; index < end; index++) {
            if (characters[index] !== '\n' && characters[index] !== '\r') characters[index] = ' '
        }
    }
    return characters.join('')
}

/**
 * Split an MDX body at the only component allowed to carry pre-release public-source prose.
 * Returning the wrapper text itself would let a paragraph straddle the trust boundary, so tags
 * are consumed and the prose on either side is audited as separate segments.
 */
export function publicSourceBodySegments(source) {
    const segments = []
    const boundaryFailures = []
    const comments = commentRanges(source)
    const protectedRanges = [...comments, ...fencedCodeRanges(source)]
    const visibleSource = maskRanges(source, comments)
    // A root-level MDX component is the release boundary. Requiring its tag to own the line keeps
    // inline code, prose and examples from being mistaken for the component the renderer executes.
    const tags = [...source.matchAll(/^[\t ]*<\/?PublicSourceOnly\s*>[\t ]*(?:\r?\n|$)/gmu)].filter(
        (match) => !inRanges(match.index, protectedRanges)
    )
    const recognizedTagIndexes = new Set(tags.map((match) => match.index + match[0].indexOf('<')))
    for (const rawTag of source.matchAll(/<\/?PublicSourceOnly\b/gu)) {
        if (!inRanges(rawTag.index, protectedRanges) && !recognizedTagIndexes.has(rawTag.index)) {
            boundaryFailures.push({
                line: lineAt(source, rawTag.index),
                label: PUBLIC_SOURCE_WRAPPER_LABEL,
                match: 'PublicSourceOnly must be a standalone MDX block',
            })
        }
    }
    let depth = 0
    let cursor = 0

    for (const match of tags) {
        if (match.index > cursor) {
            segments.push({
                line: lineAt(source, cursor),
                text: visibleSource.slice(cursor, match.index),
                gated: depth === 1,
            })
        }

        const renderedTag = match[0].trim()
        const closing = renderedTag.startsWith('</')
        if ((!closing && depth !== 0) || (closing && depth !== 1)) {
            boundaryFailures.push({
                line: lineAt(source, match.index),
                label: PUBLIC_SOURCE_WRAPPER_LABEL,
                match: renderedTag,
            })
        }
        depth += closing ? -1 : 1
        if (depth < 0) depth = 0
        cursor = match.index + match[0].length
    }

    if (cursor < source.length) {
        segments.push({ line: lineAt(source, cursor), text: visibleSource.slice(cursor), gated: depth === 1 })
    }
    if (depth !== 0) {
        boundaryFailures.push({
            line: lineAt(source, source.length),
            label: PUBLIC_SOURCE_WRAPPER_LABEL,
            match: 'missing closing tag',
        })
    }

    return { segments, boundaryFailures }
}

/** Pure Markdown posture audit, exported so the release-boundary fixtures exercise the CLI logic. */
export function findMarkdownPostureFailures(source, { allowPublicSourceCandidate = false } = {}) {
    let parsed
    try {
        parsed = matter(source)
    } catch {
        return markdownParagraphs(source).flatMap(({ line, text }) =>
            findPostureFailures(text).map((failure) => ({ line, ...failure }))
        )
    }

    const failures = []
    const visitFrontmatter = (value, path, publicSourceField) => {
        if (typeof value === 'string') {
            for (const failure of findBoundaryPostureFailures(value, {
                candidate: allowPublicSourceCandidate,
                gated: publicSourceField,
            })) {
                failures.push({ line: `frontmatter.${path}`, ...failure })
            }
            return
        }
        if (Array.isArray(value)) {
            value.forEach((item, index) => visitFrontmatter(item, `${path}[${index}]`, publicSourceField))
            return
        }
        if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                if (!path && NON_COPY_FRONTMATTER_KEYS.has(key)) continue
                const childPath = path ? `${path}.${key}` : key
                visitFrontmatter(
                    child,
                    childPath,
                    publicSourceField || (!path && PUBLIC_SOURCE_FRONTMATTER_KEYS.has(key))
                )
            }
        }
    }
    visitFrontmatter(parsed.data, '', false)

    const frontmatterPrefix = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/u)?.[0] ?? ''
    const bodyStartLine = lineAt(source, frontmatterPrefix.length)
    const { segments, boundaryFailures } = publicSourceBodySegments(parsed.content)
    failures.push(
        ...boundaryFailures.map((failure) => ({ ...failure, line: bodyStartLine + Number(failure.line) - 1 }))
    )
    for (const segment of segments) {
        for (const paragraph of markdownParagraphs(segment.text)) {
            for (const failure of findBoundaryPostureFailures(paragraph.text, {
                candidate: allowPublicSourceCandidate,
                gated: segment.gated,
            })) {
                failures.push({ line: bodyStartLine + segment.line + paragraph.line - 2, ...failure })
            }
        }
    }
    return failures
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
    let frontmatter = {}
    try {
        frontmatter = matter(source).data
    } catch {
        // The content loader's parser test reports malformed YAML precisely. This audit still scans
        // the raw file below so malformed frontmatter cannot also become a posture bypass.
    }
    const allowPublicSourceCandidate =
        APPROVED_PUBLIC_SOURCE_CANDIDATES.has(local) &&
        frontmatter.releaseGate === 'public-source' &&
        Array.isArray(frontmatter.claims) &&
        frontmatter.claims.includes('public-source-and-self-hosting')

    for (const failure of findMarkdownPostureFailures(source, { allowPublicSourceCandidate })) {
        failures.push(`${local}:${failure.line} ${failure.label}: “${failure.match}”`)
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

// Keep this in lockstep with src/i18n/locales.ts. The audit runs without the TypeScript loader.
const DEFAULT_LOCALE = 'en'

/**
 * A `/new` link may only carry the `locale` param of the page that authors it, and the default
 * locale may not carry one at all.
 *
 * `proxy.ts` writes `?locale=` into the `ps-locale` cookie for a year without comparing it to the
 * one already stored, and `room.locale` is stamped from that cookie once and never re-inferred. So
 * an English page emitting `/new?locale=en` silently resets a Spanish or Portuguese reader's
 * language and turns their room — and its unfurl — English. `newRoomHref` already refuses to append
 * the default locale, but it only rewrites a bare `/new` pathname, which leaves an absolute CTA
 * authored inside generated content free to reintroduce the bug. This is that backstop.
 */
function auditNewLinkLocale(path, pageLocale) {
    const local = relative(root, path).replaceAll('\\', '/')
    const source = readFileSync(path, 'utf8')
    const lines = source.split('\n')
    lines.forEach((text, index) => {
        for (const match of text.matchAll(/(?:https?:\/\/[^\s"'<>]*peanutsplit\.com)?\/new\?[^\s"'<>)]*/gu)) {
            const query = match[0].slice(match[0].indexOf('?') + 1)
            const carried = new URLSearchParams(query.replaceAll('&amp;', '&')).get('locale')
            if (carried === null) continue
            const line = `${local}:${index + 1}`
            if (pageLocale === DEFAULT_LOCALE) {
                failures.push(
                    `${line} a ${DEFAULT_LOCALE} page puts locale= on a /new link, which overwrites the reader's stored language: “${match[0]}”`
                )
            } else if (carried !== pageLocale) {
                failures.push(`${line} a ${pageLocale} page puts locale=${carried} on a /new link: “${match[0]}”`)
            }
        }
    })
}

/** The generated artifact names its locale in frontmatter; the filename is the mirror's own key. */
function localeOfGeneratedPage(path) {
    const source = readFileSync(path, 'utf8')
    try {
        const declared = matter(source).data?.lang
        if (typeof declared === 'string' && declared.length > 0) return declared
    } catch {
        // Fall through to the filename, which the mirror guarantees.
    }
    return basename(path, extname(path))
}

for (const path of filesBelow(resolve(root, 'src/i18n/messages'), new Set(['.json']))) auditJson(path)
for (const path of filesBelow(resolve(root, 'src/content'), new Set(['.md', '.mdx']), isInputLayer)) {
    auditMarkdown(path)
    auditNewLinkLocale(path, basename(path, extname(path)))
}
// The posture audit over generated SEO stays behind the flag — it is mono's artifact and mono owns
// its wording. The /new locale check does not: those bytes are what production serves, the bug is
// invisible to a reader, and it costs one regex per line.
for (const path of filesBelow(resolve(root, 'src/generated/seo'), new Set(['.md', '.mdx']))) {
    if (includeGenerated) auditMarkdown(path)
    auditNewLinkLocale(path, localeOfGeneratedPage(path))
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
