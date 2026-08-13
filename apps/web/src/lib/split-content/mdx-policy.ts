import type { Locale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import { CANONICAL_ORIGIN, isProductHost } from '@/lib/domains'

interface MdxNode {
    type?: unknown
    name?: unknown
    value?: unknown
    url?: unknown
    depth?: unknown
    ordered?: unknown
    attributes?: unknown
    children?: unknown
    data?: { estree?: MdxProgram }
    position?: { start?: { line?: number } }
}

/** The estree `Program` MDX hangs off an expression node. `body` is the executable half. */
interface MdxProgram {
    type?: unknown
    body?: unknown
    comments?: unknown
}

interface MdxAttribute {
    type?: unknown
    name?: unknown
    value?: unknown
}

export interface SplitMdxPolicyOptions {
    locale: Locale
    guidePaths: readonly string[]
}

export class SplitMdxPolicyError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SplitMdxPolicyError'
    }
}

/**
 * The Markdown grammar a published guide may use — an allowlist, not a denylist, because the
 * bodies are generated in another repository and arrive here as bytes. Anything absent is a
 * compile error, so widening this set is a deliberate act with a matching component override.
 *
 * `blockquote`, `emphasis` and the three `table*` nodes were added on 2026-08-13 for the
 * 15-guide cohort: the competitor guides quote their sources verbatim in blockquotes, attribute
 * each quote in an emphasised citation line, and one guide compares four cost splits in tables.
 * Still deliberately absent, and still covered by rejection tests: `image`, `html`, `code`,
 * `inlineCode`, `mdxjsEsm`.
 */
const MARKDOWN_NODES = new Set([
    'root',
    'paragraph',
    'text',
    'heading',
    'strong',
    'emphasis',
    'list',
    'listItem',
    'link',
    'blockquote',
    'table',
    'tableRow',
    'tableCell',
])
const EXPRESSION_NODES = new Set(['mdxFlowExpression', 'mdxTextExpression'])
const COMPONENT_ATTRIBUTES = {
    Steps: ['title'],
    Step: ['title'],
    Callout: ['type'],
    CTA: ['text', 'subtitle', 'href', 'variant'],
    RelatedPages: ['title'],
    RelatedLink: ['href'],
} as const

type ComponentName = keyof typeof COMPONENT_ATTRIBUTES

function policyError(message: string, node: MdxNode): never {
    const line = node.position?.start?.line
    throw new SplitMdxPolicyError(`${message}${line ? ` at line ${line}` : ''}`)
}

function childrenOf(node: MdxNode): MdxNode[] {
    if (node.children === undefined) return []
    if (!Array.isArray(node.children)) policyError('Split MDX node children must be an array', node)
    return node.children as MdxNode[]
}

function componentAttributes(node: MdxNode, component: ComponentName): Record<string, string> {
    if (!Array.isArray(node.attributes)) policyError(`Split MDX ${component} attributes must be an array`, node)

    const attributes: Record<string, string> = {}
    for (const candidate of node.attributes as MdxAttribute[]) {
        if (
            candidate.type !== 'mdxJsxAttribute' ||
            typeof candidate.name !== 'string' ||
            typeof candidate.value !== 'string'
        ) {
            policyError(`Split MDX ${component} accepts only literal string attributes`, node)
        }
        if (candidate.name in attributes) policyError(`Split MDX ${component} repeats ${candidate.name}`, node)
        attributes[candidate.name] = candidate.value
    }

    const expected = COMPONENT_ATTRIBUTES[component]
    const actual = Object.keys(attributes).sort()
    const orderedExpected = [...expected].sort()
    if (JSON.stringify(actual) !== JSON.stringify(orderedExpected)) {
        policyError(`Split MDX ${component} must have exactly: ${expected.join(', ')}`, node)
    }
    return attributes
}

function checkedGuideHref(href: string, locale: Locale, guidePaths: ReadonlySet<string>, node: MdxNode): void {
    if (!href.startsWith('/') || href.startsWith('//') || !guidePaths.has(href)) {
        policyError('Split MDX link must target a manifest-backed guide path', node)
    }
    if (!href.startsWith(localizedPath('/guides/', locale))) {
        policyError('Split MDX link must stay in the current guide locale', node)
    }
}

/**
 * A prose link is one of two things: a sibling guide in this locale, or an outbound citation.
 *
 * Citations are load-bearing. The competitor guides quote Splitwise and Settle Up verbatim and
 * name the page each quote came from; without the link the quote is an unsourced claim, which is
 * the one thing the claims discipline forbids. So the rule is by URL scheme, not by host: a host
 * allowlist would freeze against a corpus that keeps growing, which is exactly how the node
 * allowlist came to reject eight of fifteen guides.
 *
 * What stays rejected: every non-http(s) scheme (`javascript:`, `data:`, `mailto:`), embedded
 * credentials, and any link to a host that answers as the product — reaching `/new` is the CTA's
 * job and only the CTA's, so a guide cannot smuggle its own entry point past the CTA's stricter
 * checks. That test is by host, not by origin: `http://peanutsplit.com/new`,
 * `https://www.peanutsplit.com/new` and the `split.peanut.me` alias all land on the same product,
 * so all of them are the same bypass.
 */
function checkedProseHref(href: string, locale: Locale, guidePaths: ReadonlySet<string>, node: MdxNode): void {
    let url: URL
    try {
        url = new URL(href)
    } catch {
        // Not absolute, so a manifest-backed sibling guide is the only shape left.
        checkedGuideHref(href, locale, guidePaths, node)
        return
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        policyError('Split MDX link must be an http(s) citation or a manifest-backed guide path', node)
    }
    if (url.username || url.password) policyError('Split MDX link must not carry credentials', node)
    if (isProductHost(url.hostname)) policyError('Split MDX reaches the product through a CTA, not a link', node)
}

/**
 * MDX expressions carry the dated provenance markers that sit above the verbatim competitor
 * quotes in the byte-pinned bodies: a braced block comment recording the date each source page was
 * opened. They are admitted on exactly one condition — the parsed program has no executable
 * content at all. `data.estree.body` is that content, so an empty body plus at least one comment
 * means the expression is a comment and nothing else.
 *
 * This rejects an expression that reads `process.env.SECRET` (one body statement), a comment
 * welded to a call, and a bare empty expression (inert, but not a comment, and no reason to allow
 * it). Note the markers do not survive compilation either way — a block comment emits no
 * JavaScript — so admitting them makes the page render rather than putting the marker in the HTML.
 */
function checkedCommentExpression(node: MdxNode): void {
    const estree = node.data?.estree
    if (
        !estree ||
        estree.type !== 'Program' ||
        !Array.isArray(estree.body) ||
        estree.body.length > 0 ||
        !Array.isArray(estree.comments) ||
        estree.comments.length === 0
    ) {
        policyError('Split MDX expressions may hold a comment and nothing else', node)
    }
}

function checkedCtaHref(href: string, locale: Locale, node: MdxNode): void {
    let url: URL
    try {
        url = new URL(href)
    } catch {
        policyError('Split MDX CTA href must be an absolute product URL', node)
    }

    if (
        url.origin !== CANONICAL_ORIGIN ||
        url.pathname !== '/new' ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.getAll('locale').length !== 1 ||
        url.searchParams.get('locale') !== locale
    ) {
        policyError('Split MDX CTA must point to the canonical /new in the guide locale', node)
    }
}

function validateComponent(node: MdxNode, locale: Locale, guidePaths: ReadonlySet<string>): ComponentName {
    if (typeof node.name !== 'string' || !(node.name in COMPONENT_ATTRIBUTES)) {
        policyError('Split MDX contains an unknown or lowercase element', node)
    }
    const component = node.name as ComponentName
    const attributes = componentAttributes(node, component)

    if (component === 'Callout' && attributes.type !== 'info') {
        policyError("Split MDX Callout type must be 'info'", node)
    }
    if (component === 'CTA') {
        if (attributes.variant !== 'card') policyError("Split MDX CTA variant must be 'card'", node)
        checkedCtaHref(attributes.href, locale, node)
        if (childrenOf(node).length > 0) policyError('Split MDX CTA must be self-closing', node)
    }
    if (component === 'RelatedLink') checkedGuideHref(attributes.href, locale, guidePaths, node)
    return component
}

function validateNode(node: MdxNode, locale: Locale, guidePaths: ReadonlySet<string>): void {
    if (typeof node.type !== 'string') policyError('Split MDX contains a malformed AST node', node)

    let component: ComponentName | undefined
    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        component = validateComponent(node, locale, guidePaths)
    } else if (EXPRESSION_NODES.has(node.type)) {
        checkedCommentExpression(node)
    } else if (!MARKDOWN_NODES.has(node.type)) {
        policyError(`Split MDX node type is not allowed: ${node.type}`, node)
    }

    if (node.type === 'heading' && node.depth !== 2 && node.depth !== 3) {
        policyError('Split MDX headings are limited to H2 and H3', node)
    }
    if (node.type === 'list' && node.ordered !== false) {
        policyError('Split MDX permits only unordered Markdown lists', node)
    }
    if (node.type === 'link') {
        if (typeof node.url !== 'string') policyError('Split MDX link is missing its literal target', node)
        checkedProseHref(node.url, locale, guidePaths, node)
    }

    const children = childrenOf(node)
    if (component === 'Steps' && children.some((child) => child.name !== 'Step')) {
        policyError('Split MDX Steps may contain only Step components', node)
    }
    if (component === 'RelatedPages' && children.some((child) => child.name !== 'RelatedLink')) {
        policyError('Split MDX RelatedPages may contain only RelatedLink components', node)
    }
    for (const child of children) validateNode(child, locale, guidePaths)
}

/** Remark transformer: parse first, reject anything outside the V1 grammar, then compile. */
export function remarkSplitMdxPolicy(options: SplitMdxPolicyOptions) {
    const guidePaths = new Set(options.guidePaths)
    return (tree: unknown): void => validateNode(tree as MdxNode, options.locale, guidePaths)
}
