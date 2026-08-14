import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'
import { HREFLANG, LOCALES, type Locale } from '@/i18n/locales'
import { absoluteUrl } from '@/lib/seo'
import { readSplitContentManifestBytes, SPLIT_CONTENT_GENERATED_ROOT as GENERATED_ROOT } from './manifest-attestation'
import { guidePath, splitCalculatorPath, splitHubPath, splitToolsHubPath } from './urls'

const PUBLISHED_PREFIX = 'split-content/published/'
const SHA256 = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CLAIM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const LEGACY_PATH = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/
const RESERVED_LEGACY_PREFIXES = ['/api', '/app', '/import', '/new', '/r']
const GENERATED_FROM_FIELDS = ['template', 'data', 'product', 'workflow', 'context', 'guidelines'] as const
const MANIFEST_FIELDS = [
    'schema_version',
    'source_repository',
    'source_commit',
    'content_root',
    'locales',
    'input_sha256',
    'entries',
] as const
const V2_ENTRY_FIELDS = [
    'content_type',
    'slug',
    'locale',
    'public_path',
    'legacy_paths',
    'output_path',
    'output_sha256',
    'source_input_paths',
] as const
const PAYLOAD_FIELDS = [
    'payload_schema_version',
    'type',
    'slug',
    'lang',
    'title',
    'description',
    'canonical',
    'alternates',
    'claims',
    'schema_types',
    'generated_from',
    'generated_at',
    'content',
] as const
const CONTENT_TYPE_RANK = ['guide', 'hub', 'tools_hub', 'calculator'] as const
const CALCULATOR_SLUGS = ['rent-split-calculator', 'mileage-split-calculator'] as const
const MILEAGE_CODES = ['AU', 'BE', 'BR', 'CA', 'FR', 'DE', 'IE', 'NL', 'PL', 'ES', 'GB', 'US'] as const

const manifestEntryV1Schema = z
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

const manifestEntryV2Fields = {
    slug: z.string().regex(SLUG),
    locale: z.enum(LOCALES),
    public_path: z.string(),
    legacy_paths: z.array(z.string()),
    output_path: z.string(),
    output_sha256: z.string().regex(SHA256),
    source_input_paths: z.array(z.string().min(1)).min(1),
}

const manifestEntryV2Schema = z.discriminatedUnion('content_type', [
    z.object({ content_type: z.literal('guide'), ...manifestEntryV2Fields }).strict(),
    z.object({ content_type: z.literal('hub'), ...manifestEntryV2Fields }).strict(),
    z.object({ content_type: z.literal('tools_hub'), ...manifestEntryV2Fields }).strict(),
    z.object({ content_type: z.literal('calculator'), ...manifestEntryV2Fields }).strict(),
])

const manifestBaseFields = {
    source_repository: z.literal('peanutprotocol/mono'),
    source_commit: z.string().regex(COMMIT),
    content_root: z.literal('split-content'),
    locales: z.tuple([z.literal('en'), z.literal('es-419'), z.literal('pt-br')]),
    input_sha256: z.record(z.string(), z.string().regex(SHA256)),
}

const manifestSchemaV1 = z
    .object({ schema_version: z.literal(1), ...manifestBaseFields, entries: z.array(manifestEntryV1Schema).min(1) })
    .strict()
const manifestSchemaV2 = z
    .object({ schema_version: z.literal(2), ...manifestBaseFields, entries: z.array(manifestEntryV2Schema).min(1) })
    .strict()
const manifestSchema = z.discriminatedUnion('schema_version', [manifestSchemaV1, manifestSchemaV2])

const generatedFromSchema = z
    .object({
        template: z.string().min(1),
        data: z.array(z.string().min(1)).min(1),
        product: z.array(z.string().min(1)).min(1),
        workflow: z.string().min(1),
        context: z.array(z.string().min(1)).min(1),
        guidelines: z.array(z.string().min(1)).min(1),
    })
    .strict()

const primaryActionSchema = z
    .object({ kind: z.literal('app_new'), label: z.string().min(1), hint: z.string().min(1) })
    .strict()
const appCardSchema = z
    .object({
        title: z.string().min(1),
        body: z.string().min(1),
        label: z.string().min(1),
        hint: z.string().min(1),
        action: z.literal('app_new'),
    })
    .strict()
const hubCardSchema = z
    .object({
        id: z.string().regex(SLUG),
        kind: z.enum(['guide', 'alternative', 'tools_hub']),
        locale: z.enum(LOCALES),
        title: z.string().min(1),
        description: z.string().min(1),
        date: z.string().regex(DATE).nullable(),
        tags: z.array(z.string().min(1)),
        legacy_path: z.string(),
        public_path: z.string(),
    })
    .strict()
const hubContentSchema = z
    .object({
        intro: z.array(z.string().min(1)).min(1),
        primary_action: primaryActionSchema,
        cards: z.array(hubCardSchema).min(1),
    })
    .strict()
const toolsHubContentSchema = z
    .object({
        intro: z.array(z.string().min(1)).min(1),
        app_card: appCardSchema,
        calculator_slugs: z.tuple([z.literal('rent-split-calculator'), z.literal('mileage-split-calculator')]),
    })
    .strict()

const textSectionSchema = z.object({ title: z.string().min(1), body: z.string().min(1) }).strict()
const textListSectionSchema = z.object({ title: z.string().min(1), body: z.array(z.string().min(1)).min(1) }).strict()
const calculatorActionSchema = appCardSchema
const relatedLinkSchema = z
    .object({ label: z.string().min(1), legacy_path: z.string(), public_path: z.string() })
    .strict()
const calculatorCopySchema = z
    .object({
        intro: z.array(z.string().min(1)).min(1),
        result: z
            .object({
                title: z.string().min(1),
                hint: z.string().min(1),
                rounding_note: z.string().min(1),
                copy_label: z.string().min(1),
                copy_done: z.string().min(1),
            })
            .strict(),
        method: textListSectionSchema.nullable(),
        concession: textSectionSchema,
        good_to_know: textListSectionSchema,
        cta: calculatorActionSchema,
        faq_title: z.string().min(1),
        faqs: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) }).strict()).min(1),
        related: z.array(relatedLinkSchema).min(1).max(3),
    })
    .strict()
const mileageRowSchema = z
    .object({
        code: z.string(),
        label: z.string().min(1),
        unit: z.enum(['km', 'mile']),
        rate_decimal: z
            .string()
            .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
            .nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        note: z.string().min(1),
        source_label: z.string().min(1),
        source_url: z.string().url(),
    })
    .strict()
const mileageDataSchema = z
    .object({
        version: z.string().min(1),
        retrieved_at: z.string().regex(DATE),
        rows: z.array(mileageRowSchema).length(MILEAGE_CODES.length),
    })
    .strict()
const calculatorContentSchema = z
    .object({
        engine: z.enum(['rent_split_v1', 'mileage_split_v1']),
        copy: calculatorCopySchema,
        data: mileageDataSchema.nullable(),
    })
    .strict()

const payloadBaseFields = {
    payload_schema_version: z.literal(1),
    slug: z.string().regex(SLUG),
    lang: z.enum(LOCALES),
    title: z.string().min(1),
    description: z.string().min(1),
    canonical: z.string().url(),
    alternates: z.record(z.string(), z.string()),
    claims: z.array(z.string().regex(CLAIM)).min(1),
    schema_types: z.array(z.string().min(1)).min(1),
    generated_from: generatedFromSchema,
    generated_at: z.string().regex(DATE),
}
const { payload_schema_version: payloadVersionSchema, ...payloadAfterTypeFields } = payloadBaseFields
const hubPayloadSchema = z
    .object({
        payload_schema_version: payloadVersionSchema,
        type: z.literal('hub'),
        ...payloadAfterTypeFields,
        content: hubContentSchema,
    })
    .strict()
const toolsHubPayloadSchema = z
    .object({
        payload_schema_version: payloadVersionSchema,
        type: z.literal('tools_hub'),
        ...payloadAfterTypeFields,
        content: toolsHubContentSchema,
    })
    .strict()
const calculatorPayloadSchema = z
    .object({
        payload_schema_version: payloadVersionSchema,
        type: z.literal('calculator'),
        ...payloadAfterTypeFields,
        content: calculatorContentSchema,
    })
    .strict()
const structuredPayloadSchema = z.discriminatedUnion('type', [
    hubPayloadSchema,
    toolsHubPayloadSchema,
    calculatorPayloadSchema,
])

export type SplitGuideManifestEntry =
    z.infer<typeof manifestEntryV1Schema> | Extract<z.infer<typeof manifestEntryV2Schema>, { content_type: 'guide' }>
export type SplitContentManifestEntry = z.infer<typeof manifestEntryV1Schema> | z.infer<typeof manifestEntryV2Schema>
export type SplitContentManifest = z.infer<typeof manifestSchema>
export type SplitHubPayload = z.infer<typeof hubPayloadSchema>
export type SplitToolsHubPayload = z.infer<typeof toolsHubPayloadSchema>
export type SplitCalculatorPayload = z.infer<typeof calculatorPayloadSchema>
export type SplitStructuredPayload = z.infer<typeof structuredPayloadSchema>

export interface SplitGuide {
    entry: SplitGuideManifestEntry
    locale: Locale
    slug: string
    href: string
    title: string
    description: string
    author: string
    date: string
    generatedAt: string
    tags: string[]
    claims: string[]
    body: string
}

export interface SplitStructuredPage<Payload extends SplitStructuredPayload = SplitStructuredPayload> {
    entry: Extract<z.infer<typeof manifestEntryV2Schema>, { content_type: Payload['type'] }>
    payload: Payload
}

export class SplitContentArtifactError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SplitContentArtifactError'
    }
}

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')
const compareAscii = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

function artifactError(message: string): never {
    throw new SplitContentArtifactError(message)
}

function assertExactOrderedKeys(
    value: unknown,
    expected: readonly string[],
    label: string
): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) artifactError(`${label} must be an object`)
    const actual = Object.keys(value)
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        artifactError(`${label} fields must be exactly and canonically ordered: ${expected.join(', ')}`)
    }
}

function assertTrimmedStringValues(value: unknown, label: string): void {
    if (typeof value === 'string') {
        if (!value || value.trim() !== value) artifactError(`${label} must contain only non-empty trimmed strings`)
        return
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertTrimmedStringValues(item, `${label}[${index}]`))
        return
    }
    if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, item]) => assertTrimmedStringValues(item, `${label}.${key}`))
    }
}

function assertExactArray(actual: readonly string[], expected: readonly string[], label: string): void {
    if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
        artifactError(`${label} must be exactly: ${expected.join(', ')}`)
    }
}

function assertDate(value: string, label: string): void {
    if (!DATE.test(value)) artifactError(`${label} must be an ISO calendar date`)
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
        artifactError(`${label} must be an ISO calendar date`)
    }
}

function assertUnique(values: readonly string[], label: string): void {
    if (new Set(values).size !== values.length) artifactError(`${label} must not contain duplicates`)
}

function assertLegacyPath(value: string, label: string): void {
    if (!LEGACY_PATH.test(value) || (value !== '/' && value.endsWith('/'))) {
        artifactError(`${label} must be a normalized root-relative legacy path`)
    }
    if (RESERVED_LEGACY_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))) {
        artifactError(`${label} is in a product or API namespace`)
    }
}

function assertPublicPath(value: string, label: string): void {
    if (!LEGACY_PATH.test(value) || value === '/' || value.endsWith('/')) {
        artifactError(`${label} must be a normalized root-relative public path`)
    }
}

function assertSourcePath(value: string, label: string): void {
    if (
        !/^[A-Za-z0-9._/-]+$/.test(value) ||
        value.startsWith('/') ||
        value.includes('\\') ||
        path.posix.normalize(value) !== value ||
        value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    ) {
        artifactError(`${label} must be a normalized repository path`)
    }
    if (
        (!value.startsWith('split-content/_system/') && !value.startsWith('split-content/product/')) ||
        value.startsWith('split-content/_system/generated/')
    ) {
        artifactError(`${label} is outside the source-input allowlist`)
    }
}

function artifactPath(entry: SplitContentManifestEntry, root: string): string {
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

function readOutput(entry: SplitContentManifestEntry, root: string, strictFile = false): Buffer {
    const filePath = artifactPath(entry, root)
    let bytes: Buffer
    try {
        if (strictFile) {
            const stats = fs.lstatSync(filePath)
            if (stats.isSymbolicLink() || !stats.isFile() || (stats.mode & 0o111) !== 0) {
                artifactError(`manifest output must be a regular non-executable file: ${entry.output_path}`)
            }
        }
        bytes = fs.readFileSync(filePath)
    } catch (error) {
        if (error instanceof SplitContentArtifactError) throw error
        artifactError(`manifest output is missing: ${entry.output_path}`)
    }
    if (sha256(bytes) !== entry.output_sha256) artifactError(`output hash mismatch: ${entry.output_path}`)
    return bytes
}

function validateV1Matrix(entries: z.infer<typeof manifestEntryV1Schema>[]): void {
    const bySlug = new Map<string, Set<Locale>>()
    for (const entry of entries) {
        const expectedPublicPath = guidePath(entry.locale, entry.slug)
        const expectedOutputPath = `${PUBLISHED_PREFIX}guides/${entry.slug}/${entry.locale}.md`
        if (entry.public_path !== expectedPublicPath)
            artifactError(`public_path mismatch for ${entry.locale}/${entry.slug}`)
        if (entry.output_path !== expectedOutputPath)
            artifactError(`output_path mismatch for ${entry.locale}/${entry.slug}`)
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

function expectedV2Paths(entry: z.infer<typeof manifestEntryV2Schema>): { publicPath: string; outputPath: string } {
    if (entry.content_type === 'guide') {
        return {
            publicPath: guidePath(entry.locale, entry.slug),
            outputPath: `${PUBLISHED_PREFIX}guides/${entry.slug}/${entry.locale}.md`,
        }
    }
    if (entry.content_type === 'hub') {
        return {
            publicPath: splitHubPath(entry.locale),
            outputPath: `${PUBLISHED_PREFIX}hubs/split/${entry.locale}.json`,
        }
    }
    if (entry.content_type === 'tools_hub') {
        return { publicPath: splitToolsHubPath(), outputPath: `${PUBLISHED_PREFIX}tools-hubs/tools/en.json` }
    }
    return {
        publicPath: splitCalculatorPath(entry.slug),
        outputPath: `${PUBLISHED_PREFIX}calculators/${entry.slug}/en.json`,
    }
}

function validateV2Matrix(entries: z.infer<typeof manifestEntryV2Schema>[]): void {
    const groups = new Map<string, Locale[]>()
    const publicPaths: string[] = []
    const outputPaths: string[] = []
    const legacyPaths: string[] = []

    for (const entry of entries) {
        if (entry.content_type === 'hub' && entry.slug !== 'split') artifactError('schema v2 hub slug must be split')
        if (entry.content_type === 'tools_hub' && entry.slug !== 'tools')
            artifactError('schema v2 tools_hub slug must be tools')
        if ((entry.content_type === 'tools_hub' || entry.content_type === 'calculator') && entry.locale !== 'en') {
            artifactError(`schema v2 ${entry.content_type} entries must be English-only`)
        }
        if (
            entry.content_type === 'calculator' &&
            !CALCULATOR_SLUGS.includes(entry.slug as (typeof CALCULATOR_SLUGS)[number])
        ) {
            artifactError(`schema v2 calculator has no reviewed engine: ${entry.slug}`)
        }
        const expected = expectedV2Paths(entry)
        if (entry.public_path !== expected.publicPath)
            artifactError(`public_path mismatch for ${entry.content_type}/${entry.slug}/${entry.locale}`)
        if (entry.output_path !== expected.outputPath)
            artifactError(`output_path mismatch for ${entry.content_type}/${entry.slug}/${entry.locale}`)
        assertPublicPath(entry.public_path, `${entry.content_type}/${entry.slug}.public_path`)
        const sortedLegacy = [...entry.legacy_paths].sort(compareAscii)
        assertExactArray(entry.legacy_paths, sortedLegacy, `${entry.content_type}/${entry.slug}.legacy_paths order`)
        assertUnique(entry.legacy_paths, `${entry.content_type}/${entry.slug}.legacy_paths`)
        entry.legacy_paths.forEach((legacyPath) =>
            assertLegacyPath(legacyPath, `${entry.content_type}/${entry.slug}.legacy_paths`)
        )
        entry.source_input_paths.forEach((inputPath) =>
            assertSourcePath(inputPath, `${entry.content_type}/${entry.slug}.source_input_paths`)
        )
        assertUnique(entry.source_input_paths, `${entry.content_type}/${entry.slug}.source_input_paths`)
        publicPaths.push(entry.public_path)
        outputPaths.push(entry.output_path)
        legacyPaths.push(...entry.legacy_paths)
        const key = `${entry.content_type}/${entry.slug}`
        groups.set(key, [...(groups.get(key) ?? []), entry.locale])
    }

    const expectedOrder = [...entries].sort(
        (left, right) =>
            CONTENT_TYPE_RANK.indexOf(left.content_type) - CONTENT_TYPE_RANK.indexOf(right.content_type) ||
            compareAscii(left.slug, right.slug) ||
            LOCALES.indexOf(left.locale) - LOCALES.indexOf(right.locale)
    )
    if (entries.some((entry, index) => entry !== expectedOrder[index])) {
        artifactError('schema v2 entries must be sorted by type, slug, and locale')
    }

    for (const [key, locales] of groups) {
        const [contentType] = key.split('/')
        assertUnique(locales, `schema v2 matrix for ${key}`)
        if (contentType === 'hub') assertExactArray(locales, LOCALES, `schema v2 matrix for ${key}`)
        if (contentType === 'tools_hub' || contentType === 'calculator') {
            assertExactArray(locales, ['en'], `schema v2 matrix for ${key}`)
        }
    }
    const structuredEntries = entries.filter((entry) => entry.content_type !== 'guide')
    if (structuredEntries.length > 0) {
        const hubs = structuredEntries.filter((entry) => entry.content_type === 'hub')
        const toolsHubs = structuredEntries.filter((entry) => entry.content_type === 'tools_hub')
        const calculators = structuredEntries.filter((entry) => entry.content_type === 'calculator')
        if (hubs.length !== LOCALES.length || toolsHubs.length !== 1) {
            artifactError('schema v2 structured pages must contain the complete three-hub and one-tools-hub cohort')
        }
        assertExactArray(
            calculators.map((entry) => entry.slug).sort(compareAscii),
            [...CALCULATOR_SLUGS].sort(compareAscii),
            'schema v2 calculator cohort'
        )
    }
    assertUnique(publicPaths, 'schema v2 public paths')
    assertUnique(outputPaths, 'schema v2 output paths')
    assertUnique(legacyPaths, 'schema v2 legacy paths')
    const publicPathSet = new Set(publicPaths)
    const conflictingLegacyPath = legacyPaths.find((legacyPath) => publicPathSet.has(legacyPath))
    if (conflictingLegacyPath) {
        artifactError(`schema v2 legacy path conflicts with a current public_path: ${conflictingLegacyPath}`)
    }
}

function validateManifestProvenance(manifest: SplitContentManifest): void {
    const inputPaths = Object.keys(manifest.input_sha256)
    const comparator =
        manifest.schema_version === 2 ? compareAscii : (left: string, right: string) => left.localeCompare(right)
    const orderedInputPaths = [...inputPaths].sort(comparator)
    if (JSON.stringify(inputPaths) !== JSON.stringify(orderedInputPaths)) {
        artifactError('manifest input_sha256 keys must be deterministically sorted')
    }
    if (manifest.schema_version === 2)
        inputPaths.forEach((inputPath) => assertSourcePath(inputPath, 'input_sha256 key'))
    const usedInputs = [...new Set(manifest.entries.flatMap((entry) => entry.source_input_paths))].sort(comparator)
    if (JSON.stringify(inputPaths) !== JSON.stringify(usedInputs)) {
        artifactError('manifest input_sha256 keys must exactly match the entry source-input union')
    }
}

function walkArtifact(root: string, relative = ''): string[] {
    const results: string[] = []
    for (const item of fs.readdirSync(root, { withFileTypes: true })) {
        const childRelative = relative ? `${relative}/${item.name}` : item.name
        const absolute = path.join(root, item.name)
        const stats = fs.lstatSync(absolute)
        if (stats.isSymbolicLink()) artifactError(`schema v2 artifact contains a symlink: ${childRelative}`)
        if (stats.isDirectory()) results.push(...walkArtifact(absolute, childRelative))
        else if (stats.isFile()) {
            if ((stats.mode & 0o111) !== 0) artifactError(`schema v2 artifact contains an executable: ${childRelative}`)
            results.push(childRelative)
        } else artifactError(`schema v2 artifact contains a non-regular entry: ${childRelative}`)
    }
    return results.sort(compareAscii)
}

function validateV2Inventory(root: string, manifest: z.infer<typeof manifestSchemaV2>): void {
    const expected = [
        'manifest.json',
        ...manifest.entries.map((entry) => entry.output_path.slice(PUBLISHED_PREFIX.length)),
    ].sort(compareAscii)
    const actual = walkArtifact(root)
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        artifactError('schema v2 artifact inventory must exactly match the manifest')
}

function validateV2ManifestKeyOrder(raw: unknown): void {
    assertExactOrderedKeys(raw, MANIFEST_FIELDS, 'generated Split schema-v2 manifest')
    const entries = raw.entries
    if (!Array.isArray(entries)) artifactError('generated Split schema-v2 manifest entries must be an array')
    entries.forEach((entry, index) =>
        assertExactOrderedKeys(entry, V2_ENTRY_FIELDS, `generated Split schema-v2 manifest entries[${index}]`)
    )
}

function parseCanonicalJson(bytes: Buffer, label: string): unknown {
    const text = bytes.toString('utf8')
    if (!Buffer.from(text).equals(bytes)) artifactError(`${label} must be valid UTF-8`)
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch {
        artifactError(`${label} is not valid JSON`)
    }
    if (`${JSON.stringify(raw, null, 2)}\n` !== text) {
        artifactError(`${label} must use canonical two-space JSON with one final newline`)
    }
    return raw
}

function generatedFromPaths(value: z.infer<typeof generatedFromSchema>, outputPath: string): string[] {
    assertExactOrderedKeys(value, GENERATED_FROM_FIELDS, `payload generated_from for ${outputPath}`)
    const paths = [
        value.template,
        ...value.data,
        ...value.product,
        value.workflow,
        ...value.context,
        ...value.guidelines,
    ]
    paths.forEach((sourcePath) => assertSourcePath(sourcePath, `payload generated_from for ${outputPath}`))
    return paths
}

function validateHttpsSource(value: string, label: string): void {
    let url: URL
    try {
        url = new URL(value)
    } catch {
        artifactError(`${label} must be an absolute HTTPS URL`)
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
        artifactError(`${label} must be an absolute HTTPS URL without credentials or a fragment`)
    }
}

function validatePayloadKeyOrder(payload: SplitStructuredPayload, label: string): void {
    assertExactOrderedKeys(payload, PAYLOAD_FIELDS, label)
    assertExactOrderedKeys(payload.generated_from, GENERATED_FROM_FIELDS, `${label}.generated_from`)
    if (payload.type === 'hub') {
        assertExactOrderedKeys(payload.content, ['intro', 'primary_action', 'cards'], `${label}.content`)
        assertExactOrderedKeys(
            payload.content.primary_action,
            ['kind', 'label', 'hint'],
            `${label}.content.primary_action`
        )
        payload.content.cards.forEach((card, index) =>
            assertExactOrderedKeys(
                card,
                ['id', 'kind', 'locale', 'title', 'description', 'date', 'tags', 'legacy_path', 'public_path'],
                `${label}.content.cards[${index}]`
            )
        )
        return
    }
    if (payload.type === 'tools_hub') {
        assertExactOrderedKeys(payload.content, ['intro', 'app_card', 'calculator_slugs'], `${label}.content`)
        assertExactOrderedKeys(
            payload.content.app_card,
            ['title', 'body', 'label', 'hint', 'action'],
            `${label}.content.app_card`
        )
        return
    }
    assertExactOrderedKeys(payload.content, ['engine', 'copy', 'data'], `${label}.content`)
    const copy = payload.content.copy
    assertExactOrderedKeys(
        copy,
        ['intro', 'result', 'method', 'concession', 'good_to_know', 'cta', 'faq_title', 'faqs', 'related'],
        `${label}.content.copy`
    )
    assertExactOrderedKeys(
        copy.result,
        ['title', 'hint', 'rounding_note', 'copy_label', 'copy_done'],
        `${label}.content.copy.result`
    )
    if (copy.method) assertExactOrderedKeys(copy.method, ['title', 'body'], `${label}.content.copy.method`)
    assertExactOrderedKeys(copy.concession, ['title', 'body'], `${label}.content.copy.concession`)
    assertExactOrderedKeys(copy.good_to_know, ['title', 'body'], `${label}.content.copy.good_to_know`)
    assertExactOrderedKeys(copy.cta, ['title', 'body', 'label', 'hint', 'action'], `${label}.content.copy.cta`)
    copy.faqs.forEach((faq, index) =>
        assertExactOrderedKeys(faq, ['question', 'answer'], `${label}.content.copy.faqs[${index}]`)
    )
    copy.related.forEach((related, index) =>
        assertExactOrderedKeys(
            related,
            ['label', 'legacy_path', 'public_path'],
            `${label}.content.copy.related[${index}]`
        )
    )
    if (payload.content.data) {
        assertExactOrderedKeys(payload.content.data, ['version', 'retrieved_at', 'rows'], `${label}.content.data`)
        payload.content.data.rows.forEach((row, index) =>
            assertExactOrderedKeys(
                row,
                ['code', 'label', 'unit', 'rate_decimal', 'currency', 'note', 'source_label', 'source_url'],
                `${label}.content.data.rows[${index}]`
            )
        )
    }
}

function validateStructuredPayload(
    payload: SplitStructuredPayload,
    entry: Exclude<z.infer<typeof manifestEntryV2Schema>, { content_type: 'guide' }>,
    entries: z.infer<typeof manifestEntryV2Schema>[],
    label: string
): void {
    validatePayloadKeyOrder(payload, label)
    if (payload.type !== entry.content_type || payload.slug !== entry.slug || payload.lang !== entry.locale) {
        artifactError(`${label} identity disagrees with its manifest entry`)
    }
    if (payload.title.trim() !== payload.title || payload.description.trim() !== payload.description) {
        artifactError(`${label} title and description must be trimmed`)
    }
    const expectedCanonical = absoluteUrl(entry.public_path)
    if (payload.canonical !== expectedCanonical) artifactError(`${label} canonical must be ${expectedCanonical}`)
    assertDate(payload.generated_at, `${label}.generated_at`)
    assertUnique(payload.claims, `${label}.claims`)

    const siblings = entries
        .filter((candidate) => candidate.content_type === entry.content_type && candidate.slug === entry.slug)
        .sort((left, right) => LOCALES.indexOf(left.locale) - LOCALES.indexOf(right.locale))
    const alternateLocales = siblings.map((candidate) => candidate.locale)
    assertExactOrderedKeys(payload.alternates, alternateLocales, `${label}.alternates`)
    for (const sibling of siblings) {
        if (payload.alternates[sibling.locale] !== sibling.output_path) {
            artifactError(`${label}.alternates.${sibling.locale} disagrees with the manifest`)
        }
    }
    const expectedSchemaTypes =
        payload.type === 'calculator' ? ['WebApplication', 'FAQPage'] : ['CollectionPage', 'ItemList']
    assertExactArray(payload.schema_types, expectedSchemaTypes, `${label}.schema_types`)
    const generatedPaths = generatedFromPaths(payload.generated_from, entry.output_path)
    assertExactArray(generatedPaths, entry.source_input_paths, `${label}.generated_from paths`)

    if (payload.type === 'hub') {
        const identities: string[] = []
        const legacyPaths: string[] = []
        const publicPaths: string[] = []
        for (const card of payload.content.cards) {
            if (card.locale !== payload.lang) artifactError(`${label} hub card locale must match its hub`)
            if (card.date !== null) assertDate(card.date, `${label} hub card date`)
            assertUnique(card.tags, `${label} hub card tags`)
            assertLegacyPath(card.legacy_path, `${label} hub card legacy_path`)
            assertPublicPath(card.public_path, `${label} hub card public_path`)
            const expectedPath =
                card.kind === 'guide'
                    ? guidePath(card.locale, card.id)
                    : card.kind === 'alternative'
                      ? `/${card.locale}/split/alternatives/${card.id}`
                      : splitToolsHubPath()
            if (card.kind === 'tools_hub' && (card.id !== 'tools' || card.locale !== 'en')) {
                artifactError(`${label} tools_hub card identity must be en/tools`)
            }
            if (card.public_path !== expectedPath)
                artifactError(`${label} hub card public_path disagrees with its identity`)
            identities.push(`${card.kind}/${card.id}`)
            legacyPaths.push(card.legacy_path)
            publicPaths.push(card.public_path)
        }
        assertUnique(identities, `${label} hub card identities`)
        assertUnique(legacyPaths, `${label} hub card legacy paths`)
        assertUnique(publicPaths, `${label} hub card public paths`)
        return
    }
    if (payload.type === 'tools_hub') return

    const expectedEngine = entry.slug === 'rent-split-calculator' ? 'rent_split_v1' : 'mileage_split_v1'
    if (payload.content.engine !== expectedEngine) artifactError(`${label} engine must be ${expectedEngine}`)
    for (const related of payload.content.copy.related) {
        assertLegacyPath(related.legacy_path, `${label} related legacy_path`)
        assertPublicPath(related.public_path, `${label} related public_path`)
    }
    if (expectedEngine === 'rent_split_v1') {
        if (payload.content.data !== null) artifactError(`${label} rent data must be null`)
        return
    }
    if (!payload.content.data) artifactError(`${label} mileage data is required`)
    assertDate(payload.content.data.retrieved_at, `${label} mileage retrieved_at`)
    assertExactArray(
        payload.content.data.rows.map((row) => row.code),
        MILEAGE_CODES,
        `${label} mileage country order`
    )
    payload.content.data.rows.forEach((row) => validateHttpsSource(row.source_url, `${label} mileage source_url`))
}

function parseStructuredPage(
    entry: Exclude<z.infer<typeof manifestEntryV2Schema>, { content_type: 'guide' }>,
    root: string,
    manifest: z.infer<typeof manifestSchemaV2>
): SplitStructuredPage {
    const bytes = readOutput(entry, root, true)
    const raw = parseCanonicalJson(bytes, entry.output_path)
    const parsed = structuredPayloadSchema.safeParse(raw)
    if (!parsed.success) artifactError(`generated Split payload failed schema: ${parsed.error.message}`)
    assertTrimmedStringValues(raw, entry.output_path)
    validatePayloadKeyOrder(raw as SplitStructuredPayload, entry.output_path)
    validateStructuredPayload(parsed.data, entry, manifest.entries, entry.output_path)
    return { entry, payload: parsed.data } as SplitStructuredPage
}

export function loadSplitContentManifest(root: string = GENERATED_ROOT): SplitContentManifest | null {
    const bytes = readSplitContentManifestBytes(root)
    if (!bytes) return null
    let raw: unknown
    try {
        raw = JSON.parse(bytes.toString('utf8'))
    } catch {
        artifactError('generated Split manifest is not valid JSON')
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'schema_version' in raw && raw.schema_version === 2) {
        raw = parseCanonicalJson(bytes, 'generated Split schema-v2 manifest')
        validateV2ManifestKeyOrder(raw)
    }
    const parsed = manifestSchema.safeParse(raw)
    if (!parsed.success) artifactError(`generated Split manifest failed schema v1/v2: ${parsed.error.message}`)
    const manifest = parsed.data
    if (manifest.schema_version === 1) validateV1Matrix(manifest.entries)
    else {
        validateV2Matrix(manifest.entries)
        validateV2Inventory(root, manifest)
    }
    validateManifestProvenance(manifest)

    // A manifest is one committed artifact, not a menu of independently trustworthy locales.
    // Validate every output before exposing even one route.
    if (manifest.schema_version === 1) {
        for (const entry of manifest.entries) parseGuide(entry, root, manifest)
    } else {
        for (const entry of manifest.entries) {
            if (entry.content_type === 'guide') parseGuide(entry, root, manifest)
            else parseStructuredPage(entry, root, manifest)
        }
    }
    return manifest
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

function guideGeneratedFromPaths(value: unknown, outputPath: string): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        artifactError(`guide frontmatter generated_from must be the known provenance block: ${outputPath}`)
    }
    const generatedFrom = value as Record<string, unknown>
    if (JSON.stringify(Object.keys(generatedFrom)) !== JSON.stringify(GENERATED_FROM_FIELDS)) {
        artifactError(`guide frontmatter generated_from fields or ordering changed: ${outputPath}`)
    }
    const scalar = (field: 'template' | 'workflow'): string => {
        const sourcePath = generatedFrom[field]
        if (typeof sourcePath !== 'string' || !sourcePath) {
            artifactError(`guide frontmatter generated_from.${field} must be a path: ${outputPath}`)
        }
        return sourcePath
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

function parseGuide(entry: SplitGuideManifestEntry, root: string, manifest?: SplitContentManifest): SplitGuide {
    const bytes = readOutput(entry, root, manifest?.schema_version === 2)
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
    const generatedAt = asDate(data.generated_at)
    const body = parsed.content.trim()
    if (!title || !description || !author || !DATE.test(date) || !DATE.test(generatedAt) || !body) {
        artifactError(`guide frontmatter is missing required metadata: ${entry.output_path}`)
    }
    if (data.slug !== entry.slug || data.type !== 'guide' || data.lang !== entry.locale) {
        artifactError(`guide frontmatter disagrees with manifest identity: ${entry.output_path}`)
    }
    const expectedCanonical = absoluteUrl(entry.public_path)
    if (data.canonical !== expectedCanonical) {
        artifactError(`guide canonical disagrees with its derived public URL: ${entry.output_path}`)
    }
    if (/^\s*#\s+/m.test(body)) artifactError(`guide body must not own an H1: ${entry.output_path}`)
    const generatedPaths = guideGeneratedFromPaths(data.generated_from, entry.output_path)
    if (JSON.stringify(generatedPaths) !== JSON.stringify(entry.source_input_paths)) {
        artifactError(`guide generated_from paths disagree with manifest source_input_paths: ${entry.output_path}`)
    }
    const schemaTypes = stringList(data.schema_types, 'schema_types')
    if (!schemaTypes.includes('BlogPosting')) artifactError(`guide schema_types must include BlogPosting`)

    if (manifest?.schema_version === 2) {
        const siblings = manifest.entries
            .filter((candidate) => candidate.content_type === 'guide' && candidate.slug === entry.slug)
            .sort((left, right) => LOCALES.indexOf(left.locale) - LOCALES.indexOf(right.locale))
        const expectedAlternates = Object.fromEntries(siblings.map((sibling) => [sibling.locale, sibling.output_path]))
        if (JSON.stringify(data.alternates) !== JSON.stringify(expectedAlternates)) {
            artifactError(`guide alternates disagree with manifest siblings: ${entry.output_path}`)
        }
    }

    return {
        entry,
        locale: entry.locale,
        slug: entry.slug,
        href: entry.public_path,
        title,
        description,
        author,
        date,
        generatedAt,
        tags: stringList(data.tags, 'tags'),
        claims: stringList(data.claims, 'claims'),
        body,
    }
}

function orderedGuideEntries(manifest: SplitContentManifest): SplitGuideManifestEntry[] {
    return manifest.entries
        .filter((entry): entry is SplitGuideManifestEntry => entry.content_type === 'guide')
        .sort(
            (left, right) =>
                left.slug.localeCompare(right.slug) || LOCALES.indexOf(left.locale) - LOCALES.indexOf(right.locale)
        )
}

export function listSplitGuides(locale: Locale, root: string = GENERATED_ROOT): SplitGuide[] {
    const manifest = loadSplitContentManifest(root)
    if (!manifest) return []
    return orderedGuideEntries(manifest)
        .filter((entry) => entry.locale === locale)
        .map((entry) => parseGuide(entry, root, manifest))
}

export function getSplitGuide(locale: Locale, slug: string, root: string = GENERATED_ROOT): SplitGuide | null {
    if (!SLUG.test(slug)) return null
    return listSplitGuides(locale, root).find((guide) => guide.slug === slug) ?? null
}

export function splitGuidePaths(root: string = GENERATED_ROOT): string[] {
    const manifest = loadSplitContentManifest(root)
    if (!manifest) return []
    return orderedGuideEntries(manifest)
        .map((entry) => entry.public_path)
        .sort((left, right) => left.localeCompare(right))
}

export function splitContentPaths(root: string = GENERATED_ROOT): string[] {
    const manifest = loadSplitContentManifest(root)
    if (!manifest) return []
    return manifest.entries.map((entry) => entry.public_path).sort((left, right) => left.localeCompare(right))
}

export function guideAlternates(slug: string, root: string = GENERATED_ROOT): Record<string, string> | undefined {
    const manifest = loadSplitContentManifest(root)
    if (!manifest) return undefined
    const entries = orderedGuideEntries(manifest).filter((entry) => entry.slug === slug)
    if (entries.length < 2) return undefined
    const languages: Record<string, string> = {}
    for (const entry of entries) languages[HREFLANG[entry.locale]] = entry.public_path
    if (entries.some((entry) => entry.locale === 'en')) languages['x-default'] = guidePath('en', slug)
    return languages
}

function findStructuredEntry(
    manifest: SplitContentManifest,
    type: 'hub' | 'tools_hub' | 'calculator',
    locale: Locale,
    slug: string
): Exclude<z.infer<typeof manifestEntryV2Schema>, { content_type: 'guide' }> | undefined {
    if (manifest.schema_version !== 2) return undefined
    return manifest.entries.find(
        (entry): entry is Exclude<z.infer<typeof manifestEntryV2Schema>, { content_type: 'guide' }> =>
            entry.content_type === type && entry.locale === locale && entry.slug === slug
    )
}

export function getSplitHub(
    locale: Locale,
    root: string = GENERATED_ROOT
): SplitStructuredPage<SplitHubPayload> | null {
    const manifest = loadSplitContentManifest(root)
    if (!manifest || manifest.schema_version !== 2) return null
    const entry = findStructuredEntry(manifest, 'hub', locale, 'split')
    if (!entry) return null
    return parseStructuredPage(entry, root, manifest) as SplitStructuredPage<SplitHubPayload>
}

export function getSplitToolsHub(root: string = GENERATED_ROOT): SplitStructuredPage<SplitToolsHubPayload> | null {
    const manifest = loadSplitContentManifest(root)
    if (!manifest || manifest.schema_version !== 2) return null
    const entry = findStructuredEntry(manifest, 'tools_hub', 'en', 'tools')
    if (!entry) return null
    return parseStructuredPage(entry, root, manifest) as SplitStructuredPage<SplitToolsHubPayload>
}

export function getSplitCalculator(
    slug: string,
    root: string = GENERATED_ROOT
): SplitStructuredPage<SplitCalculatorPayload> | null {
    if (!SLUG.test(slug)) return null
    const manifest = loadSplitContentManifest(root)
    if (!manifest || manifest.schema_version !== 2) return null
    const entry = findStructuredEntry(manifest, 'calculator', 'en', slug)
    if (!entry) return null
    return parseStructuredPage(entry, root, manifest) as SplitStructuredPage<SplitCalculatorPayload>
}

export function listSplitCalculators(root: string = GENERATED_ROOT): SplitStructuredPage<SplitCalculatorPayload>[] {
    const manifest = loadSplitContentManifest(root)
    if (!manifest || manifest.schema_version !== 2) return []
    return manifest.entries
        .filter((entry) => entry.content_type === 'calculator')
        .map((entry) => parseStructuredPage(entry, root, manifest) as SplitStructuredPage<SplitCalculatorPayload>)
}
