import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    SplitContentArtifactError,
    getSplitGuide,
    getSplitCalculator,
    getSplitHub,
    getSplitToolsHub,
    guideAlternates,
    listSplitCalculators,
    listSplitGuides,
    loadSplitContentManifest,
    splitContentManifestSha256,
    splitContentPaths,
    splitGuidePaths,
} from './artifact'

const FIXTURE = path.join(process.cwd(), 'src/lib/split-content/__fixtures__/valid')
const temporaryRoots: string[] = []

interface MutableEntry {
    locale: string
    public_path: string
    output_sha256: string
    source_input_paths: string[]
}

interface MutableManifest {
    source_commit: string
    input_sha256: Record<string, string>
    entries: MutableEntry[]
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function copiedFixture(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-a3-artifact-'))
    fs.cpSync(FIXTURE, root, { recursive: true })
    temporaryRoots.push(root)
    return root
}

function mutateManifest(root: string, mutate: (manifest: MutableManifest) => void): void {
    const file = path.join(root, 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as MutableManifest
    mutate(manifest)
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

function mutateOutput(root: string, locale: string, mutate: (source: string) => string): void {
    const relative = `guides/synthetic-guide/${locale}.md`
    const file = path.join(root, relative)
    const source = mutate(fs.readFileSync(file, 'utf8'))
    fs.writeFileSync(file, source)
    const hash = createHash('sha256').update(source).digest('hex')
    mutateManifest(root, (manifest) => {
        const entry = manifest.entries.find((candidate) => candidate.locale === locale)
        if (!entry) throw new Error(`fixture manifest has no ${locale} entry`)
        entry.output_sha256 = hash
    })
}

type V2ContentType = 'guide' | 'hub' | 'tools_hub' | 'calculator'

interface MutableV2Entry {
    content_type: V2ContentType
    slug: string
    locale: 'en' | 'es-419' | 'pt-br'
    public_path: string
    legacy_paths: string[]
    output_path: string
    output_sha256: string
    source_input_paths: string[]
}

interface MutableV2Manifest {
    schema_version: number
    source_repository: string
    source_commit: string
    content_root: string
    locales: string[]
    input_sha256: Record<string, string>
    entries: MutableV2Entry[]
}

const V2_SOURCE_INPUTS = [
    'split-content/_system/generation-templates/page.md',
    'split-content/_system/data/pages/synthetic.md',
    'split-content/product/truths.md',
    'split-content/_system/workflows/generate-page.md',
    'split-content/_system/context/messaging.md',
    'split-content/_system/guidelines/seo.md',
]
const V2_MILEAGE_CODES = ['AU', 'BE', 'BR', 'CA', 'FR', 'DE', 'IE', 'NL', 'PL', 'ES', 'GB', 'US']

function canonicalJson(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`
}

function writeFixtureFile(root: string, relative: string, contents: string): void {
    const file = path.join(root, ...relative.split('/'))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, contents)
}

function generatedFromFixture() {
    return {
        template: V2_SOURCE_INPUTS[0],
        data: [V2_SOURCE_INPUTS[1]],
        product: [V2_SOURCE_INPUTS[2]],
        workflow: V2_SOURCE_INPUTS[3],
        context: [V2_SOURCE_INPUTS[4]],
        guidelines: [V2_SOURCE_INPUTS[5]],
    }
}

function calculatorCopyFixture() {
    return {
        intro: ['Synthetic calculator introduction.'],
        result: {
            title: 'Synthetic result',
            hint: 'Enter the synthetic values.',
            rounding_note: 'Synthetic values reconcile exactly.',
            copy_label: 'Copy result',
            copy_done: 'Copied',
        },
        method: null,
        concession: { title: 'When a spreadsheet is better', body: 'Use one when the agreement is settled.' },
        good_to_know: { title: 'Good to know', body: ['This is synthetic fixture copy.'] },
        cta: {
            title: 'Start a split',
            body: 'Put the result in a room.',
            label: 'Start a split',
            hint: 'No account required.',
            action: 'app_new',
        },
        faq_title: 'Questions',
        faqs: [{ question: 'Is this synthetic?', answer: 'Yes.' }],
        related: [
            {
                label: 'All calculators',
                legacy_path: '/tools',
                public_path: '/en/split/tools',
            },
        ],
    }
}

function v2Payload(entry: MutableV2Entry, entries: MutableV2Entry[]) {
    const siblings = entries.filter(
        (candidate) => candidate.content_type === entry.content_type && candidate.slug === entry.slug
    )
    const alternates = Object.fromEntries(siblings.map((candidate) => [candidate.locale, candidate.output_path]))
    let content: unknown
    if (entry.content_type === 'hub') {
        content = {
            intro: [`Synthetic ${entry.locale} hub introduction.`],
            primary_action: { kind: 'app_new', label: 'Start a split', hint: 'No account required.' },
            cards: [
                {
                    id: `card-${entry.locale}`,
                    kind: 'guide',
                    locale: entry.locale,
                    title: `Synthetic ${entry.locale} card`,
                    description: 'Synthetic card description.',
                    date: null,
                    tags: ['synthetic'],
                    legacy_path: `${entry.locale === 'en' ? '/blog' : `/${entry.locale}/blog`}/card-${entry.locale}`,
                    public_path: `/${entry.locale}/split/guides/card-${entry.locale}`,
                },
            ],
        }
    } else if (entry.content_type === 'tools_hub') {
        content = {
            intro: ['Synthetic tools introduction.'],
            app_card: {
                title: 'Splitting a bill',
                body: 'The app owns that job.',
                label: 'Start a split',
                hint: 'No account required.',
                action: 'app_new',
            },
            calculator_slugs: ['rent-split-calculator', 'mileage-split-calculator'],
        }
    } else {
        const mileage = entry.slug === 'mileage-split-calculator'
        content = {
            engine: mileage ? 'mileage_split_v1' : 'rent_split_v1',
            copy: calculatorCopyFixture(),
            data: mileage
                ? {
                      version: '2026-07-30',
                      retrieved_at: '2026-07-30',
                      rows: V2_MILEAGE_CODES.map((code) => ({
                          code,
                          label: `${code} synthetic rate`,
                          unit: code === 'GB' || code === 'US' ? 'mile' : 'km',
                          rate_decimal: ['BR', 'FR', 'IE', 'PL'].includes(code) ? null : '0.30',
                          currency: code === 'GB' ? 'GBP' : code === 'US' ? 'USD' : 'EUR',
                          note: 'Synthetic reviewed rate.',
                          source_label: 'Synthetic authority',
                          source_url: `https://example.com/rates/${code.toLowerCase()}`,
                      })),
                  }
                : null,
        }
    }
    return {
        payload_schema_version: 1,
        type: entry.content_type,
        slug: entry.slug,
        lang: entry.locale,
        title: `Synthetic ${entry.content_type} ${entry.locale}`,
        description: 'Synthetic structured payload used only by the artifact contract tests.',
        canonical: `https://peanut.me${entry.public_path}`,
        alternates,
        claims: ['synthetic-only'],
        schema_types:
            entry.content_type === 'calculator' ? ['WebApplication', 'FAQPage'] : ['CollectionPage', 'ItemList'],
        generated_from: generatedFromFixture(),
        generated_at: '2026-08-11',
        content,
    }
}

function makeV2Fixture(): { root: string; manifest: MutableV2Manifest } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-v2-artifact-'))
    temporaryRoots.push(root)
    const entries: MutableV2Entry[] = [
        ...(['en', 'es-419', 'pt-br'] as const).map((locale) => ({
            content_type: 'hub' as const,
            slug: 'split',
            locale,
            public_path: `/${locale}/split`,
            legacy_paths: locale === 'en' ? ['/', '/blog'] : [`/${locale}/blog`],
            output_path: `split-content/published/hubs/split/${locale}.json`,
            output_sha256: '',
            source_input_paths: [...V2_SOURCE_INPUTS],
        })),
        {
            content_type: 'tools_hub',
            slug: 'tools',
            locale: 'en',
            public_path: '/en/split/tools',
            legacy_paths: ['/tools'],
            output_path: 'split-content/published/tools-hubs/tools/en.json',
            output_sha256: '',
            source_input_paths: [...V2_SOURCE_INPUTS],
        },
        ...['mileage-split-calculator', 'rent-split-calculator'].map((slug) => ({
            content_type: 'calculator' as const,
            slug,
            locale: 'en' as const,
            public_path: `/en/split/tools/${slug}`,
            legacy_paths: [`/${slug}`],
            output_path: `split-content/published/calculators/${slug}/en.json`,
            output_sha256: '',
            source_input_paths: [...V2_SOURCE_INPUTS],
        })),
    ]
    for (const entry of entries) {
        const contents = canonicalJson(v2Payload(entry, entries))
        const relative = entry.output_path.slice('split-content/published/'.length)
        writeFixtureFile(root, relative, contents)
        entry.output_sha256 = createHash('sha256').update(contents).digest('hex')
    }
    const manifest: MutableV2Manifest = {
        schema_version: 2,
        source_repository: 'peanutprotocol/mono',
        source_commit: 'b'.repeat(40),
        content_root: 'split-content',
        locales: ['en', 'es-419', 'pt-br'],
        input_sha256: Object.fromEntries(
            [...V2_SOURCE_INPUTS]
                .sort()
                .map((inputPath) => [inputPath, createHash('sha256').update(inputPath).digest('hex')])
        ),
        entries,
    }
    writeFixtureFile(root, 'manifest.json', canonicalJson(manifest))
    return { root, manifest }
}

function writeV2Manifest(root: string, manifest: MutableV2Manifest): void {
    writeFixtureFile(root, 'manifest.json', canonicalJson(manifest))
}

function mutateV2Output(
    root: string,
    manifest: MutableV2Manifest,
    entry: MutableV2Entry,
    mutate: (value: Record<string, unknown>) => unknown
): void {
    const relative = entry.output_path.slice('split-content/published/'.length)
    const outputPath = path.join(root, ...relative.split('/'))
    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as Record<string, unknown>
    const contents = canonicalJson(mutate(parsed))
    fs.writeFileSync(outputPath, contents)
    entry.output_sha256 = createHash('sha256').update(contents).digest('hex')
    writeV2Manifest(root, manifest)
}

describe('generated Split artifact loader', () => {
    it('loads an exact schema-v1 three-locale guide matrix and derives its siblings', () => {
        const manifest = loadSplitContentManifest(FIXTURE)
        expect(manifest?.entries).toHaveLength(3)
        expect(listSplitGuides('en', FIXTURE).map((guide) => guide.slug)).toEqual(['synthetic-guide'])
        expect(getSplitGuide('es-419', 'synthetic-guide', FIXTURE)).toMatchObject({
            locale: 'es-419',
            href: '/es-419/split/guides/synthetic-guide',
            title: 'Guía sintética en español',
        })
        expect(guideAlternates('synthetic-guide', FIXTURE)).toEqual({
            en: '/en/split/guides/synthetic-guide',
            'es-419': '/es-419/split/guides/synthetic-guide',
            'pt-BR': '/pt-br/split/guides/synthetic-guide',
            'x-default': '/en/split/guides/synthetic-guide',
        })
    })

    it('treats a renderer-only branch with no generated destination as an empty route set', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-a3-empty-'))
        temporaryRoots.push(root)
        expect(loadSplitContentManifest(root)).toBeNull()
        expect(splitContentManifestSha256(root)).toBeNull()
        expect(listSplitGuides('en', root)).toEqual([])
        expect(getSplitGuide('en', 'synthetic-guide', root)).toBeNull()
    })

    it('attests the exact manifest bytes consumed by the loader, not parsed JSON semantics', () => {
        const manifestPath = path.join(FIXTURE, 'manifest.json')
        const source = fs.readFileSync(manifestPath)
        expect(splitContentManifestSha256(FIXTURE)).toBe(createHash('sha256').update(source).digest('hex'))

        const root = copiedFixture()
        const copiedPath = path.join(root, 'manifest.json')
        const parsed = JSON.parse(fs.readFileSync(copiedPath, 'utf8'))
        fs.writeFileSync(copiedPath, JSON.stringify(parsed))

        expect(loadSplitContentManifest(root)).not.toBeNull()
        expect(splitContentManifestSha256(root)).toBe(
            createHash('sha256').update(fs.readFileSync(copiedPath)).digest('hex')
        )
        expect(splitContentManifestSha256(root)).not.toBe(splitContentManifestSha256(FIXTURE))
    })

    it('fails closed when a locale is removed, so publication cannot delete a sibling downstream', () => {
        const root = copiedFixture()
        mutateManifest(root, (manifest) => manifest.entries.pop())
        expect(() => loadSplitContentManifest(root)).toThrow(/exact en\/es-419\/pt-br locale matrix/)
    })

    it('rejects unresolved provenance, path drift, missing bytes, and hash drift', () => {
        const unresolved = copiedFixture()
        mutateManifest(unresolved, (manifest) => (manifest.source_commit = '${MONO_SOURCE_COMMIT}'))
        expect(() => loadSplitContentManifest(unresolved)).toThrow(/schema v1/)

        const wrongPath = copiedFixture()
        mutateManifest(wrongPath, (manifest) => (manifest.entries[0].public_path = '/en/split/wrong'))
        expect(() => loadSplitContentManifest(wrongPath)).toThrow(/public_path mismatch/)

        const missing = copiedFixture()
        fs.unlinkSync(path.join(missing, 'guides/synthetic-guide/en.md'))
        expect(() => listSplitGuides('en', missing)).toThrow(/manifest output is missing/)

        const dirty = copiedFixture()
        fs.appendFileSync(path.join(dirty, 'guides/synthetic-guide/en.md'), '\ndirty\n')
        expect(() => listSplitGuides('en', dirty)).toThrow(/output hash mismatch/)
    })

    it('rejects frontmatter identity/canonical drift and any body-owned H1', () => {
        const identity = copiedFixture()
        mutateOutput(identity, 'en', (source) => source.replace('slug: synthetic-guide', 'slug: wrong-guide'))
        expect(() => listSplitGuides('en', identity)).toThrow(/frontmatter disagrees with manifest identity/)

        const canonical = copiedFixture()
        mutateOutput(canonical, 'en', (source) => source.replace('https://peanut.me/en/', 'https://wrong.example/en/'))
        expect(() => listSplitGuides('en', canonical)).toThrow(/canonical disagrees/)

        const h1 = copiedFixture()
        mutateOutput(h1, 'en', (source) =>
            source.replace('This is synthetic body copy.', '# Duplicate H1\n\nThis is synthetic body copy.')
        )
        expect(() => listSplitGuides('en', h1)).toThrow(/must not own an H1/)
    })

    it('requires each output generated_from block to exactly match its ordered manifest sources', () => {
        const reorderedManifest = copiedFixture()
        mutateManifest(reorderedManifest, (manifest) => {
            const [first, second, ...rest] = manifest.entries[0].source_input_paths
            manifest.entries[0].source_input_paths = [second, first, ...rest]
        })
        expect(() => loadSplitContentManifest(reorderedManifest)).toThrow(/generated_from paths disagree/)

        const localizedOutput = copiedFixture()
        mutateOutput(localizedOutput, 'pt-br', (source) =>
            source.replace('        - split-content/_system/context/localization.pt-br.md\n', '')
        )
        expect(() => loadSplitContentManifest(localizedOutput)).toThrow(/generated_from paths disagree/)
    })

    it('rejects unsorted or globally incomplete input provenance before serving any locale', () => {
        const reversed = copiedFixture()
        mutateManifest(reversed, (manifest) => {
            manifest.input_sha256 = Object.fromEntries(Object.entries(manifest.input_sha256).reverse())
        })
        expect(() => loadSplitContentManifest(reversed)).toThrow(/deterministically sorted/)

        const missing = copiedFixture()
        mutateManifest(missing, (manifest) => {
            delete manifest.input_sha256[Object.keys(manifest.input_sha256)[0]]
        })
        expect(() => loadSplitContentManifest(missing)).toThrow(/exactly match/)
    })

    it('returns null for an unknown or unsafe slug without probing outside the allowlist', () => {
        expect(getSplitGuide('en', 'not-in-manifest', FIXTURE)).toBeNull()
        expect(getSplitGuide('en', '../manifest', FIXTURE)).toBeNull()
        expect(() => loadSplitContentManifest(FIXTURE)).not.toThrow(SplitContentArtifactError)
    })

    it('loads the strict schema-v2 page types through type-specific getters without treating them as guides', () => {
        const { root } = makeV2Fixture()
        const previousOrigin = process.env.CONTENT_ORIGIN
        process.env.CONTENT_ORIGIN = 'https://preview.example'
        let manifest: ReturnType<typeof loadSplitContentManifest>
        try {
            manifest = loadSplitContentManifest(root)
        } finally {
            if (previousOrigin === undefined) delete process.env.CONTENT_ORIGIN
            else process.env.CONTENT_ORIGIN = previousOrigin
        }

        expect(manifest?.schema_version).toBe(2)
        expect(manifest?.entries).toHaveLength(6)
        expect(splitGuidePaths(root)).toEqual([])
        expect(listSplitGuides('en', root)).toEqual([])
        expect(getSplitHub('es-419', root)?.payload).toMatchObject({ type: 'hub', lang: 'es-419', slug: 'split' })
        expect(getSplitToolsHub(root)?.payload.content.calculator_slugs).toEqual([
            'rent-split-calculator',
            'mileage-split-calculator',
        ])
        expect(getSplitCalculator('mileage-split-calculator', root)?.payload.content).toMatchObject({
            engine: 'mileage_split_v1',
            data: { version: '2026-07-30' },
        })
        expect(getSplitCalculator('../manifest', root)).toBeNull()
        expect(listSplitCalculators(root).map((page) => page.entry.slug)).toEqual([
            'mileage-split-calculator',
            'rent-split-calculator',
        ])
        expect(splitContentPaths(root)).toEqual(
            manifest!.entries.map((entry) => entry.public_path).sort((left, right) => left.localeCompare(right))
        )
    })

    it('allows a schema-v2 guide to preserve only the locale that actually exists', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-v2-guide-subset-'))
        temporaryRoots.push(root)
        const sourceManifest = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'manifest.json'), 'utf8')) as {
            input_sha256: Record<string, string>
            entries: Array<MutableV2Entry & { content_type: 'guide' }>
        }
        const sourceEntry = sourceManifest.entries[0]
        const output = fs
            .readFileSync(path.join(FIXTURE, 'guides/synthetic-guide/en.md'), 'utf8')
            .replace('    es-419: split-content/published/guides/synthetic-guide/es-419.md\n', '')
            .replace('    pt-br: split-content/published/guides/synthetic-guide/pt-br.md\n', '')
        writeFixtureFile(root, 'guides/synthetic-guide/en.md', output)
        const entry: MutableV2Entry = {
            content_type: 'guide',
            slug: sourceEntry.slug,
            locale: sourceEntry.locale,
            public_path: sourceEntry.public_path,
            legacy_paths: ['/blog/synthetic-guide'],
            output_path: sourceEntry.output_path,
            output_sha256: createHash('sha256').update(output).digest('hex'),
            source_input_paths: sourceEntry.source_input_paths,
        }
        const input_sha256 = Object.fromEntries(
            [...entry.source_input_paths].sort().map((inputPath) => [inputPath, sourceManifest.input_sha256[inputPath]])
        )
        writeFixtureFile(
            root,
            'manifest.json',
            canonicalJson({
                schema_version: 2,
                source_repository: 'peanutprotocol/mono',
                source_commit: 'b'.repeat(40),
                content_root: 'split-content',
                locales: ['en', 'es-419', 'pt-br'],
                input_sha256,
                entries: [entry],
            })
        )

        expect(getSplitGuide('en', 'synthetic-guide', root)?.title).toBe('Synthetic English guide')
        expect(guideAlternates('synthetic-guide', root)).toBeUndefined()
    })

    it('rejects unknown schemas and every invalid schema-v2 route/cardinality/legacy identity', () => {
        const unknown = makeV2Fixture()
        unknown.manifest.schema_version = 3
        writeV2Manifest(unknown.root, unknown.manifest)
        expect(() => loadSplitContentManifest(unknown.root)).toThrow(/schema v1\/v2/)

        const partialHub = makeV2Fixture()
        const removed = partialHub.manifest.entries.splice(2, 1)[0]
        fs.unlinkSync(
            path.join(partialHub.root, ...removed.output_path.slice('split-content/published/'.length).split('/'))
        )
        writeV2Manifest(partialHub.root, partialHub.manifest)
        expect(() => loadSplitContentManifest(partialHub.root)).toThrow(/matrix.*en, es-419, pt-br/)

        const nonEnglishCalculator = makeV2Fixture()
        const calculator = nonEnglishCalculator.manifest.entries.find(
            (entry) => entry.slug === 'rent-split-calculator'
        )!
        calculator.locale = 'pt-br'
        writeV2Manifest(nonEnglishCalculator.root, nonEnglishCalculator.manifest)
        expect(() => loadSplitContentManifest(nonEnglishCalculator.root)).toThrow(/English-only/)

        const duplicateLegacy = makeV2Fixture()
        duplicateLegacy.manifest.entries.at(-1)!.legacy_paths = ['/mileage-split-calculator']
        writeV2Manifest(duplicateLegacy.root, duplicateLegacy.manifest)
        expect(() => loadSplitContentManifest(duplicateLegacy.root)).toThrow(/legacy paths.*duplicates/)

        const reservedLegacy = makeV2Fixture()
        reservedLegacy.manifest.entries.at(-1)!.legacy_paths = ['/import']
        writeV2Manifest(reservedLegacy.root, reservedLegacy.manifest)
        expect(() => loadSplitContentManifest(reservedLegacy.root)).toThrow(/product or API namespace/)

        const conflictingLegacy = makeV2Fixture()
        conflictingLegacy.manifest.entries.at(-1)!.legacy_paths = ['/en/split/tools']
        writeV2Manifest(conflictingLegacy.root, conflictingLegacy.manifest)
        expect(() => loadSplitContentManifest(conflictingLegacy.root)).toThrow(
            /legacy path conflicts with a current public_path/
        )
    })

    it('rejects noncanonical, reordered, unknown, and falsely-provenanced schema-v2 JSON', () => {
        const noncanonicalManifest = makeV2Fixture()
        const manifestPath = path.join(noncanonicalManifest.root, 'manifest.json')
        fs.writeFileSync(manifestPath, JSON.stringify(noncanonicalManifest.manifest))
        expect(() => loadSplitContentManifest(noncanonicalManifest.root)).toThrow(/canonical two-space JSON/)

        const reorderedManifestEntry = makeV2Fixture()
        const [firstEntry, ...remainingEntries] = reorderedManifestEntry.manifest.entries
        const { content_type, slug, ...remainingFields } = firstEntry
        reorderedManifestEntry.manifest.entries = [
            { slug, content_type, ...remainingFields } as MutableV2Entry,
            ...remainingEntries,
        ]
        writeV2Manifest(reorderedManifestEntry.root, reorderedManifestEntry.manifest)
        expect(() => loadSplitContentManifest(reorderedManifestEntry.root)).toThrow(/entries\[0\].*canonically ordered/)

        const noncanonical = makeV2Fixture()
        const noncanonicalEntry = noncanonical.manifest.entries[0]
        const noncanonicalPath = path.join(
            noncanonical.root,
            ...noncanonicalEntry.output_path.slice('split-content/published/'.length).split('/')
        )
        const value = JSON.parse(fs.readFileSync(noncanonicalPath, 'utf8'))
        const minified = JSON.stringify(value)
        fs.writeFileSync(noncanonicalPath, minified)
        noncanonicalEntry.output_sha256 = createHash('sha256').update(minified).digest('hex')
        writeV2Manifest(noncanonical.root, noncanonical.manifest)
        expect(() => loadSplitContentManifest(noncanonical.root)).toThrow(/canonical two-space JSON/)

        const reordered = makeV2Fixture()
        const reorderedEntry = reordered.manifest.entries[0]
        mutateV2Output(reordered.root, reordered.manifest, reorderedEntry, (payload) => {
            const { payload_schema_version, ...rest } = payload
            return { type: rest.type, payload_schema_version, ...Object.fromEntries(Object.entries(rest).slice(1)) }
        })
        expect(() => loadSplitContentManifest(reordered.root)).toThrow(/canonically ordered/)

        const unknownField = makeV2Fixture()
        const unknownEntry = unknownField.manifest.entries[0]
        mutateV2Output(unknownField.root, unknownField.manifest, unknownEntry, (payload) => {
            const content = payload.content as Record<string, unknown>
            return { ...payload, content: { ...content, raw_html: '<script>bad()</script>' } }
        })
        expect(() => loadSplitContentManifest(unknownField.root)).toThrow(/Unrecognized key.*raw_html/)

        const falseProvenance = makeV2Fixture()
        const provenanceEntry = falseProvenance.manifest.entries[0]
        mutateV2Output(falseProvenance.root, falseProvenance.manifest, provenanceEntry, (payload) => {
            const generated = payload.generated_from as Record<string, unknown>
            return { ...payload, generated_from: { ...generated, data: ['split-content/_system/data/pages/other.md'] } }
        })
        expect(() => loadSplitContentManifest(falseProvenance.root)).toThrow(/generated_from paths/)

        const paddedCopy = makeV2Fixture()
        const paddedEntry = paddedCopy.manifest.entries[0]
        mutateV2Output(paddedCopy.root, paddedCopy.manifest, paddedEntry, (payload) => ({
            ...payload,
            content: {
                ...(payload.content as Record<string, unknown>),
                intro: [' Synthetic copy must not be padded.'],
            },
        }))
        expect(() => loadSplitContentManifest(paddedCopy.root)).toThrow(/non-empty trimmed strings/)
    })

    it('rejects schema-v2 payload identity, engine, mileage source, and inventory drift globally', () => {
        const wrongCanonical = makeV2Fixture()
        const canonicalEntry = wrongCanonical.manifest.entries[0]
        mutateV2Output(wrongCanonical.root, wrongCanonical.manifest, canonicalEntry, (payload) => ({
            ...payload,
            canonical: 'https://wrong.example/en/split',
        }))
        expect(() => loadSplitContentManifest(wrongCanonical.root)).toThrow(/canonical must be/)

        const wrongEngine = makeV2Fixture()
        const rentEntry = wrongEngine.manifest.entries.find((entry) => entry.slug === 'rent-split-calculator')!
        mutateV2Output(wrongEngine.root, wrongEngine.manifest, rentEntry, (payload) => ({
            ...payload,
            content: { ...(payload.content as Record<string, unknown>), engine: 'mileage_split_v1' },
        }))
        expect(() => loadSplitContentManifest(wrongEngine.root)).toThrow(/engine must be rent_split_v1/)

        const badSource = makeV2Fixture()
        const mileageEntry = badSource.manifest.entries.find((entry) => entry.slug === 'mileage-split-calculator')!
        mutateV2Output(badSource.root, badSource.manifest, mileageEntry, (payload) => {
            const content = payload.content as Record<string, unknown>
            const data = content.data as Record<string, unknown>
            const rows = [...(data.rows as Array<Record<string, unknown>>)]
            rows[0] = { ...rows[0], source_url: 'http://example.com/rate' }
            return { ...payload, content: { ...content, data: { ...data, rows } } }
        })
        expect(() => loadSplitContentManifest(badSource.root)).toThrow(/absolute HTTPS URL/)

        const numericRate = makeV2Fixture()
        const numericMileageEntry = numericRate.manifest.entries.find(
            (entry) => entry.slug === 'mileage-split-calculator'
        )!
        mutateV2Output(numericRate.root, numericRate.manifest, numericMileageEntry, (payload) => {
            const content = payload.content as Record<string, unknown>
            const data = content.data as Record<string, unknown>
            const rows = [...(data.rows as Array<Record<string, unknown>>)]
            rows[1] = { ...rows[1], rate_decimal: 0.3 }
            return { ...payload, content: { ...content, data: { ...data, rows } } }
        })
        expect(() => loadSplitContentManifest(numericRate.root)).toThrow(/rate_decimal/)

        const extra = makeV2Fixture()
        writeFixtureFile(extra.root, 'notes.txt', 'not declared\n')
        expect(() => loadSplitContentManifest(extra.root)).toThrow(/inventory must exactly match/)
    })
})
