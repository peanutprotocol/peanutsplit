import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    SplitContentArtifactError,
    getSplitGuide,
    guideAlternates,
    listSplitGuides,
    loadSplitContentManifest,
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
        expect(listSplitGuides('en', root)).toEqual([])
        expect(getSplitGuide('en', 'synthetic-guide', root)).toBeNull()
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
})
