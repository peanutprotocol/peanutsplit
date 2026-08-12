import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
	assertPublisherDiff,
	createPublisherBundle,
	installPublisherBundle,
	verifyMirrorScript,
} from './split-content-publisher.mjs'

const SOURCE_COMMIT = 'a'.repeat(40)
const OTHER_COMMIT = 'b'.repeat(40)
const LOCALES = ['en', 'es-419', 'pt-br']
const SLUG = 'safe-guide'
const SOURCE_INPUTS = [
	'split-content/_system/context/messaging.md',
	'split-content/_system/data/guides/safe-guide.md',
	'split-content/_system/generation-templates/guide.md',
	'split-content/_system/guidelines/seo.md',
	'split-content/_system/workflows/generate-guide.md',
	'split-content/product/truths.md',
]
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function sha256(contents) {
	return crypto.createHash('sha256').update(contents).digest('hex')
}

function writeFile(root, relativePath, contents, mode = 0o644) {
	const target = path.join(root, ...relativePath.split('/'))
	fs.mkdirSync(path.dirname(target), { recursive: true })
	fs.writeFileSync(target, contents, { mode })
}

function writeJson(filePath, value) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function git(repoRoot, args) {
	return execFileSync('git', ['-C', repoRoot, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim()
}

function gitResult(repoRoot, args) {
	return spawnSync('git', ['-C', repoRoot, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	})
}

function makeLock(root, overrides = {}) {
	const lockPath = path.join(root, 'publisher-lock.json')
	const mirrorContents = overrides.mirrorContents ?? 'export const fixture = true\n'
	const lock = {
		schema_version: 1,
		source_repository: 'peanutprotocol/mono',
		source_branch: 'main',
		mirror_script_path: 'scripts/split-content-mirror.mjs',
		mirror_script_git_blob: '1'.repeat(40),
		mirror_script_sha256: sha256(mirrorContents),
		destination_root: 'apps/web/src/generated/seo',
		artifact_branch: 'automation/split-content-artifacts',
		ci_workflow: 'ci.yml',
		...overrides.lock,
	}
	writeJson(lockPath, lock)
	return { lockPath, lock, mirrorContents }
}

function artifactManifest(sourceCommit = SOURCE_COMMIT) {
	const outputs = new Map(
		LOCALES.map((locale) => [
			`guides/${SLUG}/${locale}.md`,
			Buffer.from(`---\nlocale: ${locale}\n---\n\nFixture ${locale}\n`),
		])
	)
	const entries = LOCALES.map((locale) => {
		const destinationPath = `guides/${SLUG}/${locale}.md`
		return {
			content_type: 'guide',
			slug: SLUG,
			locale,
			public_path: `/${locale}/split/guides/${SLUG}`,
			output_path: `split-content/published/${destinationPath}`,
			output_sha256: sha256(outputs.get(destinationPath)),
			source_input_paths: SOURCE_INPUTS,
		}
	})
	return {
		outputs,
		manifest: {
			schema_version: 1,
			source_repository: 'peanutprotocol/mono',
			source_commit: sourceCommit,
			content_root: 'split-content',
			locales: LOCALES,
			input_sha256: Object.fromEntries(SOURCE_INPUTS.map((inputPath) => [inputPath, sha256(inputPath)])),
			entries,
		},
	}
}

function writeArtifact(root, sourceCommit = SOURCE_COMMIT) {
	const { outputs, manifest } = artifactManifest(sourceCommit)
	writeJson(path.join(root, 'manifest.json'), manifest)
	for (const [relativePath, bytes] of outputs) writeFile(root, relativePath, bytes)
	return manifest
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

function v2GeneratedFrom() {
	return {
		template: V2_SOURCE_INPUTS[0],
		data: [V2_SOURCE_INPUTS[1]],
		product: [V2_SOURCE_INPUTS[2]],
		workflow: V2_SOURCE_INPUTS[3],
		context: [V2_SOURCE_INPUTS[4]],
		guidelines: [V2_SOURCE_INPUTS[5]],
	}
}

function v2CalculatorCopy() {
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
		related: [{ label: 'All calculators', legacy_path: '/tools', public_path: '/en/split/tools' }],
	}
}

function v2Payload(entry, entries) {
	const siblings = entries.filter(
		(candidate) => candidate.content_type === entry.content_type && candidate.slug === entry.slug
	)
	const alternates = Object.fromEntries(siblings.map((candidate) => [candidate.locale, candidate.output_path]))
	let content
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
			copy: v2CalculatorCopy(),
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
		description: 'Synthetic structured payload used only by the publisher contract tests.',
		canonical: `https://peanut.me${entry.public_path}`,
		alternates,
		claims: ['synthetic-only'],
		schema_types:
			entry.content_type === 'calculator' ? ['WebApplication', 'FAQPage'] : ['CollectionPage', 'ItemList'],
		generated_from: v2GeneratedFrom(),
		generated_at: '2026-08-11',
		content,
	}
}

function v2ArtifactManifest(sourceCommit = SOURCE_COMMIT) {
	const entries = [
		...LOCALES.map((locale) => ({
			content_type: 'hub',
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
			content_type: 'calculator',
			slug,
			locale: 'en',
			public_path: `/en/split/tools/${slug}`,
			legacy_paths: [`/${slug}`],
			output_path: `split-content/published/calculators/${slug}/en.json`,
			output_sha256: '',
			source_input_paths: [...V2_SOURCE_INPUTS],
		})),
	]
	const outputs = new Map()
	for (const entry of entries) {
		const destination = entry.output_path.slice('split-content/published/'.length)
		const bytes = Buffer.from(`${JSON.stringify(v2Payload(entry, entries), null, 2)}\n`)
		outputs.set(destination, bytes)
		entry.output_sha256 = sha256(bytes)
	}
	return {
		outputs,
		manifest: {
			schema_version: 2,
			source_repository: 'peanutprotocol/mono',
			source_commit: sourceCommit,
			content_root: 'split-content',
			locales: LOCALES,
			input_sha256: Object.fromEntries(
				[...V2_SOURCE_INPUTS].sort().map((inputPath) => [inputPath, sha256(inputPath)])
			),
			entries,
		},
	}
}

function writeV2Artifact(root, sourceCommit = SOURCE_COMMIT) {
	fs.rmSync(root, { recursive: true, force: true })
	const { outputs, manifest } = v2ArtifactManifest(sourceCommit)
	writeJson(path.join(root, 'manifest.json'), manifest)
	for (const [relativePath, bytes] of outputs) writeFile(root, relativePath, bytes)
	return manifest
}

function initTarget(root, prepare) {
	const repoRoot = path.join(root, 'target')
	fs.mkdirSync(repoRoot)
	git(repoRoot, ['init', '--initial-branch=main'])
	git(repoRoot, ['config', 'user.email', 'publisher-test@invalid.example'])
	git(repoRoot, ['config', 'user.name', 'Publisher test'])
	writeFile(repoRoot, 'README.md', '# Fixture\n')
	prepare?.(repoRoot)
	git(repoRoot, ['add', '.'])
	git(repoRoot, ['commit', '-m', 'fixture: target base'])
	return { repoRoot, baseCommit: git(repoRoot, ['rev-parse', 'HEAD']) }
}

function makeFixture(t, { prepareTarget, preparePrior } = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-content-publisher-test-'))
	t.after(() => fs.rmSync(root, { recursive: true, force: true }))
	const { lockPath } = makeLock(root)
	const artifactRoot = path.join(root, 'artifact')
	const priorArtifactRoot = path.join(root, 'prior-artifact')
	const bundlePath = path.join(root, 'bundle.json')
	writeArtifact(artifactRoot)
	preparePrior?.(priorArtifactRoot)
	const { repoRoot, baseCommit } = initTarget(root, prepareTarget)
	return { root, lockPath, artifactRoot, priorArtifactRoot, bundlePath, repoRoot, baseCommit }
}

function pack(fixture, overrides = {}) {
	return createPublisherBundle({
		lockPath: fixture.lockPath,
		artifactRoot: fixture.artifactRoot,
		priorArtifactRoot: fixture.priorArtifactRoot,
		bundlePath: fixture.bundlePath,
		sourceCommit: SOURCE_COMMIT,
		targetBaseCommit: fixture.baseCommit,
		...overrides,
	})
}

function install(fixture, overrides = {}) {
	const bundle = JSON.parse(fs.readFileSync(fixture.bundlePath, 'utf8'))
	return installPublisherBundle({
		lockPath: fixture.lockPath,
		bundlePath: fixture.bundlePath,
		repoRoot: fixture.repoRoot,
		targetBaseCommit: fixture.baseCommit,
		sourceCommit: SOURCE_COMMIT,
		treeSha256: bundle.tree_sha256,
		...overrides,
	})
}

function mutateManifest(artifactRoot, mutate) {
	const manifestPath = path.join(artifactRoot, 'manifest.json')
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
	mutate(manifest)
	writeJson(manifestPath, manifest)
}

test('packs and installs one exact, manifest-backed artifact tree', (t) => {
	const fixture = makeFixture(t)
	const packed = pack(fixture)
	assert.deepEqual(packed.files, [
		'guides/safe-guide/en.md',
		'guides/safe-guide/es-419.md',
		'guides/safe-guide/pt-br.md',
		'manifest.json',
	])

	const installed = install(fixture)
	assert.equal(installed.sourceCommit, SOURCE_COMMIT)
	assert.equal(installed.treeSha256, packed.treeSha256)
	assert.deepEqual(installed.changedPaths, [
		'apps/web/src/generated/seo/guides/safe-guide/en.md',
		'apps/web/src/generated/seo/guides/safe-guide/es-419.md',
		'apps/web/src/generated/seo/guides/safe-guide/pt-br.md',
		'apps/web/src/generated/seo/manifest.json',
	])
	const copiedManifest = JSON.parse(
		fs.readFileSync(path.join(fixture.repoRoot, 'apps/web/src/generated/seo/manifest.json'), 'utf8')
	)
	assert.equal(copiedManifest.source_commit, SOURCE_COMMIT)
})

test('packs schema v2 as data while keeping the publisher bundle wire schema at v1', (t) => {
	const fixture = makeFixture(t)
	writeV2Artifact(fixture.artifactRoot)
	const packed = pack(fixture)
	assert.deepEqual(packed.files, [
		'calculators/mileage-split-calculator/en.json',
		'calculators/rent-split-calculator/en.json',
		'hubs/split/en.json',
		'hubs/split/es-419.json',
		'hubs/split/pt-br.json',
		'manifest.json',
		'tools-hubs/tools/en.json',
	])
	const bundle = JSON.parse(fs.readFileSync(fixture.bundlePath, 'utf8'))
	assert.equal(bundle.schema_version, 1)
	assert.equal(
		JSON.parse(Buffer.from(bundle.files.find((file) => file.path === 'manifest.json').content_base64, 'base64'))
			.schema_version,
		2
	)
})

test('upgrades an exact installed v1 artifact to v2 but refuses a v2-to-v1 downgrade', (t) => {
	const upgrade = makeFixture(t, {
		prepareTarget(repoRoot) {
			writeArtifact(path.join(repoRoot, 'apps/web/src/generated/seo'))
		},
		preparePrior(priorRoot) {
			writeArtifact(priorRoot)
		},
	})
	writeV2Artifact(upgrade.artifactRoot)
	pack(upgrade)
	const installed = install(upgrade)
	assert.equal(installed.sourceCommit, SOURCE_COMMIT)
	assert.equal(
		JSON.parse(fs.readFileSync(path.join(upgrade.repoRoot, 'apps/web/src/generated/seo/manifest.json'), 'utf8'))
			.schema_version,
		2
	)
	assert.equal(fs.existsSync(path.join(upgrade.repoRoot, 'apps/web/src/generated/seo/guides')), false)

	const downgrade = makeFixture(t, {
		preparePrior(priorRoot) {
			writeV2Artifact(priorRoot)
		},
	})
	assert.throws(() => pack(downgrade), /refusing to downgrade.*schema v2.*schema v1/)
})

test('schema v2 rejects unknown versions, partial cohorts, and unsafe legacy ownership', (t) => {
	const unknown = makeFixture(t)
	writeV2Artifact(unknown.artifactRoot)
	mutateManifest(unknown.artifactRoot, (manifest) => {
		manifest.schema_version = 3
	})
	assert.throws(() => pack(unknown), /schema_version must be 1 or 2/)

	const partial = makeFixture(t)
	writeV2Artifact(partial.artifactRoot)
	mutateManifest(partial.artifactRoot, (manifest) => {
		manifest.entries = manifest.entries.filter((entry) => entry.slug !== 'rent-split-calculator')
	})
	fs.unlinkSync(path.join(partial.artifactRoot, 'calculators/rent-split-calculator/en.json'))
	assert.throws(() => pack(partial), /calculator cohort mismatch/)

	const duplicateLegacy = makeFixture(t)
	writeV2Artifact(duplicateLegacy.artifactRoot)
	mutateManifest(duplicateLegacy.artifactRoot, (manifest) => {
		manifest.entries.at(-1).legacy_paths = ['/mileage-split-calculator']
	})
	assert.throws(() => pack(duplicateLegacy), /legacy paths.*duplicates/)

	const reservedLegacy = makeFixture(t)
	writeV2Artifact(reservedLegacy.artifactRoot)
	mutateManifest(reservedLegacy.artifactRoot, (manifest) => {
		manifest.entries.at(-1).legacy_paths = ['/import']
	})
	assert.throws(() => pack(reservedLegacy), /product or API namespace/)

	const conflictingLegacy = makeFixture(t)
	writeV2Artifact(conflictingLegacy.artifactRoot)
	mutateManifest(conflictingLegacy.artifactRoot, (manifest) => {
		manifest.entries.at(-1).legacy_paths = ['/en/split/tools']
	})
	assert.throws(() => pack(conflictingLegacy), /legacy path conflicts with a current public_path/)
})

test('schema v2 independently rejects noncanonical, active, falsely-provenanced, and wrong-typed JSON', (t) => {
	const mutateOutput = (
		fixture,
		mutate,
		{ canonical = true, select = (candidate) => candidate.content_type === 'hub' && candidate.locale === 'en' } = {}
	) => {
		const manifestPath = path.join(fixture.artifactRoot, 'manifest.json')
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
		const entry = manifest.entries.find(select)
		const outputPath = path.join(
			fixture.artifactRoot,
			...entry.output_path.slice('split-content/published/'.length).split('/')
		)
		const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
		const changed = mutate(payload)
		const contents = canonical ? `${JSON.stringify(changed, null, 2)}\n` : JSON.stringify(changed)
		fs.writeFileSync(outputPath, contents)
		entry.output_sha256 = sha256(contents)
		writeJson(manifestPath, manifest)
	}

	const noncanonicalManifest = makeFixture(t)
	writeV2Artifact(noncanonicalManifest.artifactRoot)
	const manifestPath = path.join(noncanonicalManifest.artifactRoot, 'manifest.json')
	fs.writeFileSync(manifestPath, JSON.stringify(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))))
	assert.throws(() => pack(noncanonicalManifest), /artifact manifest must use canonical two-space JSON/)

	const reorderedEntry = makeFixture(t)
	writeV2Artifact(reorderedEntry.artifactRoot)
	mutateManifest(reorderedEntry.artifactRoot, (manifest) => {
		const [first, ...rest] = manifest.entries
		const { content_type, slug, ...remaining } = first
		manifest.entries = [{ slug, content_type, ...remaining }, ...rest]
	})
	assert.throws(() => pack(reorderedEntry), /entries\[0\] keys must use the canonical order/)

	const noncanonical = makeFixture(t)
	writeV2Artifact(noncanonical.artifactRoot)
	mutateOutput(noncanonical, (payload) => payload, { canonical: false })
	assert.throws(() => pack(noncanonical), /canonical two-space JSON/)

	const active = makeFixture(t)
	writeV2Artifact(active.artifactRoot)
	mutateOutput(active, (payload) => ({ ...payload, content: { ...payload.content, raw_html: '<script>x</script>' } }))
	assert.throws(() => pack(active), /content keys must be exactly/)

	const falseProvenance = makeFixture(t)
	writeV2Artifact(falseProvenance.artifactRoot)
	mutateOutput(falseProvenance, (payload) => ({
		...payload,
		generated_from: { ...payload.generated_from, data: ['split-content/_system/data/pages/other.md'] },
	}))
	assert.throws(() => pack(falseProvenance), /generated_from flattened paths/)

	const numericRate = makeFixture(t)
	writeV2Artifact(numericRate.artifactRoot)
	mutateOutput(
		numericRate,
		(payload) => {
			payload.content.data.rows[1].rate_decimal = 0.3
			return payload
		},
		{ select: (candidate) => candidate.slug === 'mileage-split-calculator' }
	)
	assert.throws(() => pack(numericRate), /rate_decimal must be a non-negative decimal string or null/)
})

test('pins both the reviewed mirror Git blob and its bytes', (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-content-publisher-pin-'))
	t.after(() => fs.rmSync(root, { recursive: true, force: true }))
	const { lockPath, mirrorContents } = makeLock(root)
	const mirrorPath = path.join(root, 'mirror.mjs')
	fs.writeFileSync(mirrorPath, mirrorContents)

	assert.deepEqual(
		verifyMirrorScript({ lockPath, mirrorScriptPath: mirrorPath, mirrorScriptGitBlob: '1'.repeat(40) }),
		{
			mirrorScriptGitBlob: '1'.repeat(40),
			mirrorScriptSha256: sha256(mirrorContents),
		}
	)
	assert.throws(
		() => verifyMirrorScript({ lockPath, mirrorScriptPath: mirrorPath, mirrorScriptGitBlob: '2'.repeat(40) }),
		/does not match the reviewed pin/
	)
	fs.appendFileSync(mirrorPath, '// mutation\n')
	assert.throws(
		() => verifyMirrorScript({ lockPath, mirrorScriptPath: mirrorPath, mirrorScriptGitBlob: '1'.repeat(40) }),
		/SHA-256.*does not match the reviewed pin/
	)
})

test('rejects an output whose bytes disagree with the manifest hash', (t) => {
	const fixture = makeFixture(t)
	fs.appendFileSync(path.join(fixture.artifactRoot, 'guides/safe-guide/en.md'), 'tampered\n')
	assert.throws(() => pack(fixture), /artifact output SHA-256 mismatch/)
})

test('rejects an extra artifact file', (t) => {
	const fixture = makeFixture(t)
	writeFile(fixture.artifactRoot, 'notes.txt', 'not generated\n')
	assert.throws(() => pack(fixture), /artifact tree mismatch.*extra: notes\.txt/)
})

test('rejects symlinks and executable files in the artifact tree', (t) => {
	const symlinkFixture = makeFixture(t)
	fs.symlinkSync('en.md', path.join(symlinkFixture.artifactRoot, 'guides/safe-guide/alias.md'))
	assert.throws(() => pack(symlinkFixture), /contains a symlink/)

	const executableFixture = makeFixture(t)
	fs.chmodSync(path.join(executableFixture.artifactRoot, 'guides/safe-guide/en.md'), 0o755)
	assert.throws(() => pack(executableFixture), /contains an executable file/)
})

test('rejects a path traversal identity before packing', (t) => {
	const fixture = makeFixture(t)
	mutateManifest(fixture.artifactRoot, (manifest) => {
		manifest.entries[0].output_path = 'split-content/published/guides/safe-guide/../../outside.md'
	})
	assert.throws(() => pack(fixture), /output_path must be split-content\/published\/guides\/safe-guide\/en\.md/)
})

test('rejects a partial locale matrix', (t) => {
	const fixture = makeFixture(t)
	mutateManifest(fixture.artifactRoot, (manifest) => {
		manifest.entries.pop()
	})
	fs.unlinkSync(path.join(fixture.artifactRoot, 'guides/safe-guide/pt-br.md'))
	assert.throws(() => pack(fixture), /matrix.*exactly one en\/es-419\/pt-br entry/)
})

test('rejects false source provenance and unsorted input hashes', (t) => {
	const sourceFixture = makeFixture(t)
	mutateManifest(sourceFixture.artifactRoot, (manifest) => {
		manifest.source_commit = OTHER_COMMIT
	})
	assert.throws(() => pack(sourceFixture), /source_commit does not match the bundle/)

	const orderFixture = makeFixture(t)
	mutateManifest(orderFixture.artifactRoot, (manifest) => {
		manifest.input_sha256 = Object.fromEntries(Object.entries(manifest.input_sha256).reverse())
	})
	assert.throws(() => pack(orderFixture), /input_sha256 keys must be sorted/)
})

test('rejects tampered bundle bytes and a false tree digest', (t) => {
	const bytesFixture = makeFixture(t)
	pack(bytesFixture)
	const bytesBundle = JSON.parse(fs.readFileSync(bytesFixture.bundlePath, 'utf8'))
	bytesBundle.files[0].content_base64 = Buffer.from('tampered').toString('base64')
	writeJson(bytesFixture.bundlePath, bytesBundle)
	assert.throws(() => install(bytesFixture), /SHA-256 mismatch/)

	const treeFixture = makeFixture(t)
	pack(treeFixture)
	const treeBundle = JSON.parse(fs.readFileSync(treeFixture.bundlePath, 'utf8'))
	treeBundle.tree_sha256 = 'f'.repeat(64)
	writeJson(treeFixture.bundlePath, treeBundle)
	assert.throws(() => install(treeFixture), /tree_sha256 mismatch/)
})

test('rejects a target base race before touching the destination', (t) => {
	const fixture = makeFixture(t)
	pack(fixture)
	assert.throws(() => install(fixture, { targetBaseCommit: OTHER_COMMIT }), /requested target base does not match/)
	assert.equal(fs.existsSync(path.join(fixture.repoRoot, 'apps/web/src/generated/seo')), false)
})

test('binds the handoff bundle to the preparation job source and tree outputs', (t) => {
	const sourceFixture = makeFixture(t)
	pack(sourceFixture)
	assert.throws(() => install(sourceFixture, { sourceCommit: OTHER_COMMIT }), /expected source commit does not match/)
	assert.equal(fs.existsSync(path.join(sourceFixture.repoRoot, 'apps/web/src/generated/seo')), false)

	const treeFixture = makeFixture(t)
	pack(treeFixture)
	assert.throws(
		() => install(treeFixture, { treeSha256: 'f'.repeat(64) }),
		/expected artifact tree SHA-256 does not match/
	)
	assert.equal(fs.existsSync(path.join(treeFixture.repoRoot, 'apps/web/src/generated/seo')), false)
})

test('rejects a prior generated tree that differs from the preparation snapshot', (t) => {
	const fixture = makeFixture(t, {
		prepareTarget(repoRoot) {
			writeFile(repoRoot, 'apps/web/src/generated/seo/prior.txt', 'target prior\n')
		},
		preparePrior(priorRoot) {
			writeFile(priorRoot, 'prior.txt', 'different prior\n')
		},
	})
	pack(fixture)
	assert.throws(() => install(fixture), /does not match pinned prior tree/)
})

test('replaces an identical pinned prior tree and accepts only regular base blobs', (t) => {
	const priorContents = 'same prior\n'
	const fixture = makeFixture(t, {
		prepareTarget(repoRoot) {
			writeFile(repoRoot, 'apps/web/src/generated/seo/prior.txt', priorContents)
		},
		preparePrior(priorRoot) {
			writeFile(priorRoot, 'prior.txt', priorContents)
		},
	})
	pack(fixture)
	const installed = install(fixture)
	assert.equal(installed.sourceCommit, SOURCE_COMMIT)
	assert.equal(fs.existsSync(path.join(fixture.repoRoot, 'apps/web/src/generated/seo/prior.txt')), false)
})

test('rejects an executable generated blob already committed in the target base', (t) => {
	const priorContents = 'executable prior\n'
	const fixture = makeFixture(t, {
		prepareTarget(repoRoot) {
			writeFile(repoRoot, 'apps/web/src/generated/seo/prior.txt', priorContents, 0o755)
		},
		preparePrior(priorRoot) {
			writeFile(priorRoot, 'prior.txt', priorContents)
		},
	})
	pack(fixture)
	assert.throws(() => install(fixture), /generated artifact tree contains an executable file/)
})

test('rejects a destination symlink even when it is committed in the target base', (t) => {
	const fixture = makeFixture(t, {
		prepareTarget(repoRoot) {
			fs.mkdirSync(path.join(repoRoot, 'apps/web/src/generated'), { recursive: true })
			fs.symlinkSync('../../../../outside', path.join(repoRoot, 'apps/web/src/generated/seo'))
		},
	})
	pack(fixture)
	assert.throws(() => install(fixture), /destination path contains a symlink/)
})

test('rejects every worktree change outside the machine-owned destination', (t) => {
	const fixture = makeFixture(t)
	writeFile(fixture.repoRoot, 'unexpected.txt', 'outside\n')
	assert.throws(
		() =>
			assertPublisherDiff({
				lockPath: fixture.lockPath,
				repoRoot: fixture.repoRoot,
				targetBaseCommit: fixture.baseCommit,
			}),
		/unexpected target diff: unexpected\.txt/
	)
})

test('the create-only lease rejects a concurrently created artifact branch without advancing it', (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-content-publisher-push-race-'))
	t.after(() => fs.rmSync(root, { recursive: true, force: true }))
	const publisher = path.join(root, 'publisher')
	const cleanRemote = path.join(root, 'clean.git')
	const racedRemote = path.join(root, 'raced.git')
	const artifactRef = 'refs/heads/automation/split-content-artifacts'

	fs.mkdirSync(publisher)
	git(publisher, ['init', '--initial-branch=main'])
	git(publisher, ['config', 'user.email', 'publisher-test@invalid.example'])
	git(publisher, ['config', 'user.name', 'Publisher test'])
	writeFile(publisher, 'README.md', '# Publisher race fixture\n')
	git(publisher, ['add', '.'])
	git(publisher, ['commit', '-m', 'fixture: target base'])
	const baseCommit = git(publisher, ['rev-parse', 'HEAD'])

	execFileSync('git', ['init', '--bare', '--initial-branch=main', cleanRemote], { stdio: 'ignore' })
	execFileSync('git', ['init', '--bare', '--initial-branch=main', racedRemote], { stdio: 'ignore' })
	git(publisher, ['remote', 'add', 'clean', cleanRemote])
	git(publisher, ['remote', 'add', 'raced', racedRemote])
	git(publisher, ['push', 'clean', `${baseCommit}:refs/heads/main`])
	git(publisher, ['push', 'raced', `${baseCommit}:refs/heads/main`])

	writeFile(publisher, 'artifact.txt', 'validated artifact\n')
	git(publisher, ['add', 'artifact.txt'])
	git(publisher, ['commit', '-m', 'content: validated artifact'])
	const artifactCommit = git(publisher, ['rev-parse', 'HEAD'])

	const cleanCreate = gitResult(publisher, [
		'push',
		`--force-with-lease=${artifactRef}:`,
		'clean',
		`HEAD:${artifactRef}`,
	])
	assert.equal(cleanCreate.status, 0, cleanCreate.stderr)
	assert.equal(git(publisher, ['ls-remote', 'clean', artifactRef]).split(/\s/)[0], artifactCommit)

	assert.equal(git(publisher, ['ls-remote', 'raced', artifactRef]), '')
	git(publisher, ['push', 'raced', `${baseCommit}:${artifactRef}`])
	const plainFastForward = gitResult(publisher, ['push', '--dry-run', 'raced', `HEAD:${artifactRef}`])
	assert.equal(plainFastForward.status, 0, plainFastForward.stderr)
	const racedCreate = gitResult(publisher, [
		'push',
		`--force-with-lease=${artifactRef}:`,
		'raced',
		`HEAD:${artifactRef}`,
	])
	assert.notEqual(racedCreate.status, 0)
	assert.match(racedCreate.stderr, /stale info|rejected/)
	assert.equal(git(publisher, ['ls-remote', 'raced', artifactRef]).split(/\s/)[0], baseCommit)
})

test('formatting excludes hash-bound generated bytes while CI keeps the real-artifact validator', () => {
	const ignored = fs
		.readFileSync(path.join(REPO_ROOT, 'apps/web/.prettierignore'), 'utf8')
		.split(/\r?\n/)
		.filter((line) => line === 'src/generated/seo/')
	assert.deepEqual(ignored, ['src/generated/seo/'])

	const ciWorkflow = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')
	assert.match(ciWorkflow, /Validate the installed generated Split artifact/)
	assert.match(ciWorkflow, /SPLIT_CONTENT_ARTIFACT_ROOT="\$\{artifact_root\}"/)
	assert.match(ciWorkflow, /vitest run src\/lib\/split-content\/published-artifact\.test\.tsx/)

	const validator = fs.readFileSync(
		path.join(REPO_ROOT, 'apps/web/src/lib/split-content/published-artifact.test.tsx'),
		'utf8'
	)
	assert.match(validator, /loadSplitContentManifest/)
	assert.match(validator, /renderSplitGuideBody/)
	assert.match(validator, /splitGuideMetadataFor/)
})

test('the CLI fails closed on unknown commands and arguments', (t) => {
	const fixture = makeFixture(t)
	const script = path.join(REPO_ROOT, 'scripts/split-content-publisher.mjs')
	const unknownCommand = spawnSync(process.execPath, [script, 'publish-now'], { encoding: 'utf8' })
	assert.equal(unknownCommand.status, 1)
	assert.match(unknownCommand.stderr, /unknown command/)

	const unknownArgument = spawnSync(
		process.execPath,
		[
			script,
			'assert-diff',
			'--lock',
			fixture.lockPath,
			'--repo-root',
			fixture.repoRoot,
			'--target-base-commit',
			fixture.baseCommit,
			'--force',
			'1',
		],
		{ encoding: 'utf8' }
	)
	assert.equal(unknownArgument.status, 1)
	assert.match(unknownArgument.stderr, /unknown argument: --force/)
})

test('workflow contracts keep publication manual, split credentials by job, and bind dispatched CI', () => {
	const publisherWorkflow = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/split-content-pull.yml'), 'utf8')
	const ciWorkflow = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')

	assert.doesNotMatch(publisherWorkflow, /^\s*schedule:/m)
	assert.match(publisherWorkflow, /^\s*workflow_dispatch:/m)
	assert.match(publisherWorkflow, /MONO_SPLIT_CONTENT_READ_KEY/)
	assert.match(publisherWorkflow, /environment: split-content-publisher-read/)
	const [prepareWorkflow, publishWorkflow] = publisherWorkflow.split(/^  publish:$/m)
	assert.doesNotMatch(prepareWorkflow, /contents: write|pull-requests: write|\$\{\{ github\.token \}\}|git push/)
	assert.doesNotMatch(publishWorkflow, /MONO_SPLIT_CONTENT_READ_KEY/)
	assert.match(publisherWorkflow, /prepare:[\s\S]*?permissions:\n\s+contents: read/)
	assert.match(
		publisherWorkflow,
		/publish:[\s\S]*?permissions:\n\s+actions: write\n\s+contents: write\n\s+pull-requests: write/
	)
	assert.match(publisherWorkflow, /HEAD:refs\/heads\/automation\/split-content-artifacts/)
	assert.equal((publisherWorkflow.match(/git push /g) ?? []).length, 1)
	assert.equal((publisherWorkflow.match(/--force-with-lease=/g) ?? []).length, 1)
	assert.match(
		publisherWorkflow,
		/--force-with-lease=refs\/heads\/automation\/split-content-artifacts:\s+\\\s+origin\s+\\\s+HEAD:refs\/heads\/automation\/split-content-artifacts/
	)
	assert.doesNotMatch(publisherWorkflow, /--force(?!-with-lease=refs\/heads\/automation\/split-content-artifacts:)/)
	assert.match(publisherWorkflow, /second mirror pass was not a no-op/)
	assert.match(publisherWorkflow, /Mirror script Git blob/)
	assert.match(publisherWorkflow, /Mirror script SHA-256/)
	assert.match(publisherWorkflow, /gh workflow run ci\.yml[\s\S]*expected_head_sha/)
	assert.match(ciWorkflow, /workflow_dispatch:[\s\S]*expected_head_sha:/)
	assert.equal((ciWorkflow.match(/ACTUAL_HEAD_SHA: \$\{\{ github\.sha \}\}/g) ?? []).length, 2)
	assert.match(ciWorkflow, /if \[\[ ! -f "\$\{artifact_root\}\/manifest\.json" \]\]/)
	assert.match(ciWorkflow, /SPLIT_CONTENT_ARTIFACT_ROOT="\$\{artifact_root\}"/)
	assert.match(ciWorkflow, /vitest run src\/lib\/split-content\/published-artifact\.test\.tsx/)
})
