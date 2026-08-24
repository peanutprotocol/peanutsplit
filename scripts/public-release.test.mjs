import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
	appendFileSync,
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import {
	CLEAN_ATTESTATION_ENVIRONMENT_NAMES,
	HARD_EXCLUDED_PATHS,
	OFFICIAL_LICENSE,
	PUBLIC_RELEASE_COMMIT,
	PUBLIC_RELEASE_ENVIRONMENT_KEYS,
	REQUIRED_BUILD_COMMANDS,
	REQUIRED_DOCUMENTS,
	REQUIRED_GATES,
	attestCandidate,
	auditCandidate,
	buildCandidate,
	createReleaseReceipt,
} from './public-release-lib.mjs'

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..')
const CLI = join(REPOSITORY_ROOT, 'scripts/public-release.mjs')
const LICENSE_BYTES = readFileSync(join(REPOSITORY_ROOT, OFFICIAL_LICENSE.path))
const CI_TEMPLATE_BYTES = readFileSync(join(REPOSITORY_ROOT, 'public-release/templates/.github/workflows/ci.yml'))
const SOURCE_DOCUMENTS = [
	'CONTRIBUTING.md',
	'MAINTAINERS.md',
	'SECURITY.md',
	'STEWARDSHIP.md',
	'THIRD_PARTY_NOTICES.md',
	'TRADEMARKS.md',
]
const TEMPLATE_FILES = [
	{
		destination: '.github/ISSUE_TEMPLATE/bug_report.yml',
		source: 'public-release/templates/.github/ISSUE_TEMPLATE/bug_report.yml',
	},
	{
		destination: '.github/ISSUE_TEMPLATE/config.yml',
		source: 'public-release/templates/.github/ISSUE_TEMPLATE/config.yml',
	},
	{
		destination: '.github/workflows/ci.yml',
		source: 'public-release/templates/.github/workflows/ci.yml',
	},
	{ destination: 'README.md', source: 'public-release/templates/README.md' },
	{ destination: 'docs/README.md', source: 'public-release/templates/docs/README.md' },
]

function hash(value) {
	return createHash('sha256').update(value).digest('hex')
}

function write(root, path, value, mode = 0o644) {
	const absolute = join(root, ...path.split('/'))
	mkdirSync(dirname(absolute), { recursive: true })
	writeFileSync(absolute, value, { mode })
}

function writeJson(root, path, value) {
	write(root, path, `${JSON.stringify(value, null, 2)}\n`)
}

function pendingClearance() {
	return {
		schema_version: 1,
		candidate_scope: 'apps/web',
		private_origin_commit: null,
		profile_sha256: null,
		input_tree_sha256: null,
		gates: Object.fromEntries(
			REQUIRED_GATES.map((name) => [
				name,
				{ status: 'pending', approved_by: null, approved_at: null, evidence: [] },
			])
		),
	}
}

function profile() {
	return {
		schema_version: 1,
		source_scope: 'apps/web',
		application_paths: ['.env.example', 'Dockerfile', 'docker-compose.yml', 'package.json', 'public/', 'src/'],
		asset_paths: ['public/icon.svg'],
		candidate_templates: TEMPLATE_FILES,
		repository_documents: [...SOURCE_DOCUMENTS, 'docs/current/'].sort(),
		excluded_paths: [...HARD_EXCLUDED_PATHS],
	}
}

function git(root, args) {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function releaseEnvironmentConfig(format) {
	if (format === 'env') return `${PUBLIC_RELEASE_ENVIRONMENT_KEYS.map((key) => `${key}=`).join('\n')}\n`
	if (format === 'docker') {
		return `${PUBLIC_RELEASE_ENVIRONMENT_KEYS.map((key) => `ARG ${key}\nENV ${key}=$${key}`).join('\n')}\n`
	}
	return `services:\n  app:\n    build:\n      args:\n${PUBLIC_RELEASE_ENVIRONMENT_KEYS.map(
		(key) => `        ${key}: \${${key}:-}`
	).join('\n')}\n`
}

function flagsSource() {
	return `export interface PublicSourceReceipt { commit: string; archiveUrl: string; archiveSha256: string }
export function publicSourceReceipt(): PublicSourceReceipt | null {
  const commit = process.env.NEXT_PUBLIC_SOURCE_COMMIT ?? ''
  const buildCommit = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? ''
  const archiveUrl = process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL ?? ''
  const archiveSha256 = process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256 ?? ''
  if (!/^[0-9a-f]{40}$/.test(commit) || buildCommit !== commit || !/^[0-9a-f]{64}$/.test(archiveSha256)) return null
  try {
    const parsed = new URL(archiveUrl)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return null
    if (!parsed.pathname.includes(commit) && !parsed.pathname.includes(archiveSha256)) return null
  } catch { return null }
  return { commit, archiveUrl, archiveSha256 }
}
export const publicFossReleased = () =>
  process.env.NEXT_PUBLIC_FOSS_RELEASED === '1' && publicSourceReceipt() !== null
`
}

function fixture(t) {
	const base = mkdtempSync(join(tmpdir(), 'split-public-release-'))
	const root = join(base, 'source')
	const out = join(base, 'candidate')
	const draft = join(base, 'draft')
	const ledger = join(base, 'candidate-private-ledger.json')
	const draftLedger = join(base, 'draft-private-ledger.json')
	mkdirSync(root)
	t.after(() => rmSync(base, { recursive: true, force: true }))

	writeJson(root, 'package.json', { name: 'private-source', private: true, license: 'UNLICENSED' })
	write(root, '.gitignore', 'apps/web/src/*.log\n')
	writeJson(root, 'apps/web/package.json', { name: 'candidate-web', version: '1.0.0', private: true })
	write(root, 'apps/web/.env.example', releaseEnvironmentConfig('env'))
	write(root, 'apps/web/Dockerfile', releaseEnvironmentConfig('docker'))
	write(root, 'apps/web/docker-compose.yml', releaseEnvironmentConfig('compose'))
	write(root, 'apps/web/src/index.ts', "export const product = 'Split'\n")
	write(root, 'apps/web/src/lib/flags.ts', flagsSource())
	write(
		root,
		'apps/web/src/app/(product-shell)/(marketing)/source/page.tsx',
		'export default function SourcePage() {\n\tif (!publicFossReleased()) notFound()\n\treturn null\n}\n'
	)
	write(
		root,
		'apps/web/src/components/marketing/SiteFooter.tsx',
		"export function SiteFooter() {\n\treturn publicFossReleased() && 'Source'\n}\n"
	)
	write(
		root,
		'apps/web/src/components/marketing/mdx/blocks.tsx',
		"import { publicFossReleased } from '@/lib/flags'\nexport function PublicSourceOnly({ children }) {\n\treturn publicFossReleased() ? children : null\n}\n"
	)
	write(root, 'apps/web/src/data/static-pages.ts', 'export const sourcePage = { inSitemap: publicFossReleased }\n')
	write(
		root,
		'apps/web/src/lib/content.ts',
		"export const available = (doc) =>\n\tdoc.frontmatter.releaseGate !== 'public-source' || doc.frontmatter.publicSourceUpgrade || publicFossReleased()\n"
	)
	for (const locale of ['en', 'es-419', 'pt-br']) {
		write(
			root,
			`apps/web/src/content/alternatives/splitwise-alternative/${locale}.md`,
			'---\ntitle: Safe base title\ndescription: Safe base description\npublicSourceTitle: Public source title\npublicSourceDescription: Public source description\nreleaseGate: public-source\nclaims:\n  - public-source-and-self-hosting\n---\n<PublicSourceOnly>Public source body</PublicSourceOnly>\n'
		)
	}
	write(root, 'apps/web/public/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n')
	for (const document of SOURCE_DOCUMENTS) write(root, document, `# ${document}\n\nCleared fixture document.\n`)
	write(root, 'docs/current/LICENSING.md', '# Licensing\n\nCleared release documentation.\n')
	write(root, 'docs/current/PUBLIC-RELEASE.md', '# Public release\n\nAll release gates are cleared.\n')
	write(
		root,
		'public-release/templates/README.md',
		'# Candidate\n\nThis is the history-free `apps/web` distribution.\n'
	)
	write(root, 'public-release/templates/docs/README.md', '# Candidate docs\n')
	write(root, 'public-release/templates/.github/ISSUE_TEMPLATE/bug_report.yml', 'name: Bug report\nbody: []\n')
	write(root, 'public-release/templates/.github/ISSUE_TEMPLATE/config.yml', 'blank_issues_enabled: false\n')
	write(root, 'public-release/templates/.github/workflows/ci.yml', CI_TEMPLATE_BYTES)
	writeJson(root, 'public-release/allowlist.json', profile())
	writeJson(root, 'public-release/clearance.json', pendingClearance())
	write(root, OFFICIAL_LICENSE.path, LICENSE_BYTES)

	execFileSync('git', ['init', '--initial-branch=main'], { cwd: root, stdio: 'ignore' })
	git(root, ['config', 'user.email', 'release-test@invalid.example'])
	git(root, ['config', 'user.name', 'Public release test'])
	git(root, ['add', '.'])
	git(root, ['commit', '-m', 'fixture: public release source'])
	return { base, root, out, draft, ledger, draftLedger, commit: git(root, ['rev-parse', 'HEAD']) }
}

function writeApprovedClearance(value, plan) {
	const approvalRoot = join(value.base, 'approval')
	const gates = {}
	for (const name of REQUIRED_GATES) {
		const evidencePath = `evidence/${name}.json`
		const evidence = `${JSON.stringify({ gate: name, decision: 'approved' })}\n`
		write(approvalRoot, evidencePath, evidence)
		gates[name] = {
			status: 'approved',
			approved_by: 'release-owner',
			approved_at: '2026-08-24',
			evidence: [{ path: evidencePath, sha256: hash(evidence) }],
		}
	}
	const clearancePath = join(approvalRoot, 'clearance.json')
	writeJson(approvalRoot, 'clearance.json', {
		schema_version: 1,
		candidate_scope: 'apps/web',
		private_origin_commit: plan.private_origin_commit,
		profile_sha256: plan.profile_sha256,
		input_tree_sha256: plan.input_tree_sha256,
		gates,
	})
	return clearancePath
}

function writePassingAttestation(value, plan, filename = 'build-attestation.json') {
	const attestationPath = join(value.base, filename)
	writeJson(value.base, filename, {
		schema_version: 1,
		candidate_scope: 'apps/web',
		private_origin_commit: plan.private_origin_commit,
		profile_sha256: plan.profile_sha256,
		input_tree_sha256: plan.input_tree_sha256,
		environment_names: [...CLEAN_ATTESTATION_ENVIRONMENT_NAMES],
		commands: Object.fromEntries(
			Object.entries(REQUIRED_BUILD_COMMANDS).map(([name, command]) => [
				name,
				{
					command: [...command],
					status: 'passed',
					completed_at: '2026-08-24T12:00:00.000Z',
					log_sha256: hash(`passed ${name}`),
				},
			])
		),
		verified_by: 'ci/public-candidate',
		verified_at: '2026-08-24T12:00:00.000Z',
	})
	return attestationPath
}

function prepareReleaseInputs(value) {
	const plan = buildCandidate({ root: value.root, mode: 'draft', dryRun: true })
	const clearancePath = writeApprovedClearance(value, plan)
	buildCandidate({
		root: value.root,
		outDir: value.draft,
		ledgerOutPath: value.draftLedger,
		mode: 'draft',
	})
	const attestationPath = join(value.base, 'build-attestation.json')
	let sawEnvironment = false
	attestCandidate({
		candidateDir: value.draft,
		sourceRoot: value.root,
		ledgerPath: value.draftLedger,
		outPath: attestationPath,
		verifiedBy: 'ci/public-candidate',
		commandRunner(command, { environment }) {
			sawEnvironment = true
			assert.deepEqual(Object.keys(environment).sort(), [...CLEAN_ATTESTATION_ENVIRONMENT_NAMES])
			assert.equal(environment.NEXT_PUBLIC_FOSS_RELEASED, undefined)
			return { status: 0, output: Buffer.from(`passed ${command.join(' ')}`) }
		},
		now: () => new Date('2026-08-24T12:00:00.000Z'),
	})
	assert.equal(sawEnvironment, true)
	return { plan, clearancePath, attestationPath }
}

test('pins the exact official GNU AGPLv3 bytes and checksum', () => {
	assert.equal(hash(LICENSE_BYTES), OFFICIAL_LICENSE.sha256)
	assert.match(LICENSE_BYTES.toString('utf8'), /^\s*GNU AFFERO GENERAL PUBLIC LICENSE/m)
	assert.match(LICENSE_BYTES.toString('utf8'), /<https:\/\/www\.gnu\.org\/licenses\/>\.\n$/)
})

test('real private-tree dry-run scans the full current allowlist without writing', () => {
	const result = buildCandidate({ root: REPOSITORY_ROOT, mode: 'draft', dryRun: true })
	assert.equal(result.dry_run, true)
	assert.equal(result.mode, 'draft')
	assert.ok(result.files >= 800)
	assert.deepEqual(result.pending_gates, REQUIRED_GATES)
	assert.equal(existsSync(join(REPOSITORY_ROOT, 'LICENSE')), false)
})

test('dry-run resolves an explicit flag-closed draft without writing output', (t) => {
	const value = fixture(t)
	const result = buildCandidate({ root: value.root, outDir: value.out, mode: 'draft', dryRun: true })
	assert.deepEqual(result.pending_gates, REQUIRED_GATES)
	assert.equal(result.private_origin_commit, value.commit)
	assert.equal(result.source_dirty, false)
	assert.equal(result.files, 28)
	assert.equal(result.foss_release_boundary.default, 'closed')
	assert.deepEqual(result.foss_release_boundary.required_environment, PUBLIC_RELEASE_ENVIRONMENT_KEYS)
	assert.equal(existsSync(value.out), false)
})

test('builds a source-backed, unlicensed, history-free apps/web draft with public scaffolding', (t) => {
	const value = fixture(t)
	const result = buildCandidate({
		root: value.root,
		outDir: value.out,
		ledgerOutPath: value.ledger,
		mode: 'draft',
	})
	assert.equal(result.mode, 'draft')
	assert.equal(result.private_origin_commit, value.commit)
	for (const path of ['LICENSE', '.git', 'apps/api', 'apps/web/README.md', 'PUBLIC_RELEASE_MANIFEST.json'])
		assert.equal(existsSync(join(value.out, path)), false)
	assert.equal(JSON.parse(readFileSync(join(value.out, 'apps/web/package.json'))).license, 'UNLICENSED')
	for (const document of REQUIRED_DOCUMENTS) assert.equal(existsSync(join(value.out, document)), true, document)
	for (const path of ['.github/ISSUE_TEMPLATE/bug_report.yml', '.github/workflows/ci.yml']) {
		assert.equal(existsSync(join(value.out, path)), true)
	}
	const ledger = JSON.parse(readFileSync(value.ledger))
	assert.equal(ledger.private_origin_commit, value.commit)
	assert.equal(ledger.build_attestation, null)
	assert.equal(ledger.license.spdx, 'UNLICENSED')
	for (const file of ledger.files) {
		const bytes = readFileSync(join(value.out, ...file.path.split('/')))
		assert.equal(hash(bytes), file.sha256, file.path)
	}
	assert.equal(
		auditCandidate(value.out, { sourceRoot: value.root, ledgerPath: value.ledger }).ledger_sha256,
		result.ledger_sha256
	)
	chmodSync(value.ledger, 0o644)
	assert.throws(
		() => auditCandidate(value.out, { sourceRoot: value.root, ledgerPath: value.ledger }),
		/not be readable or writable by group or other users/
	)
})

test('release mode fails closed on pending human clearance', (t) => {
	const value = fixture(t)
	assert.throws(
		() => buildCandidate({ root: value.root, outDir: value.out, mode: 'release' }),
		/pending human gates: squirrel_labs_authority, assets, content, third_party_notices, peanut_reference_budget/
	)
	assert.equal(existsSync(value.out), false)
})

test('release mode requires the external clean-candidate build attestation', (t) => {
	const value = fixture(t)
	const plan = buildCandidate({ root: value.root, mode: 'draft', dryRun: true })
	const clearancePath = writeApprovedClearance(value, plan)
	assert.throws(
		() => buildCandidate({ root: value.root, outDir: value.out, mode: 'release', clearancePath }),
		/build attestation path is required/
	)
})

test('release mode treats an explicit NO-GO document as a hard blocker', (t) => {
	const value = fixture(t)
	write(
		value.root,
		'docs/current/PUBLIC-RELEASE.md',
		'# Public release\n\nThe current public candidate is **NO-GO**.\n'
	)
	git(value.root, ['add', 'docs/current/PUBLIC-RELEASE.md'])
	git(value.root, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture: no-go release state'])
	const inputs = prepareReleaseInputs(value)
	assert.throws(
		() =>
			buildCandidate({
				root: value.root,
				outDir: value.out,
				ledgerOutPath: value.ledger,
				mode: 'release',
				clearancePath: inputs.clearancePath,
				buildAttestationPath: inputs.attestationPath,
			}),
		/release-state documents\/surfaces are still drafts: docs\/current\/PUBLIC-RELEASE.md/
	)
})

test('approved clean release gets only the pinned LICENSE and SPDX transform', (t) => {
	const value = fixture(t)
	const inputs = prepareReleaseInputs(value)
	const result = buildCandidate({
		root: value.root,
		outDir: value.out,
		ledgerOutPath: value.ledger,
		mode: 'release',
		clearancePath: inputs.clearancePath,
		buildAttestationPath: inputs.attestationPath,
	})
	assert.equal(result.mode, 'release')
	assert.deepEqual(readFileSync(join(value.out, 'LICENSE')), LICENSE_BYTES)
	assert.equal(JSON.parse(readFileSync(join(value.out, 'apps/web/package.json'))).license, 'AGPL-3.0-or-later')
	assert.equal(
		auditCandidate(value.out, {
			sourceRoot: value.root,
			ledgerPath: value.ledger,
			clearancePath: inputs.clearancePath,
			buildAttestationPath: inputs.attestationPath,
		}).files,
		result.files
	)
})

test('build attestation rejects commands that mutate audited candidate inputs', (t) => {
	const value = fixture(t)
	buildCandidate({
		root: value.root,
		outDir: value.draft,
		ledgerOutPath: value.draftLedger,
		mode: 'draft',
	})
	let mutated = false
	assert.throws(
		() =>
			attestCandidate({
				candidateDir: value.draft,
				sourceRoot: value.root,
				ledgerPath: value.draftLedger,
				outPath: join(value.base, 'mutated-attestation.json'),
				verifiedBy: 'ci/public-candidate',
				commandRunner() {
					if (!mutated) {
						mutated = true
						appendFileSync(join(value.draft, 'apps/web/src/index.ts'), '// command mutation\n')
					}
					return { status: 0, output: Buffer.from('passed') }
				},
				now: () => new Date('2026-08-24T12:00:00.000Z'),
			}),
		/mutated an audited input/
	)
})

test('release rejects dirty and ignored/untracked source inputs', (t) => {
	{
		const value = fixture(t)
		const inputs = prepareReleaseInputs(value)
		write(value.root, 'scratch.txt', 'dirty\n')
		assert.throws(
			() =>
				buildCandidate({
					root: value.root,
					outDir: value.out,
					mode: 'release',
					clearancePath: inputs.clearancePath,
					buildAttestationPath: inputs.attestationPath,
				}),
			/requires a clean source worktree/
		)
	}
	{
		const value = fixture(t)
		write(value.root, 'apps/web/src/release-only.log', 'ignored but allowlisted\n')
		const plan = buildCandidate({ root: value.root, mode: 'draft', dryRun: true })
		const clearancePath = writeApprovedClearance(value, plan)
		assert.throws(
			() => buildCandidate({ root: value.root, outDir: value.out, mode: 'release', clearancePath }),
			/untracked or carries an unsafe index flag/
		)
	}
})

test('release binds every source byte and mode to the captured commit despite index flags', (t) => {
	const value = fixture(t)
	git(value.root, ['update-index', '--assume-unchanged', 'apps/web/src/index.ts'])
	write(value.root, 'apps/web/src/index.ts', "export const product = 'private worktree mutation'\n")
	assert.equal(git(value.root, ['status', '--porcelain=v1']), '')
	const plan = buildCandidate({ root: value.root, mode: 'draft', dryRun: true })
	const clearancePath = writeApprovedClearance(value, plan)
	const attestationPath = writePassingAttestation(value, plan)
	assert.throws(
		() =>
			buildCandidate({
				root: value.root,
				outDir: value.out,
				ledgerOutPath: value.ledger,
				mode: 'release',
				clearancePath,
				buildAttestationPath: attestationPath,
			}),
		/unsafe index flag|differs in bytes or mode from captured commit/
	)
	assert.equal(existsSync(value.out), false)
})

test('release rejects a root LICENSE hidden from the private worktree', (t) => {
	const value = fixture(t)
	write(value.root, 'LICENSE', 'private-source license that must not be published\n')
	git(value.root, ['add', 'LICENSE'])
	git(value.root, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture: hidden root license'])
	git(value.root, ['update-index', '--skip-worktree', 'LICENSE'])
	rmSync(join(value.root, 'LICENSE'))
	assert.equal(git(value.root, ['status', '--porcelain=v1']), '')
	const plan = buildCandidate({ root: value.root, mode: 'draft', dryRun: true })
	const clearancePath = writeApprovedClearance(value, plan)
	const attestationPath = writePassingAttestation(value, plan)
	assert.throws(
		() =>
			buildCandidate({
				root: value.root,
				outDir: value.out,
				ledgerOutPath: value.ledger,
				mode: 'release',
				clearancePath,
				buildAttestationPath: attestationPath,
			}),
		/captured private source commit must not contain a root LICENSE/
	)
})

test('FOSS boundary rejects open defaults and semantic gate bypasses', (t) => {
	{
		const value = fixture(t)
		write(
			value.root,
			'apps/web/.env.example',
			`${releaseEnvironmentConfig('env')}  export NEXT_PUBLIC_FOSS_RELEASED=1\n`
		)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			/must leave NEXT_PUBLIC_FOSS_RELEASED unset/
		)
	}
	{
		const value = fixture(t)
		const source = flagsSource().replace(
			"export const publicFossReleased = () =>\n  process.env.NEXT_PUBLIC_FOSS_RELEASED === '1' && publicSourceReceipt() !== null",
			"// process.env.NEXT_PUBLIC_FOSS_RELEASED === '1'\nexport const publicFossReleased = () => true"
		)
		write(value.root, 'apps/web/src/lib/flags.ts', source)
		assert.throws(() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }), /must default closed/)
	}
	{
		const value = fixture(t)
		const workflowPath = join(value.root, 'public-release/templates/.github/workflows/ci.yml')
		writeFileSync(workflowPath, readFileSync(workflowPath, 'utf8').replace('src/lib/content.test.ts\n', ''))
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			/CI FOSS boundary command does not exactly match the attestation gate/
		)
	}
	{
		const value = fixture(t)
		write(
			value.root,
			'apps/web/src/components/marketing/mdx/blocks.tsx',
			"import { publicFossReleased } from '@/lib/flags'\nexport function PublicSourceOnly({ children }) {\n\treturn children\n\treturn publicFossReleased() ? children : null\n}\n"
		)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			/PublicSourceOnly must be a single fail-closed conditional return/
		)
	}
})

test('public CI rejects action, permission, and command allowlist bypasses', (t) => {
	{
		const value = fixture(t)
		const workflowPath = join(value.root, 'public-release/templates/.github/workflows/ci.yml')
		writeFileSync(
			workflowPath,
			readFileSync(workflowPath, 'utf8').replace(
				'uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
				'uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # unreviewed suffix'
			)
		)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			/actions must exactly match the pinned action allowlist/
		)
	}
	{
		const value = fixture(t)
		const workflowPath = join(value.root, 'public-release/templates/.github/workflows/ci.yml')
		writeFileSync(
			workflowPath,
			readFileSync(workflowPath, 'utf8').replace(
				'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
				'attacker/action@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
			)
		)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			/actions must exactly match the pinned action allowlist/
		)
	}
	{
		const value = fixture(t)
		const workflowPath = join(value.root, 'public-release/templates/.github/workflows/ci.yml')
		writeFileSync(
			workflowPath,
			readFileSync(workflowPath, 'utf8').replace(
				'  web:\n',
				'  web:\n    permissions: { contents: read, id-token: write }\n'
			)
		)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			/must use a read-only token/
		)
	}
	{
		const value = fixture(t)
		const workflowPath = join(value.root, 'public-release/templates/.github/workflows/ci.yml')
		writeFileSync(
			workflowPath,
			readFileSync(workflowPath, 'utf8')
				.replace(
					'run: pnpm --dir apps/web install --frozen-lockfile',
					"run: echo 'skip install --frozen-lockfile'"
				)
				.replace('run: pnpm --dir apps/web typecheck', "run: echo 'skip typecheck'")
				.replace('run: pnpm --dir apps/web build', "run: echo 'skip build'")
		)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			/run commands must exactly match the attestation command allowlist/
		)
	}
})

test('secret scan catches ordinary unquoted environment secrets without echoing them', (t) => {
	{
		const value = fixture(t)
		const secret = 'test-but-live-secret-0123456789abcdef'
		appendFileSync(join(value.root, 'apps/web/.env.example'), `AWS_SECRET_ACCESS_KEY=${secret}\n`)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			(error) => /AWS_SECRET_ACCESS_KEY/.test(error.message) && !error.message.includes(secret)
		)
	}
	{
		const value = fixture(t)
		const secret = 'long-real-value-that-must-not-ship'
		write(value.root, 'apps/web/src/leak.ts', `export const API_TOKEN = '${secret}'\n`)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			(error) => /literal credential assignment/.test(error.message) && !error.message.includes(secret)
		)
	}
	{
		const value = fixture(t)
		const secret = 'random-secret-8ad2078fbef3468a93a252fc'
		write(value.root, 'apps/web/src/leak.ts', `export const api_secret = '${secret}'\n`)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			(error) => /literal credential assignment/.test(error.message) && !error.message.includes(secret)
		)
	}
	for (const name of ['TOKEN', 'SECRET']) {
		const value = fixture(t)
		const secret = 'random-live-credential-0123456789abcdef'
		write(value.root, 'apps/web/src/leak.ts', `export const ${name} = '${secret}'\n`)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			(error) => /literal credential assignment/.test(error.message) && !error.message.includes(secret)
		)
	}
	{
		const value = fixture(t)
		const secret = 'Correct horse battery staple.'
		write(value.root, 'apps/web/src/leak.ts', `export const DB_PASSWORD = '${secret}'\n`)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			(error) => /literal credential assignment/.test(error.message) && !error.message.includes(secret)
		)
	}
	{
		const value = fixture(t)
		const secret = 'SuperSecretPassword'
		write(
			value.root,
			'apps/web/src/leak.ts',
			`export const ENDPOINT = 'https://admin:${secret}@service.company.co/api'\n`
		)
		assert.throws(
			() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }),
			(error) => /credential-bearing service URL/.test(error.message) && !error.message.includes(secret)
		)
	}
})

test('script scan ignores identifiers, member expressions, cookie names, and explicit test sentinels', (t) => {
	const value = fixture(t)
	write(
		value.root,
		'apps/web/src/safe-sentinels.test.ts',
		`const classTokens = collectClassTokens()
const SECRET_COOKIE = '__Host-ps-install-handoff'
const secret = 'Only private support should see this sentence.'
const api_secret = 'api-secret-value'
const providerApiKey = 'test-gemini-key'
export const body = { token: created.memberToken, classTokens, SECRET_COOKIE, secret, api_secret, providerApiKey }
`
	)
	assert.doesNotThrow(() => buildCandidate({ root: value.root, mode: 'draft', dryRun: true }))
})

test('allowlist cannot escape apps/web or acquire an unlisted media asset', (t) => {
	const first = fixture(t)
	const escaped = profile()
	escaped.application_paths = ['../api', ...escaped.application_paths].sort()
	writeJson(first.root, 'public-release/allowlist.json', escaped)
	assert.throws(
		() => buildCandidate({ root: first.root, mode: 'draft', dryRun: true }),
		/application_paths\[0\].*normalized repository-relative path|must be relative to apps\/web/
	)
	const second = fixture(t)
	write(second.root, 'apps/web/public/unreviewed.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
	assert.throws(
		() => buildCandidate({ root: second.root, mode: 'draft', dryRun: true }),
		/media\/font asset must be exact-allowlisted/
	)
})

test('independent source-backed audit rejects tampering, history, and excluded extras', (t) => {
	{
		const value = fixture(t)
		buildCandidate({
			root: value.root,
			outDir: value.out,
			ledgerOutPath: value.ledger,
			mode: 'draft',
		})
		appendFileSync(join(value.out, 'apps/web/src/index.ts'), '// tampered\n')
		assert.throws(
			() => auditCandidate(value.out, { sourceRoot: value.root, ledgerPath: value.ledger }),
			/hash\/size mismatch/
		)
	}
	{
		const value = fixture(t)
		buildCandidate({
			root: value.root,
			outDir: value.out,
			ledgerOutPath: value.ledger,
			mode: 'draft',
		})
		mkdirSync(join(value.out, '.git'))
		assert.throws(
			() => auditCandidate(value.out, { sourceRoot: value.root, ledgerPath: value.ledger }),
			/contains Git history/
		)
	}
	{
		const value = fixture(t)
		buildCandidate({
			root: value.root,
			outDir: value.out,
			ledgerOutPath: value.ledger,
			mode: 'draft',
		})
		write(value.out, 'apps/api/leak.ts', 'export {}\n')
		assert.throws(
			() => auditCandidate(value.out, { sourceRoot: value.root, ledgerPath: value.ledger }),
			/inventory differs from manifest/
		)
	}
})

test('external clearance is inventory-bound, evidence-backed, and calendar-valid', (t) => {
	const value = fixture(t)
	const plan = buildCandidate({ root: value.root, mode: 'draft', dryRun: true })
	const clearancePath = writeApprovedClearance(value, plan)
	const clearance = JSON.parse(readFileSync(clearancePath))
	clearance.gates.assets.approved_at = '2026-99-99'
	writeFileSync(clearancePath, `${JSON.stringify(clearance, null, 2)}\n`)
	assert.throws(
		() => buildCandidate({ root: value.root, mode: 'release', clearancePath, dryRun: true }),
		/requires approved_at as YYYY-MM-DD/
	)
})

test('external clearance rejects evidence reached through a symlinked ancestor', (t) => {
	const value = fixture(t)
	const plan = buildCandidate({ root: value.root, mode: 'draft', dryRun: true })
	const clearancePath = writeApprovedClearance(value, plan)
	const evidencePath = join(dirname(clearancePath), 'evidence')
	const outsideEvidence = join(value.base, 'outside-evidence')
	cpSync(evidencePath, outsideEvidence, { recursive: true })
	rmSync(evidencePath, { recursive: true, force: true })
	symlinkSync(outsideEvidence, evidencePath, 'dir')
	assert.throws(
		() => buildCandidate({ root: value.root, mode: 'release', clearancePath, dryRun: true }),
		/symlink is not allowed/
	)
})

test('output containment resolves outside symlinks before writing', (t) => {
	const value = fixture(t)
	const link = join(value.base, 'source-link')
	symlinkSync(value.root, link, 'dir')
	assert.throws(
		() =>
			buildCandidate({
				root: value.root,
				outDir: join(link, 'injected'),
				ledgerOutPath: value.ledger,
				mode: 'draft',
			}),
		/outside the private source worktree/
	)
	assert.equal(existsSync(join(value.root, 'injected')), false)
})

test('post-publication receipt derives Q from one public commit and archives that exact tree', (t) => {
	const value = fixture(t)
	const inputs = prepareReleaseInputs(value)
	buildCandidate({
		root: value.root,
		outDir: value.out,
		ledgerOutPath: value.ledger,
		mode: 'release',
		clearancePath: inputs.clearancePath,
		buildAttestationPath: inputs.attestationPath,
	})
	const publicRoot = join(value.base, 'public-checkout')
	cpSync(value.out, publicRoot, { recursive: true })
	execFileSync('git', ['init', '--initial-branch=main'], { cwd: publicRoot, stdio: 'ignore' })
	git(publicRoot, ['config', 'user.email', PUBLIC_RELEASE_COMMIT.email])
	git(publicRoot, ['config', 'user.name', PUBLIC_RELEASE_COMMIT.name])
	git(publicRoot, ['add', '.'])
	git(publicRoot, ['-c', 'commit.gpgsign=false', 'commit', '-m', PUBLIC_RELEASE_COMMIT.message])
	const publicCommit = git(publicRoot, ['rev-parse', 'HEAD'])
	const receiptOptions = {
		candidateDir: value.out,
		sourceRoot: value.root,
		ledgerPath: value.ledger,
		clearancePath: inputs.clearancePath,
		buildAttestationPath: inputs.attestationPath,
		publicCheckout: publicRoot,
		buildCommit: publicCommit,
		archiveOutPath: join(value.base, 'peanut-split-source.tar.gz'),
		archiveUrl: `https://releases.example.invalid/peanut-split/${publicCommit}.tar.gz`,
		outPath: join(value.base, 'release-receipt.json'),
	}
	assert.throws(
		() => createReleaseReceipt({ ...receiptOptions, buildCommit: 'c'.repeat(40) }),
		/does not equal the audited public source commit/
	)
	git(publicRoot, ['update-ref', 'refs/tags/review', publicCommit])
	assert.throws(() => createReleaseReceipt(receiptOptions), /must expose only refs\/heads\/main/)
	git(publicRoot, ['tag', '-d', 'review'])
	write(publicRoot, '.git/info/attributes', 'apps/web/src/index.ts export-ignore\n')
	git(publicRoot, ['config', 'tar.tar.gz.command', 'false'])
	const receipt = createReleaseReceipt(receiptOptions)
	assert.notEqual(publicCommit, value.commit)
	assert.equal(receipt.receipt.public_release_commit, publicCommit)
	assert.equal(receipt.receipt.build_environment.NEXT_PUBLIC_BUILD_COMMIT, publicCommit)
	assert.equal(receipt.receipt.build_environment.NEXT_PUBLIC_SOURCE_COMMIT, publicCommit)
	assert.equal(receipt.receipt.build_environment.NEXT_PUBLIC_FOSS_RELEASED, '1')
	assert.equal(existsSync(receipt.archive), true)
	const publicReceipt = readFileSync(receipt.output, 'utf8')
	for (const privateField of [
		value.commit,
		'private_origin_commit',
		'approved_by',
		'release-owner',
		'2026-08-24',
		'evidence',
		'source_path',
		'excluded_paths',
		'apps/api',
	]) {
		assert.equal(publicReceipt.includes(privateField), false, privateField)
	}
})

test('receipt compares audited candidate bytes directly to the public commit object', (t) => {
	const value = fixture(t)
	const inputs = prepareReleaseInputs(value)
	buildCandidate({
		root: value.root,
		outDir: value.out,
		ledgerOutPath: value.ledger,
		mode: 'release',
		clearancePath: inputs.clearancePath,
		buildAttestationPath: inputs.attestationPath,
	})
	const publicRoot = join(value.base, 'public-commit-mismatch')
	cpSync(value.out, publicRoot, { recursive: true })
	write(publicRoot, 'apps/web/src/index.ts', "export const product = 'different committed payload'\n")
	execFileSync('git', ['init', '--initial-branch=main'], { cwd: publicRoot, stdio: 'ignore' })
	git(publicRoot, ['config', 'user.email', PUBLIC_RELEASE_COMMIT.email])
	git(publicRoot, ['config', 'user.name', PUBLIC_RELEASE_COMMIT.name])
	git(publicRoot, ['add', '.'])
	git(publicRoot, ['-c', 'commit.gpgsign=false', 'commit', '-m', PUBLIC_RELEASE_COMMIT.message])
	git(publicRoot, ['update-index', '--assume-unchanged', 'apps/web/src/index.ts'])
	cpSync(join(value.out, 'apps/web/src/index.ts'), join(publicRoot, 'apps/web/src/index.ts'))
	assert.equal(git(publicRoot, ['status', '--porcelain=v1']), '')
	const publicCommit = git(publicRoot, ['rev-parse', 'HEAD'])
	assert.throws(
		() =>
			createReleaseReceipt({
				candidateDir: value.out,
				sourceRoot: value.root,
				ledgerPath: value.ledger,
				clearancePath: inputs.clearancePath,
				buildAttestationPath: inputs.attestationPath,
				publicCheckout: publicRoot,
				buildCommit: publicCommit,
				archiveOutPath: join(value.base, 'mismatch-source.tar.gz'),
				archiveUrl: `https://releases.example.invalid/peanut-split/${publicCommit}.tar.gz`,
				outPath: join(value.base, 'mismatch-receipt.json'),
			}),
		/commit blob differs from the audited candidate/
	)
})

test('receipt rejects remotes, private reflogs, and dangling public-checkout objects', (t) => {
	const value = fixture(t)
	const inputs = prepareReleaseInputs(value)
	buildCandidate({
		root: value.root,
		outDir: value.out,
		ledgerOutPath: value.ledger,
		mode: 'release',
		clearancePath: inputs.clearancePath,
		buildAttestationPath: inputs.attestationPath,
	})
	const preparePublicRoot = (name) => {
		const publicRoot = join(value.base, name)
		cpSync(value.out, publicRoot, { recursive: true })
		execFileSync('git', ['init', '--initial-branch=main'], { cwd: publicRoot, stdio: 'ignore' })
		git(publicRoot, ['config', 'user.email', PUBLIC_RELEASE_COMMIT.email])
		git(publicRoot, ['config', 'user.name', PUBLIC_RELEASE_COMMIT.name])
		git(publicRoot, ['add', '.'])
		git(publicRoot, ['-c', 'commit.gpgsign=false', 'commit', '-m', PUBLIC_RELEASE_COMMIT.message])
		return { publicRoot, publicCommit: git(publicRoot, ['rev-parse', 'HEAD']) }
	}
	const options = ({ publicRoot, publicCommit }, suffix) => ({
		candidateDir: value.out,
		sourceRoot: value.root,
		ledgerPath: value.ledger,
		clearancePath: inputs.clearancePath,
		buildAttestationPath: inputs.attestationPath,
		publicCheckout: publicRoot,
		buildCommit: publicCommit,
		archiveOutPath: join(value.base, `${suffix}.tar.gz`),
		archiveUrl: `https://releases.example.invalid/peanut-split/${publicCommit}.tar.gz`,
		outPath: join(value.base, `${suffix}.json`),
	})
	{
		const publicValue = preparePublicRoot('public-with-remote')
		git(publicValue.publicRoot, ['remote', 'add', 'origin', 'https://example.invalid/repository.git'])
		assert.throws(
			() => createReleaseReceipt(options(publicValue, 'remote-receipt')),
			/fresh repository without configured remotes/
		)
	}
	{
		const publicValue = preparePublicRoot('public-with-private-object')
		write(publicValue.publicRoot, 'PRIVATE-PAST.txt', 'must never reach a public source repository\n')
		git(publicValue.publicRoot, ['add', 'PRIVATE-PAST.txt'])
		git(publicValue.publicRoot, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'private temporary history'])
		git(publicValue.publicRoot, ['reset', '--hard', publicValue.publicCommit])
		assert.throws(
			() => createReleaseReceipt(options(publicValue, 'private-object-receipt')),
			/reflogs must contain only the history-free release commit/
		)
		git(publicValue.publicRoot, ['reflog', 'expire', '--expire=now', '--all'])
		assert.throws(
			() => createReleaseReceipt(options(publicValue, 'dangling-object-receipt')),
			/object database contains unreachable, dangling, or invalid objects/
		)
	}
})

test('CLI has no publish command or implicit output target', (t) => {
	const value = fixture(t)
	const noOutput = spawnSync(process.execPath, [CLI, '--root', value.root, '--draft'], { encoding: 'utf8' })
	assert.equal(noOutput.status, 1)
	assert.match(noOutput.stderr, /explicit --out directory is required/)
	const publish = spawnSync(process.execPath, [CLI, '--root', value.root, '--publish'], { encoding: 'utf8' })
	assert.equal(publish.status, 1)
	assert.match(publish.stderr, /unknown argument: --publish/)
})
