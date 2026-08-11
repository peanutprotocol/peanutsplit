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
