import type { Locale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import { CANONICAL_ORIGIN } from '@/lib/domains'

interface MdxNode {
    type?: unknown
    name?: unknown
    value?: unknown
    url?: unknown
    depth?: unknown
    ordered?: unknown
    attributes?: unknown
    children?: unknown
    position?: { start?: { line?: number } }
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

const MARKDOWN_NODES = new Set(['root', 'paragraph', 'text', 'heading', 'strong', 'list', 'listItem', 'link'])
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
        checkedGuideHref(node.url, locale, guidePaths, node)
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
