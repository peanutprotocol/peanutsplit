import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'
import { HREFLANG, LOCALES, type Locale } from '@/i18n/locales'
import { contentUrl, guidePath } from './urls'

const PUBLISHED_PREFIX = 'split-content/published/'
const GENERATED_ROOT = path.join(process.cwd(), 'src/generated/seo')
const SHA256 = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const GENERATED_FROM_FIELDS = ['template', 'data', 'product', 'workflow', 'context', 'guidelines'] as const

const manifestEntrySchema = z
    .object({
        content_type: z.literal('guide'),
        slug: z.string().regex(SLUG),
        locale: z.enum(LOCALES),
        public_path: z.string(),
        output_path: z.string(),
        output_sha256: z.string().regex(SHA256),
        source_input_paths: z.array(z.string().min(1)).min(1),
    })
    .strict()

const manifestSchema = z
    .object({
        schema_version: z.literal(1),
        source_repository: z.literal('peanutprotocol/mono'),
        source_commit: z.string().regex(COMMIT),
        content_root: z.literal('split-content'),
        locales: z.tuple([z.literal('en'), z.literal('es-419'), z.literal('pt-br')]),
        input_sha256: z.record(z.string(), z.string().regex(SHA256)),
        entries: z.array(manifestEntrySchema),
    })
    .strict()

export type SplitGuideManifestEntry = z.infer<typeof manifestEntrySchema>
export type SplitContentManifest = z.infer<typeof manifestSchema>

export interface SplitGuide {
    entry: SplitGuideManifestEntry
    locale: Locale
    slug: string
    href: string
    title: string
    description: string
    author: string
    date: string
    tags: string[]
    claims: string[]
    body: string
}

export class SplitContentArtifactError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SplitContentArtifactError'
    }
}

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

function artifactError(message: string): never {
    throw new SplitContentArtifactError(message)
}

function artifactPath(entry: SplitGuideManifestEntry, root: string): string {
    if (!entry.output_path.startsWith(PUBLISHED_PREFIX)) {
        artifactError(`output_path is outside ${PUBLISHED_PREFIX}: ${entry.output_path}`)
    }

    const relative = entry.output_path.slice(PUBLISHED_PREFIX.length)
    const resolvedRoot = path.resolve(root)
    const resolved = path.resolve(resolvedRoot, relative)
    if (!resolved.startsWith(`${resolvedRoot}${path.sep}`))
        artifactError(`output_path escapes artifact root: ${relative}`)
    return resolved
}

function validateEntry(entry: SplitGuideManifestEntry): void {
    const expectedPublicPath = guidePath(entry.locale, entry.slug)
    const expectedOutputPath = `${PUBLISHED_PREFIX}guides/${entry.slug}/${entry.locale}.md`
    if (entry.public_path !== expectedPublicPath) {
        artifactError(`public_path mismatch for ${entry.locale}/${entry.slug}`)
    }
    if (entry.output_path !== expectedOutputPath) {
        artifactError(`output_path mismatch for ${entry.locale}/${entry.slug}`)
    }
}

function validateMatrix(entries: SplitGuideManifestEntry[]): void {
    const bySlug = new Map<string, Set<Locale>>()
    for (const entry of entries) {
        validateEntry(entry)
        const locales = bySlug.get(entry.slug) ?? new Set<Locale>()
        if (locales.has(entry.locale)) artifactError(`duplicate manifest entry for ${entry.locale}/${entry.slug}`)
        locales.add(entry.locale)
        bySlug.set(entry.slug, locales)
    }

    for (const [slug, locales] of bySlug) {
        if (LOCALES.some((locale) => !locales.has(locale))) {
            artifactError(`guide ${slug} must contain the exact en/es-419/pt-br locale matrix`)
        }
    }
}

function validateManifestProvenance(manifest: SplitContentManifest): void {
    const inputPaths = Object.keys(manifest.input_sha256)
    const orderedInputPaths = [...inputPaths].sort((left, right) => left.localeCompare(right))
    if (JSON.stringify(inputPaths) !== JSON.stringify(orderedInputPaths)) {
        artifactError('manifest input_sha256 keys must be deterministically sorted')
    }

    const referenced = [...new Set(manifest.entries.flatMap((entry) => entry.source_input_paths))].sort((left, right) =>
        left.localeCompare(right)
    )
    if (JSON.stringify(referenced) !== JSON.stringify(inputPaths)) {
        artifactError('manifest input_sha256 keys must exactly match the per-output source_input_paths union')
    }
}

/**
 * The generated destination is absent on renderer-only branches. Once a manifest exists, every
 * malformed field is a release error rather than an empty-site fallback.
 */
export function loadSplitContentManifest(root: string = GENERATED_ROOT): SplitContentManifest | null {
    const manifestPath = path.join(root, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return null

    let raw: unknown
    try {
        raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
        artifactError('generated Split manifest is not valid JSON')
    }

    const parsed = manifestSchema.safeParse(raw)
    if (!parsed.success) artifactError(`generated Split manifest failed schema v1: ${parsed.error.message}`)
    validateMatrix(parsed.data.entries)
    validateManifestProvenance(parsed.data)
    // A manifest is one committed artifact, not a menu of independently trustworthy locales.
    // Validate every output before exposing even one route so drift in PT-BR cannot hide behind
    // a request for English.
    for (const entry of parsed.data.entries) parseGuide(entry, root)
    return parsed.data
}

function asDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    return typeof value === 'string' ? value : ''
}

function stringList(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        artifactError(`guide frontmatter ${field} must be a string list`)
    }
    return value
}

function generatedFromPaths(value: unknown, outputPath: string): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        artifactError(`guide frontmatter generated_from must be the known provenance block: ${outputPath}`)
    }

    const generatedFrom = value as Record<string, unknown>
    if (JSON.stringify(Object.keys(generatedFrom)) !== JSON.stringify(GENERATED_FROM_FIELDS)) {
        artifactError(`guide frontmatter generated_from fields or ordering changed: ${outputPath}`)
    }

    const scalar = (field: 'template' | 'workflow'): string => {
        const path = generatedFrom[field]
        if (typeof path !== 'string' || !path) {
            artifactError(`guide frontmatter generated_from.${field} must be a path: ${outputPath}`)
        }
        return path
    }
    const paths = (field: 'data' | 'product' | 'context' | 'guidelines'): string[] =>
        stringList(generatedFrom[field], `generated_from.${field}`)

    return [
        scalar('template'),
        ...paths('data'),
        ...paths('product'),
        scalar('workflow'),
        ...paths('context'),
        ...paths('guidelines'),
    ]
}

function parseGuide(entry: SplitGuideManifestEntry, root: string): SplitGuide {
    const filePath = artifactPath(entry, root)
    let bytes: Buffer
    try {
        bytes = fs.readFileSync(filePath)
    } catch {
        artifactError(`manifest output is missing: ${entry.output_path}`)
    }
    if (sha256(bytes) !== entry.output_sha256) artifactError(`output hash mismatch: ${entry.output_path}`)

    let parsed: matter.GrayMatterFile<string>
    try {
        parsed = matter(bytes.toString('utf8'))
    } catch {
        artifactError(`guide frontmatter is invalid: ${entry.output_path}`)
    }

    const data = parsed.data as Record<string, unknown>
    const title = typeof data.title === 'string' ? data.title.trim() : ''
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    const author = typeof data.author === 'string' ? data.author.trim() : ''
    const date = asDate(data.date)
    const body = parsed.content.trim()
    if (!title || !description || !author || !DATE.test(date) || !body) {
        artifactError(`guide frontmatter is missing required metadata: ${entry.output_path}`)
    }
    if (data.slug !== entry.slug || data.type !== 'guide' || data.lang !== entry.locale) {
        artifactError(`guide frontmatter disagrees with manifest identity: ${entry.output_path}`)
    }
    if (data.canonical !== contentUrl(entry.public_path)) {
        artifactError(`guide canonical disagrees with its derived public URL: ${entry.output_path}`)
    }
    if (/^\s*#\s+/m.test(body)) artifactError(`guide body must not own an H1: ${entry.output_path}`)

    const generatedPaths = generatedFromPaths(data.generated_from, entry.output_path)
    if (JSON.stringify(generatedPaths) !== JSON.stringify(entry.source_input_paths)) {
        artifactError(`guide generated_from paths disagree with manifest source_input_paths: ${entry.output_path}`)
    }

    const schemaTypes = stringList(data.schema_types, 'schema_types')
    if (!schemaTypes.includes('BlogPosting')) artifactError(`guide schema_types must include BlogPosting`)

    return {
        entry,
        locale: entry.locale,
        slug: entry.slug,
        href: entry.public_path,
        title,
        description,
        author,
        date,
        tags: stringList(data.tags, 'tags'),
        claims: stringList(data.claims, 'claims'),
        body,
    }
}

function orderedEntries(manifest: SplitContentManifest): SplitGuideManifestEntry[] {
    return [...manifest.entries].sort(
        (left, right) =>
            left.slug.localeCompare(right.slug) || LOCALES.indexOf(left.locale) - LOCALES.indexOf(right.locale)
    )
}

export function listSplitGuides(locale: Locale, root: string = GENERATED_ROOT): SplitGuide[] {
    const manifest = loadSplitContentManifest(root)
    if (!manifest) return []
    return orderedEntries(manifest)
        .filter((entry) => entry.locale === locale)
        .map((entry) => parseGuide(entry, root))
}

export function getSplitGuide(locale: Locale, slug: string, root: string = GENERATED_ROOT): SplitGuide | null {
    if (!SLUG.test(slug)) return null
    return listSplitGuides(locale, root).find((guide) => guide.slug === slug) ?? null
}

export function splitGuidePaths(root: string = GENERATED_ROOT): string[] {
    const manifest = loadSplitContentManifest(root)
    if (!manifest) return []
    return [...manifest.entries.map((entry) => entry.public_path)].sort((left, right) => left.localeCompare(right))
}

export function guideAlternates(slug: string, root: string = GENERATED_ROOT): Record<string, string> | undefined {
    const manifest = loadSplitContentManifest(root)
    if (!manifest) return undefined
    const entries = manifest.entries.filter((entry) => entry.slug === slug)
    if (entries.length < 2) return undefined

    const languages: Record<string, string> = {}
    for (const entry of orderedEntries({ ...manifest, entries })) {
        languages[HREFLANG[entry.locale]] = entry.public_path
    }
    if (entries.some((entry) => entry.locale === 'en')) languages['x-default'] = guidePath('en', slug)
    return languages
}
