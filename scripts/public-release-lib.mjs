import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { TextDecoder } from 'node:util'
import { runInNewContext } from 'node:vm'
import { gunzipSync, gzipSync } from 'node:zlib'
import ts from 'typescript'

export const OFFICIAL_LICENSE = Object.freeze({
	path: 'public-release/licenses/AGPL-3.0.txt',
	source_url: 'https://www.gnu.org/licenses/agpl-3.0.txt',
	sha256: '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0',
	spdx: 'AGPL-3.0-or-later',
})

export const REQUIRED_GATES = Object.freeze([
	'squirrel_labs_authority',
	'assets',
	'content',
	'third_party_notices',
	'peanut_reference_budget',
])

export const REQUIRED_BUILD_COMMANDS = Object.freeze({
	install: Object.freeze(['pnpm', '--dir', 'apps/web', 'install', '--frozen-lockfile']),
	typecheck: Object.freeze(['pnpm', '--dir', 'apps/web', 'typecheck']),
	foss_boundary_tests: Object.freeze([
		'pnpm',
		'--dir',
		'apps/web',
		'exec',
		'vitest',
		'run',
		'src/lib/flags.test.ts',
		'src/lib/content.test.ts',
		'src/lib/reference-budget.test.ts',
		'src/lib/marketing-copy-policy.test.ts',
		'src/components/marketing/SiteFooter.test.tsx',
		'src/app/(product-shell)/(marketing)/source/page.test.tsx',
	]),
	build: Object.freeze(['pnpm', '--dir', 'apps/web', 'build']),
})

export const PUBLIC_RELEASE_ENVIRONMENT_KEYS = Object.freeze([
	'NEXT_PUBLIC_FOSS_RELEASED',
	'NEXT_PUBLIC_BUILD_COMMIT',
	'NEXT_PUBLIC_SOURCE_COMMIT',
	'NEXT_PUBLIC_SOURCE_ARCHIVE_URL',
	'NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256',
])

export const PUBLIC_RELEASE_COMMIT = Object.freeze({
	name: 'Squirrel Labs',
	email: 'opensource@peanutsplit.com',
	message: 'release: Peanut Split public source',
})

export const CLEAN_ATTESTATION_ENVIRONMENT_NAMES = Object.freeze([
	'CI',
	'DATABASE_URL',
	'FORCE_COLOR',
	'LANG',
	'NEXT_PUBLIC_BASE_URL',
	'NO_COLOR',
	'PATH',
	'SEO_INDEXABLE',
	'TZ',
])

export const REQUIRED_DOCUMENTS = Object.freeze([
	'CONTRIBUTING.md',
	'MAINTAINERS.md',
	'README.md',
	'SECURITY.md',
	'STEWARDSHIP.md',
	'THIRD_PARTY_NOTICES.md',
	'TRADEMARKS.md',
	'docs/README.md',
])

export const HARD_EXCLUDED_PATHS = Object.freeze([
	'.git',
	'apps/api',
	'apps/web/.env',
	'apps/web/.next',
	'apps/web/README.md',
	'apps/web/coverage',
	'apps/web/docs',
	'apps/web/e2e/adaptive-funnel.spec.ts',
	'apps/web/e2e/persona-picker.spec.ts',
	'apps/web/node_modules',
	'apps/web/public/19252153f4936f5ddf935132a19a8cd7.txt',
	'apps/web/public/dev',
	'apps/web/public/doodles/portraits',
	'apps/web/public/googlec5f25ec6fcbb222c.html',
	'apps/web/public/press',
	'apps/web/scripts/build-locale-review.mjs',
	'apps/web/scripts/draft-translation.mjs',
	'apps/web/scripts/indexnow-submit.mjs',
	'apps/web/src/app/(product-shell)/dev-ds',
	'apps/web/src/app/(split-content)',
	'apps/web/src/components/split-content',
	'apps/web/src/content/_system',
	'apps/web/src/generated',
	'apps/web/src/lib/split-content',
	'ops',
])

const PROFILE_PATH = 'public-release/allowlist.json'
const CLEARANCE_PATH = 'public-release/clearance.json'
const LEDGER_LABEL = 'private release ledger'
const PUBLIC_CI_TEMPLATE_SHA256 = '500d6f34b3ea377afd51cc1e0057850f4bf002879f7d601b16600eb9984a4e4c'
const PUBLIC_CI_ACTIONS = Object.freeze([
	'        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
	'        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
])
const PUBLIC_CI_RUN_COMMANDS = Object.freeze([
	'corepack enable && corepack prepare pnpm@10.17.1 --activate',
	REQUIRED_BUILD_COMMANDS.install.join(' '),
	REQUIRED_BUILD_COMMANDS.typecheck.join(' '),
	REQUIRED_BUILD_COMMANDS.foss_boundary_tests.join(' '),
	REQUIRED_BUILD_COMMANDS.build.join(' '),
])
const MAX_FILE_BYTES = 1024 * 1024
const BINARY_EXTENSIONS = new Set(['.ico', '.png', '.ttf', '.webp', '.woff', '.woff2'])
const MEDIA_EXTENSIONS = new Set([...BINARY_EXTENSIONS, '.svg'])
const FORBIDDEN_EXTENSIONS = new Set([
	'.7z',
	'.db',
	'.der',
	'.gz',
	'.har',
	'.key',
	'.mp3',
	'.mp4',
	'.ogg',
	'.p12',
	'.parquet',
	'.pem',
	'.sqlite',
	'.tar',
	'.wav',
	'.xlsx',
	'.zip',
])
const RELEASE_BLOCKING_MARKERS = [
	[
		'README.md',
		/still private|not yet an open-source release|apps\/api|pnpm bootstrap|pnpm docs:(?:generate|check)/i,
	],
	['docs/README.md', /docs\/audits|apps\/web\/docs\/SPEC|docs-split-rooms-spike|ROADMAP\.md/i],
	['apps/web/README.md', /not a public FOSS release yet/i],
	['apps/web/README.md', /apps\/api|docs\/SPEC\.md|pnpm bootstrap/i],
	['CONTRIBUTING.md', /until that publication gate is complete/i],
	['SECURITY.md', /repository is private and has no supported public release yet/i],
	['STEWARDSHIP.md', /has not yet approved or applied that grant/i],
	['THIRD_PARTY_NOTICES.md', /incomplete publication draft/i],
	['TRADEMARKS.md', /publication draft, not a current software license/i],
	['docs/current/LICENSING.md', /current private tree is `?UNLICENSED`?/i],
	['docs/current/PUBLIC-RELEASE.md', /\*\*NO-GO\*\*|clearance is pending|not yet a clean-build attestation/i],
	['docs/current/RIGHTS-REGISTER.md', /\b(?:Blocker|Unresolved|Incomplete|Open maintainer decision)\b/i],
	['docs/current/SELF-HOSTING.md', /not yet a turnkey production distribution/i],
	['docs/current/TESTING.md', /apps\/api|pnpm bootstrap|split-content-publisher|pnpm docs:check/i],
]
const FOSS_RELEASE_BOUNDARY = Object.freeze({
	flag: 'NEXT_PUBLIC_FOSS_RELEASED',
	open_value: '1',
	default: 'closed',
	release_receipt: 'external-after-public-commit',
	required_environment: PUBLIC_RELEASE_ENVIRONMENT_KEYS,
	verified: true,
})
const FOSS_RELEASE_CONTRACTS = [
	['apps/web/src/app/(product-shell)/(marketing)/source/page.tsx', /if \(!publicFossReleased\(\)\) notFound\(\)/u],
	['apps/web/src/components/marketing/SiteFooter.tsx', /publicFossReleased\(\) &&/u],
	['apps/web/src/data/static-pages.ts', /inSitemap: publicFossReleased/u],
	[
		'apps/web/src/lib/content.ts',
		/doc\.frontmatter\.releaseGate !== 'public-source' \|\| doc\.frontmatter\.publicSourceUpgrade \|\| publicFossReleased\(\)/u,
	],
	...['en', 'es-419', 'pt-br'].map((locale) => [
		`apps/web/src/content/alternatives/splitwise-alternative/${locale}.md`,
		/publicSourceTitle:[^\n]+\npublicSourceDescription:[^\n]+[\s\S]{0,800}releaseGate:\s*public-source[\s\S]{0,800}public-source-and-self-hosting[\s\S]*<PublicSourceOnly>[\s\S]*<\/PublicSourceOnly>/u,
	]),
]
const SECRET_RULES = [
	['private-key', /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/u],
	['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
	['github-token', /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}\b/u],
	['openai-key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u],
	['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u],
	['jwt', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u],
]
const GENERIC_SECRET_ASSIGNMENT =
	/\b[a-z0-9_-]*(?:api[_-]?(?:key|token|secret)|auth[_-]?(?:key|token|secret)|access[_-]?(?:key|token|secret)|client[_-]?secret|password|private[_-]?key|credential|signing[_-]?key|webhook[_-]?(?:key|token|secret))[a-z0-9_-]*\b\s*[:=]\s*(?:"([^"]{12,})"|'([^']{12,})'|([a-z0-9_+./=${}:-]{12,}))/giu
const SENSITIVE_ENV_NAME =
	/(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|AUTH|ACCESS_KEY|API_KEY|SIGNING_KEY|WEBHOOK_KEY)/u
const CREDENTIAL_URL =
	/\b([a-z][a-z0-9+.-]*):\/\/([^:\s/@]+):([^@\s/]+)@(\[[0-9a-f:.]+\](?::[0-9]+)?|[a-z0-9.-]+(?::[0-9]+)?)/giu
const SCRIPT_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])

function fail(message) {
	throw new Error(`public-release: ${message}`)
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value) {
	return `${JSON.stringify(value, null, 2)}\n`
}

function sameArray(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index])
}

function validCalendarDate(value) {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
	const parsed = new Date(`${value}T00:00:00.000Z`)
	return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function assertExactKeys(value, keys, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
	if (!sameArray(Object.keys(value), keys)) fail(`${label} keys must be exactly: ${keys.join(', ')}`)
}

function parseCanonicalJson(bytes, label) {
	let value
	try {
		value = JSON.parse(bytes.toString('utf8'))
	} catch (error) {
		fail(`${label} is not valid JSON: ${error.message}`)
	}
	if (bytes.toString('utf8') !== canonicalJson(value)) fail(`${label} must use canonical two-space JSON`)
	return value
}

function readCanonicalJson(root, repoPath, label) {
	const bytes = readFileSync(safeJoin(root, repoPath))
	const value = parseCanonicalJson(bytes, label)
	return { value, bytes }
}

function normalizeRepoPath(value, label, { directory = false } = {}) {
	if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || isAbsolute(value)) {
		fail(`${label} must be a non-empty repository-relative POSIX path`)
	}
	const hasSlash = value.endsWith('/')
	if (directory !== hasSlash) fail(`${label} ${directory ? 'must' : 'must not'} end in /`)
	const untrailed = hasSlash ? value.slice(0, -1) : value
	if (!untrailed || posix.normalize(untrailed) !== untrailed || untrailed === '..' || untrailed.startsWith('../')) {
		fail(`${label} is not a normalized repository-relative path`)
	}
	return untrailed
}

function safeJoin(root, repoPath) {
	const absolute = resolve(root, ...repoPath.split('/'))
	const prefix = `${resolve(root)}${sep}`
	if (absolute !== resolve(root) && !absolute.startsWith(prefix)) fail(`path escapes repository root: ${repoPath}`)
	return absolute
}

function candidatePathFromAbsolute(root, absolute) {
	return relative(root, absolute).split(sep).join('/')
}

function matchesPrefix(repoPath, prefix) {
	return repoPath === prefix || repoPath.startsWith(`${prefix}/`)
}

function excludedPath(repoPath) {
	return HARD_EXCLUDED_PATHS.find((prefix) => matchesPrefix(repoPath, prefix))
}

function assertNoSymlinkPath(root, repoPath) {
	let cursor = root
	for (const part of repoPath.split('/')) {
		cursor = join(cursor, part)
		if (lstatSync(cursor).isSymbolicLink()) fail(`symlink is not allowed: ${repoPath}`)
	}
}

function validateProfile(root) {
	const { value: profile, bytes } = readCanonicalJson(root, PROFILE_PATH, PROFILE_PATH)
	assertExactKeys(
		profile,
		[
			'schema_version',
			'source_scope',
			'application_paths',
			'asset_paths',
			'candidate_templates',
			'repository_documents',
			'excluded_paths',
		],
		PROFILE_PATH
	)
	if (profile.schema_version !== 1) fail(`${PROFILE_PATH} schema_version must be 1`)
	if (profile.source_scope !== 'apps/web') fail(`${PROFILE_PATH} source_scope must be apps/web`)
	for (const [key, values] of [
		['application_paths', profile.application_paths],
		['asset_paths', profile.asset_paths],
		['repository_documents', profile.repository_documents],
		['excluded_paths', profile.excluded_paths],
	]) {
		if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string')) {
			fail(`${PROFILE_PATH} ${key} must be a non-empty string array`)
		}
		if (new Set(values).size !== values.length) fail(`${PROFILE_PATH} ${key} contains duplicates`)
		if (!sameArray(values, [...values].sort())) fail(`${PROFILE_PATH} ${key} must be sorted`)
	}
	if (!Array.isArray(profile.candidate_templates) || profile.candidate_templates.length === 0) {
		fail(`${PROFILE_PATH} candidate_templates must be a non-empty array`)
	}
	const templateDestinations = []
	for (const [index, template] of profile.candidate_templates.entries()) {
		assertExactKeys(template, ['destination', 'source'], `candidate_templates[${index}]`)
		const destination = normalizeRepoPath(template.destination, `candidate_templates[${index}].destination`)
		const source = normalizeRepoPath(template.source, `candidate_templates[${index}].source`)
		if (!source.startsWith('public-release/templates/')) {
			fail(`candidate_templates[${index}].source must be under public-release/templates`)
		}
		if (excludedPath(destination)) fail(`candidate template destination is hard-excluded: ${destination}`)
		templateDestinations.push(destination)
	}
	if (new Set(templateDestinations).size !== templateDestinations.length) {
		fail(`${PROFILE_PATH} candidate_templates contains duplicate destinations`)
	}
	if (!sameArray(templateDestinations, [...templateDestinations].sort())) {
		fail(`${PROFILE_PATH} candidate_templates must be sorted by destination`)
	}
	for (const [index, value] of profile.application_paths.entries()) {
		const directory = value.endsWith('/')
		const normalized = normalizeRepoPath(value, `application_paths[${index}]`, { directory })
		if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('apps/')) {
			fail(`application_paths[${index}] must be relative to apps/web`)
		}
	}
	for (const [index, value] of profile.asset_paths.entries()) {
		const normalized = normalizeRepoPath(value, `asset_paths[${index}]`)
		if (!MEDIA_EXTENSIONS.has(extname(normalized).toLowerCase())) {
			fail(`asset_paths[${index}] must name a reviewed media or font file`)
		}
	}
	for (const [index, value] of profile.repository_documents.entries()) {
		normalizeRepoPath(value, `repository_documents[${index}]`, { directory: value.endsWith('/') })
	}
	for (const [index, value] of profile.excluded_paths.entries()) {
		normalizeRepoPath(value, `excluded_paths[${index}]`)
	}
	if (!sameArray(profile.excluded_paths, HARD_EXCLUDED_PATHS)) {
		fail(`${PROFILE_PATH} excluded_paths must match the hard-coded fail-closed boundary`)
	}
	const templateOutputs = new Set(profile.candidate_templates.map((template) => template.destination))
	for (const required of REQUIRED_DOCUMENTS) {
		if (!profile.repository_documents.includes(required) && !templateOutputs.has(required)) {
			fail(`${PROFILE_PATH} must include or template ${required}`)
		}
	}
	if (!profile.repository_documents.includes('docs/current/')) fail(`${PROFILE_PATH} must include docs/current/`)
	return { profile, bytes }
}

function validateClearance(root, { clearancePath = null, expected = null, requireApproved = false } = {}) {
	const external = clearancePath !== null
	const label = external ? 'external clearance' : CLEARANCE_PATH
	const loaded = external
		? readExternalCanonicalJson(clearancePath, label)
		: readCanonicalJson(root, CLEARANCE_PATH, CLEARANCE_PATH)
	const { value: clearance, bytes } = loaded
	assertExactKeys(
		clearance,
		['schema_version', 'candidate_scope', 'private_origin_commit', 'profile_sha256', 'input_tree_sha256', 'gates'],
		label
	)
	if (clearance.schema_version !== 1) fail(`${label} schema_version must be 1`)
	if (clearance.candidate_scope !== 'apps/web') fail(`${label} candidate_scope must be apps/web`)
	for (const [key, pattern] of [
		['private_origin_commit', /^[0-9a-f]{40}$/u],
		['profile_sha256', /^[0-9a-f]{64}$/u],
		['input_tree_sha256', /^[0-9a-f]{64}$/u],
	]) {
		const value = clearance[key]
		if (value !== null && (typeof value !== 'string' || !pattern.test(value))) {
			fail(`${label} ${key} is invalid`)
		}
		if (expected && value !== expected[key]) fail(`${label} ${key} does not match the candidate inventory`)
	}
	assertExactKeys(clearance.gates, REQUIRED_GATES, `${label}.gates`)
	const evidenceRoot = external ? dirname(loaded.absolute) : root
	for (const name of REQUIRED_GATES) {
		const gate = clearance.gates[name]
		assertExactKeys(gate, ['status', 'approved_by', 'approved_at', 'evidence'], `${label}.gates.${name}`)
		if (!['pending', 'approved'].includes(gate.status)) fail(`${name} status must be pending or approved`)
		if (!Array.isArray(gate.evidence)) fail(`${name} evidence must be an array`)
		for (const [index, evidence] of gate.evidence.entries()) {
			assertExactKeys(evidence, ['path', 'sha256'], `${label}.gates.${name}.evidence[${index}]`)
			const evidencePath = normalizeRepoPath(evidence.path, `${name} evidence path`)
			if (!/^[0-9a-f]{64}$/u.test(evidence.sha256)) fail(`${name} evidence hash is invalid`)
			const absolute = safeJoin(evidenceRoot, evidencePath)
			if (!existsSync(absolute)) {
				fail(`${name} evidence is missing or is not a regular file: ${evidence.path}`)
			}
			assertNoSymlinkPath(evidenceRoot, evidencePath)
			const evidenceRootReal = realpathSync(evidenceRoot)
			const evidenceReal = realpathSync(absolute)
			if (
				(evidenceReal !== evidenceRootReal && !evidenceReal.startsWith(`${evidenceRootReal}${sep}`)) ||
				!statSync(evidenceReal).isFile()
			) {
				fail(`${name} evidence is missing or is not a regular file: ${evidence.path}`)
			}
			const evidenceBytes = readFileSync(evidenceReal)
			scanBytes(`clearance-evidence/${evidence.path}`, evidenceBytes)
			if (sha256(evidenceBytes) !== evidence.sha256)
				fail(`${name} evidence hash does not match: ${evidence.path}`)
		}
		if (gate.status === 'pending') {
			if (gate.approved_by !== null || gate.approved_at !== null || gate.evidence.length !== 0) {
				fail(`${name} pending gate must not carry approval metadata`)
			}
		} else {
			if (typeof gate.approved_by !== 'string' || !gate.approved_by.trim()) fail(`${name} requires approved_by`)
			if (!validCalendarDate(gate.approved_at)) {
				fail(`${name} requires approved_at as YYYY-MM-DD`)
			}
			if (gate.evidence.length === 0) fail(`${name} requires at least one evidence reference`)
		}
		if (requireApproved && gate.status !== 'approved') fail(`release candidate clearance is pending: ${name}`)
	}
	if (!requireApproved && REQUIRED_GATES.every((name) => clearance.gates[name].status === 'pending')) {
		for (const key of ['private_origin_commit', 'profile_sha256', 'input_tree_sha256']) {
			if (clearance[key] !== null) fail(`${label} all-pending template must leave ${key} null`)
		}
	}
	return { clearance, bytes }
}

function privateRepositoryInvariant(root) {
	const packagePath = safeJoin(root, 'package.json')
	const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
	if (pkg.private !== true || pkg.license !== 'UNLICENSED') {
		fail('the source repository package must remain private: true and license: UNLICENSED')
	}
	if (existsSync(safeJoin(root, 'LICENSE'))) fail('the private source repository must not contain a root LICENSE')
}

function sourceGitState(root) {
	let topLevel
	let commit
	let status
	try {
		topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim()
		commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
		status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
			cwd: root,
			encoding: 'utf8',
		})
	} catch (error) {
		fail(`cannot resolve source Git state: ${error.message}`)
	}
	if (realpathSync(topLevel) !== realpathSync(root)) fail('root must be the source Git worktree root')
	if (!/^[0-9a-f]{40,64}$/u.test(commit)) fail('source commit is not a full Git object id')
	return { commit, dirty: status.length > 0, status_sha256: sha256(status) }
}

function publicGitIdentity(root) {
	let topLevel
	let commit
	try {
		topLevel = execFileSync('git', ['--no-replace-objects', 'rev-parse', '--show-toplevel'], {
			cwd: root,
			encoding: 'utf8',
		}).trim()
		commit = execFileSync('git', ['--no-replace-objects', 'rev-parse', 'HEAD'], {
			cwd: root,
			encoding: 'utf8',
		}).trim()
	} catch (error) {
		fail(`cannot resolve public Git identity: ${error.message}`)
	}
	if (realpathSync(topLevel) !== realpathSync(root)) fail('public checkout must be its Git worktree root')
	if (!/^[0-9a-f]{40}$/u.test(commit)) fail('public release commit must be lowercase 40-hex')
	return { commit }
}

function commitFile(root, commit, repoPath) {
	const listing = execFileSync('git', ['--no-replace-objects', 'ls-tree', '-z', commit, '--', repoPath], {
		cwd: root,
		encoding: null,
		maxBuffer: 4 * 1024 * 1024,
	})
	const records = listing.toString('utf8').split('\0').filter(Boolean)
	if (records.length !== 1) fail(`release input is missing from captured commit: ${repoPath}`)
	const match = /^(100[0-7]{3}) (blob) ([0-9a-f]{40,64})\t([\s\S]+)$/u.exec(records[0])
	if (!match || match[4] !== repoPath) fail(`release input is not a regular Git blob: ${repoPath}`)
	const bytes = execFileSync('git', ['--no-replace-objects', 'cat-file', 'blob', match[3]], {
		cwd: root,
		encoding: null,
		maxBuffer: MAX_FILE_BYTES + 1024,
	})
	return { mode: match[1], object: match[3], bytes }
}

function validateTrackedReleaseInputs(root, files, commit) {
	if (!/^[0-9a-f]{40,64}$/u.test(commit)) fail('captured source commit is invalid')
	if (sourceGitState(root).commit !== commit) fail('source HEAD changed after the release inventory was captured')
	const sourcePaths = [
		...new Set([
			...[...files.values()].map((file) => file.source_path),
			'package.json',
			PROFILE_PATH,
			CLEARANCE_PATH,
			OFFICIAL_LICENSE.path,
		]),
	].sort()
	const expected = new Map()
	for (const file of files.values()) {
		const prior = expected.get(file.source_path)
		if (prior && (!prior.bytes.equals(file.bytes) || prior.mode !== file.mode)) {
			fail(`release candidate source is mapped inconsistently: ${file.source_path}`)
		}
		expected.set(file.source_path, { bytes: file.bytes, mode: file.mode })
	}
	for (const repoPath of ['package.json', PROFILE_PATH, CLEARANCE_PATH, OFFICIAL_LICENSE.path]) {
		assertNoSymlinkPath(root, repoPath)
		const absolute = safeJoin(root, repoPath)
		const stats = lstatSync(absolute)
		if (!stats.isFile()) fail(`release input is not a regular file: ${repoPath}`)
		expected.set(repoPath, {
			bytes: readFileSync(absolute),
			mode: stats.mode & 0o111 ? 0o755 : 0o644,
		})
	}
	const indexEntries = execFileSync('git', ['ls-files', '-v', '-z', '--', ...sourcePaths], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\0')
		.filter(Boolean)
	const indexed = new Map(indexEntries.map((entry) => [entry.slice(2), entry[0]]))
	for (const repoPath of sourcePaths) {
		if (indexed.get(repoPath) !== 'H') {
			fail(`release candidate input is untracked or carries an unsafe index flag: ${repoPath}`)
		}
		const committed = commitFile(root, commit, repoPath)
		const source = expected.get(repoPath)
		const expectedMode = `100${source.mode.toString(8).padStart(3, '0')}`
		if (!committed.bytes.equals(source.bytes) || committed.mode !== expectedMode) {
			fail(`release candidate input differs in bytes or mode from captured commit: ${repoPath}`)
		}
	}
	const committedRootLicense = execFileSync(
		'git',
		['--no-replace-objects', 'ls-tree', '-z', commit, '--', 'LICENSE'],
		{ cwd: root, encoding: null }
	)
	if (committedRootLicense.length > 0) {
		fail('captured private source commit must not contain a root LICENSE')
	}
	if (sourceGitState(root).commit !== commit) fail('source HEAD changed while release inputs were verified')
}

function verifyOfficialLicense(root) {
	const bytes = readFileSync(safeJoin(root, OFFICIAL_LICENSE.path))
	const actual = sha256(bytes)
	if (actual !== OFFICIAL_LICENSE.sha256) {
		fail(`vendored GNU AGPLv3 checksum mismatch: expected ${OFFICIAL_LICENSE.sha256}, got ${actual}`)
	}
	return bytes
}

function forbiddenSecretFilename(repoPath) {
	const name = basename(repoPath).toLowerCase()
	if (name === '.env' || (name.startsWith('.env.') && !name.endsWith('.example') && !name.endsWith('.sample'))) {
		return true
	}
	return FORBIDDEN_EXTENSIONS.has(extname(name))
}

function placeholderSecret(value) {
	const lower = value.toLowerCase()
	return (
		/^(?:(?:replace|change)[-_]?me|redacted|placeholder|member-proof|(?:api[-_])?secret[-_]?value|do[-_]?not[-_]?render)$/u.test(
			lower
		) ||
		/^test[-_](?:private|gemini[-_]key|openrouter[-_]key)$/u.test(lower) ||
		/^\$\{[A-Z][A-Z0-9_]*(?::-[^}]*)?\}$/u.test(value) ||
		/^<[^>]+>$/u.test(value) ||
		/^(?:process\.|import\.meta\.|env\.)/u.test(lower) ||
		/^[a-z_$][a-z0-9_$]*(?:\.[a-z_$][a-z0-9_$]*)+$/iu.test(value) ||
		/^__(?:host|secure)-[a-z0-9._-]+$/u.test(lower)
	)
}

function safeCredentialUrl(repoPath, scheme, user, password, host) {
	const hostname = host.toLowerCase().replace(/:\d+$/u, '')
	const localDatabase =
		['postgres', 'postgresql', 'mysql', 'mongodb', 'mongodb+srv', 'redis'].includes(scheme.toLowerCase()) &&
		['localhost', '127.0.0.1', 'db'].includes(hostname) &&
		['split', 'build', 'postgres'].includes(user.toLowerCase()) &&
		['split', 'build', 'postgres'].includes(password.toLowerCase())
	const reservedExample =
		(hostname === 'example.invalid' ||
			hostname.endsWith('.example.invalid') ||
			hostname.endsWith('.example') ||
			/^(?:[a-z0-9-]+\.)*example\.(?:com|net|org)$/u.test(hostname)) &&
		['user', 'username'].includes(user.toLowerCase()) &&
		['password', 'secret'].includes(password.toLowerCase())
	const explicitTestFixture =
		/\.test\.[cm]?[jt]sx?$/u.test(repoPath) &&
		user.toLowerCase() === 'user' &&
		password.toLowerCase() === 'password'
	return localDatabase || reservedExample || explicitTestFixture
}

function credentialSemanticName(value) {
	if (typeof value !== 'string' || !value) return false
	const normalized = value
		.replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
		.replace(/[^A-Za-z0-9]+/gu, '_')
		.toUpperCase()
	const parts = normalized.split('_').filter(Boolean)
	const has = (part) => parts.includes(part)
	return (
		(value === value.toUpperCase() && (value === 'TOKEN' || value === 'SECRET')) ||
		has('PASSWORD') ||
		has('PASSWD') ||
		has('CREDENTIAL') ||
		(has('PRIVATE') && has('KEY')) ||
		(has('SIGNING') && has('KEY')) ||
		((has('API') || has('AUTH') || has('ACCESS') || has('WEBHOOK')) &&
			(has('KEY') || has('TOKEN') || has('SECRET'))) ||
		(parts.length > 1 && parts.at(-1) === 'SECRET')
	)
}

function propertyName(node) {
	if (!node) return null
	if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text
	if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text
	if (ts.isPropertyAccessExpression(node)) return node.name.text
	if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
		return node.argumentExpression.text
	}
	return null
}

function literalString(node) {
	if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
	return null
}

function scanScriptCredentialAssignments(repoPath, text) {
	const source = ts.createSourceFile(
		repoPath,
		text,
		ts.ScriptTarget.Latest,
		true,
		repoPath.endsWith('.tsx') || repoPath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	)
	const inspect = (nameNode, valueNode) => {
		const name = propertyName(nameNode)
		const value = valueNode ? literalString(valueNode) : null
		if (name && credentialSemanticName(name) && value?.length >= 12 && !placeholderSecret(value)) {
			fail(`${repoPath} contains a literal credential assignment for ${name}; matched value redacted`)
		}
	}
	const visit = (node) => {
		if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) {
			inspect(node.name, node.initializer)
		} else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
			inspect(node.left, node.right)
		} else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
			inspect(node.name, node.initializer)
		}
		ts.forEachChild(node, visit)
	}
	visit(source)
}

function scanBytes(repoPath, bytes) {
	if (bytes.length > MAX_FILE_BYTES) fail(`${repoPath} exceeds the ${MAX_FILE_BYTES}-byte candidate limit`)
	if (forbiddenSecretFilename(repoPath)) fail(`${repoPath} has a secret/archive/database filename or extension`)
	const extension = extname(repoPath).toLowerCase()
	if (BINARY_EXTENSIONS.has(extension)) return
	let text
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
	} catch {
		fail(`${repoPath} is non-text but is not an approved candidate asset type`)
	}
	if (text.includes('\0')) fail(`${repoPath} contains binary NUL bytes`)
	if (basename(repoPath).toLowerCase().startsWith('.env')) {
		for (const line of text.split(/\r?\n/u)) {
			if (!line || /^\s*#/u.test(line)) continue
			const assignment = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line)
			if (!assignment || !SENSITIVE_ENV_NAME.test(assignment[1])) continue
			const value = assignment[2].trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, '$1$2')
			if (value && !placeholderSecret(value)) {
				fail(`${repoPath} contains a non-placeholder value in sensitive environment key ${assignment[1]}`)
			}
		}
	}
	for (const [id, pattern] of SECRET_RULES) {
		if (pattern.test(text)) fail(`${repoPath} contains secret-shaped material (${id}); matched value redacted`)
	}
	if (SCRIPT_EXTENSIONS.has(extension)) {
		scanScriptCredentialAssignments(repoPath, text)
	} else {
		for (const match of text.matchAll(GENERIC_SECRET_ASSIGNMENT)) {
			const value = match[1] ?? match[2] ?? match[3]
			if (!placeholderSecret(value)) {
				fail(`${repoPath} contains a literal credential assignment; matched value redacted`)
			}
		}
	}
	for (const match of text.matchAll(CREDENTIAL_URL)) {
		if (!safeCredentialUrl(repoPath, match[1], match[2], match[3], match[4])) {
			fail(`${repoPath} contains a credential-bearing service URL; matched value redacted`)
		}
	}
}

function addSourceFile(root, repoPath, files, excluded, explicitAssets) {
	const blockedBy = excludedPath(repoPath)
	if (blockedBy) {
		excluded.add(blockedBy)
		return
	}
	if (/(?:^|\/)split-content-publisher(?:\.|\/)/u.test(repoPath)) {
		fail(`private publisher machinery reached the candidate plan: ${repoPath}`)
	}
	assertNoSymlinkPath(root, repoPath)
	const absolute = safeJoin(root, repoPath)
	const stats = lstatSync(absolute)
	if (stats.isDirectory()) {
		for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name)
		)) {
			addSourceFile(root, `${repoPath}/${entry.name}`, files, excluded, explicitAssets)
		}
		return
	}
	if (!stats.isFile()) fail(`candidate source is not a regular file: ${repoPath}`)
	if (MEDIA_EXTENSIONS.has(extname(repoPath).toLowerCase()) && !explicitAssets.has(repoPath)) {
		fail(`media/font asset must be exact-allowlisted in asset_paths: ${repoPath}`)
	}
	if (files.has(repoPath)) fail(`candidate allowlist resolves ${repoPath} more than once`)
	const bytes = readFileSync(absolute)
	scanBytes(repoPath, bytes)
	files.set(repoPath, { source_path: repoPath, bytes, mode: stats.mode & 0o111 ? 0o755 : 0o644 })
}

function resolveAllowlist(root, profile) {
	const files = new Map()
	const excluded = new Set()
	const explicitAssets = new Set(profile.asset_paths.map((path) => `apps/web/${path}`))
	for (const path of profile.application_paths) {
		const sourcePath = `apps/web/${path.endsWith('/') ? path.slice(0, -1) : path}`
		if (!existsSync(safeJoin(root, sourcePath))) fail(`allowlisted application path is missing: ${sourcePath}`)
		addSourceFile(root, sourcePath, files, excluded, explicitAssets)
	}
	for (const path of profile.repository_documents) {
		const sourcePath = path.endsWith('/') ? path.slice(0, -1) : path
		if (!existsSync(safeJoin(root, sourcePath))) fail(`allowlisted repository document is missing: ${sourcePath}`)
		addSourceFile(root, sourcePath, files, excluded, explicitAssets)
	}
	for (const template of profile.candidate_templates) {
		if (!existsSync(safeJoin(root, template.source))) {
			fail(`candidate template source is missing: ${template.source}`)
		}
		assertNoSymlinkPath(root, template.source)
		const absolute = safeJoin(root, template.source)
		const stats = lstatSync(absolute)
		if (!stats.isFile()) fail(`candidate template source is not a regular file: ${template.source}`)
		if (files.has(template.destination)) fail(`candidate template destination collides: ${template.destination}`)
		const bytes = readFileSync(absolute)
		scanBytes(template.destination, bytes)
		files.set(template.destination, {
			source_path: template.source,
			bytes,
			mode: stats.mode & 0o111 ? 0o755 : 0o644,
		})
	}
	for (const asset of explicitAssets) {
		if (!files.has(asset)) fail(`exact-allowlisted asset was not resolved from application_paths: ${asset}`)
	}
	for (const required of REQUIRED_DOCUMENTS) {
		if (!files.has(required)) fail(`candidate plan is missing required governance document ${required}`)
	}
	if (![...files].some(([path]) => path.startsWith('docs/current/'))) {
		fail('candidate plan is missing docs/current')
	}
	if ([...files].some(([path]) => path.startsWith('apps/api/'))) fail('apps/api entered the apps/web-only candidate')
	return { files, excluded: [...excluded].sort() }
}

function packageBytes(source, mode) {
	const pkg = JSON.parse(source.toString('utf8'))
	if (pkg.private !== true)
		fail('apps/web/package.json must remain private to prevent accidental package publication')
	pkg.license = mode === 'release' ? OFFICIAL_LICENSE.spdx : 'UNLICENSED'
	return Buffer.from(`${JSON.stringify(pkg, null, 4)}\n`)
}

function releaseStateBlockers(files) {
	const blockers = new Set()
	for (const [path, pattern] of RELEASE_BLOCKING_MARKERS) {
		const file = files.get(path)
		if (file && pattern.test(file.bytes.toString('utf8'))) blockers.add(path)
	}
	return [...blockers].sort()
}

function validatePublicFossGate(file) {
	const source = file.bytes.toString('utf8')
	const output = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		fileName: 'flags.ts',
		reportDiagnostics: true,
	})
	if (output.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
		fail('apps/web/src/lib/flags.ts cannot be transpiled for behavioral release-gate verification')
	}
	const module = { exports: {} }
	const environment = {}
	try {
		runInNewContext(
			output.outputText,
			{ module, exports: module.exports, process: { env: environment }, URL },
			{ timeout: 1000 }
		)
	} catch {
		fail('apps/web/src/lib/flags.ts cannot be evaluated for behavioral release-gate verification')
	}
	const { publicFossReleased, publicSourceReceipt } = module.exports
	if (typeof publicFossReleased !== 'function' || typeof publicSourceReceipt !== 'function') {
		fail('apps/web/src/lib/flags.ts must export the public FOSS gate and source receipt')
	}
	const valid = {
		NEXT_PUBLIC_FOSS_RELEASED: '1',
		NEXT_PUBLIC_BUILD_COMMIT: 'a'.repeat(40),
		NEXT_PUBLIC_SOURCE_COMMIT: 'a'.repeat(40),
		NEXT_PUBLIC_SOURCE_ARCHIVE_URL: `https://code.example.invalid/archive/${'a'.repeat(40)}.tar.gz`,
		NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256: 'b'.repeat(64),
	}
	const evaluate = (overrides = {}) => {
		for (const key of PUBLIC_RELEASE_ENVIRONMENT_KEYS) delete environment[key]
		Object.assign(environment, valid, overrides)
		return { released: publicFossReleased(), receipt: publicSourceReceipt() }
	}
	if (
		evaluate({ NEXT_PUBLIC_FOSS_RELEASED: '' }).released ||
		evaluate({ NEXT_PUBLIC_FOSS_RELEASED: 'true' }).released
	) {
		fail('publicFossReleased must default closed and open only for the literal value 1')
	}
	const open = evaluate()
	if (
		open.released !== true ||
		JSON.stringify(open.receipt) !==
			JSON.stringify({
				commit: valid.NEXT_PUBLIC_SOURCE_COMMIT,
				archiveUrl: valid.NEXT_PUBLIC_SOURCE_ARCHIVE_URL,
				archiveSha256: valid.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256,
			})
	) {
		fail('publicFossReleased must open for a complete, valid corresponding-source receipt')
	}
	for (const overrides of [
		{ NEXT_PUBLIC_BUILD_COMMIT: 'c'.repeat(40) },
		{ NEXT_PUBLIC_SOURCE_COMMIT: 'A'.repeat(40) },
		{ NEXT_PUBLIC_SOURCE_COMMIT: '' },
		{ NEXT_PUBLIC_SOURCE_ARCHIVE_URL: 'http://code.example.invalid/source.tar.gz' },
		{ NEXT_PUBLIC_SOURCE_ARCHIVE_URL: 'https://user:password@code.example.invalid/source.tar.gz' },
		{ NEXT_PUBLIC_SOURCE_ARCHIVE_URL: 'https://code.example.invalid/source.tar.gz#mutable' },
		{ NEXT_PUBLIC_SOURCE_ARCHIVE_URL: 'https://code.example.invalid/latest.tar.gz' },
		{ NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256: 'not-a-sha256' },
	]) {
		const result = evaluate(overrides)
		if (result.released || result.receipt !== null) {
			fail('public FOSS gate accepted an invalid or mismatched corresponding-source receipt')
		}
	}
}

function unwrapParentheses(node) {
	let current = node
	while (ts.isParenthesizedExpression(current)) current = current.expression
	return current
}

function validatePublicSourceOnly(file) {
	const source = file.bytes.toString('utf8')
	const parsed = ts.createSourceFile('blocks.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
	const importsGate = parsed.statements.some(
		(statement) =>
			ts.isImportDeclaration(statement) &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text === '@/lib/flags' &&
			statement.importClause?.namedBindings &&
			ts.isNamedImports(statement.importClause.namedBindings) &&
			statement.importClause.namedBindings.elements.some(
				(element) => !element.propertyName && element.name.text === 'publicFossReleased'
			)
	)
	const declarations = parsed.statements.filter(
		(statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'PublicSourceOnly'
	)
	if (!importsGate || declarations.length !== 1) {
		fail('PublicSourceOnly must import the public FOSS gate and have one top-level implementation')
	}
	const declaration = declarations[0]
	const parameter = declaration.parameters[0]
	const binding = parameter && ts.isObjectBindingPattern(parameter.name) ? parameter.name.elements : []
	const statements = declaration.body?.statements ?? []
	const returned = statements.length === 1 && ts.isReturnStatement(statements[0]) ? statements[0].expression : null
	const conditional = returned ? unwrapParentheses(returned) : null
	const condition =
		conditional && ts.isConditionalExpression(conditional) ? unwrapParentheses(conditional.condition) : null
	const whenTrue =
		conditional && ts.isConditionalExpression(conditional) ? unwrapParentheses(conditional.whenTrue) : null
	const whenFalse =
		conditional && ts.isConditionalExpression(conditional) ? unwrapParentheses(conditional.whenFalse) : null
	if (
		declaration.parameters.length !== 1 ||
		binding.length !== 1 ||
		!ts.isIdentifier(binding[0].name) ||
		binding[0].name.text !== 'children' ||
		!condition ||
		!ts.isCallExpression(condition) ||
		condition.arguments.length !== 0 ||
		!ts.isIdentifier(condition.expression) ||
		condition.expression.text !== 'publicFossReleased' ||
		!whenTrue ||
		!ts.isIdentifier(whenTrue) ||
		whenTrue.text !== 'children' ||
		!whenFalse ||
		whenFalse.kind !== ts.SyntaxKind.NullKeyword
	) {
		fail('PublicSourceOnly must be a single fail-closed conditional return')
	}
	const isolated = `${declaration.getText(parsed)}\nmodule.exports = { PublicSourceOnly }\n`
	const output = ts.transpileModule(isolated, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		fileName: 'PublicSourceOnly.tsx',
		reportDiagnostics: true,
	})
	if (output.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
		fail('PublicSourceOnly cannot be transpiled for behavioral gate verification')
	}
	const module = { exports: {} }
	let released = false
	try {
		runInNewContext(
			output.outputText,
			{ module, exports: module.exports, publicFossReleased: () => released },
			{ timeout: 1000 }
		)
		const render = module.exports.PublicSourceOnly
		const children = Object.freeze({ marker: 'public-source-child' })
		if (typeof render !== 'function' || render({ children }) !== null) {
			fail('PublicSourceOnly emitted children while the public FOSS receipt was closed')
		}
		released = true
		if (render({ children }) !== children) fail('PublicSourceOnly did not emit children after the FOSS gate opened')
	} catch (error) {
		if (error.message.startsWith('public-release:')) throw error
		fail('PublicSourceOnly cannot be evaluated for behavioral gate verification')
	}
}

function validateFossReleaseBoundary(files) {
	for (const path of [
		'apps/web/src/lib/flags.ts',
		'apps/web/src/components/marketing/mdx/blocks.tsx',
		'apps/web/.env.example',
		'apps/web/Dockerfile',
		'apps/web/docker-compose.yml',
	]) {
		if (!files.has(path)) fail(`FOSS release boundary file is missing from the candidate: ${path}`)
	}
	for (const [path] of FOSS_RELEASE_CONTRACTS) {
		const file = files.get(path)
		if (!file) fail(`FOSS release boundary file is missing from the candidate: ${path}`)
	}
	const envExample = files.get('apps/web/.env.example').bytes.toString('utf8')
	const dockerfile = files.get('apps/web/Dockerfile').bytes.toString('utf8')
	const compose = files.get('apps/web/docker-compose.yml').bytes.toString('utf8')
	const activeEnvLines = envExample.split(/\r?\n/u).filter((line) => !/^\s*#/u.test(line))
	const activeDockerLines = dockerfile.split(/\r?\n/u).filter((line) => !/^\s*#/u.test(line))
	const activeComposeLines = compose
		.split(/\r?\n/u)
		.filter((line) => !/^\s*#/u.test(line))
		.map((line) => line.replace(/\s+#.*$/u, ''))
	for (const key of PUBLIC_RELEASE_ENVIRONMENT_KEYS) {
		const envPattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`, 'u')
		const envAssignments = activeEnvLines.map((line) => envPattern.exec(line)).filter(Boolean)
		if (envAssignments.length !== 1 || envAssignments[0][1] !== '') {
			fail(`apps/web/.env.example must leave ${key} unset`)
		}
		const dockerArgs = activeDockerLines.filter((line) => new RegExp(`^\\s*ARG ${key}(?:=|\\s|$)`, 'u').test(line))
		const dockerEnvs = activeDockerLines.filter((line) =>
			new RegExp(`^\\s*ENV(?:\\s+[^=\\s]+=[^\\s]+)*\\s+${key}(?:=|\\s)`, 'u').test(line)
		)
		if (
			dockerArgs.length !== 1 ||
			dockerArgs[0].trim() !== `ARG ${key}` ||
			dockerEnvs.length !== 1 ||
			dockerEnvs[0].trim() !== `ENV ${key}=$${key}`
		) {
			fail(`apps/web/Dockerfile must pass ${key} through without baking a value`)
		}
		const composeAssignments = activeComposeLines.filter((line) => new RegExp(`^\\s*${key}:`, 'u').test(line))
		if (composeAssignments.length !== 1 || composeAssignments[0].trim() !== `${key}: \${${key}:-}`) {
			fail(`apps/web/docker-compose.yml must default ${key} unset`)
		}
	}
	validatePublicFossGate(files.get('apps/web/src/lib/flags.ts'))
	validatePublicSourceOnly(files.get('apps/web/src/components/marketing/mdx/blocks.tsx'))
	for (const [path, pattern] of FOSS_RELEASE_CONTRACTS) {
		if (!pattern.test(files.get(path).bytes.toString('utf8'))) {
			fail(`FOSS release boundary contract drifted: ${path}`)
		}
	}
}

function validatePublicCandidateScaffolding(files) {
	for (const path of [
		'README.md',
		'docs/README.md',
		'.github/ISSUE_TEMPLATE/bug_report.yml',
		'.github/ISSUE_TEMPLATE/config.yml',
		'.github/workflows/ci.yml',
	]) {
		if (!files.has(path)) fail(`public candidate scaffold is missing: ${path}`)
	}
	const readme = files.get('README.md').bytes.toString('utf8')
	if (!/history-free `apps\/web` distribution/u.test(readme) || /pnpm bootstrap|apps\/api/u.test(readme)) {
		fail('public candidate README must describe only the history-free apps/web distribution')
	}
	const workflow = files.get('.github/workflows/ci.yml').bytes.toString('utf8')
	const workflowLines = workflow.split('\n')
	const permissionLines = workflowLines.filter((line) => /^\s*permissions\s*:/u.test(line))
	if (
		permissionLines.length !== 1 ||
		permissionLines[0] !== 'permissions:' ||
		!workflow.includes('permissions:\n  contents: read\n\njobs:') ||
		/pull_request_target|\b[a-z0-9_-]+\s*:\s*write\b/iu.test(workflow)
	) {
		fail('public candidate CI must use a read-only token and must not use pull_request_target')
	}
	const actionLines = workflowLines.filter((line) => /^\s*uses\s*:/u.test(line))
	if (!sameArray(actionLines, PUBLIC_CI_ACTIONS)) {
		fail('public candidate CI actions must exactly match the pinned action allowlist')
	}
	const runCommands = []
	for (let index = 0; index < workflowLines.length; index += 1) {
		const match = /^(\s*)run\s*:\s*(.*)$/u.exec(workflowLines[index])
		if (!match) continue
		if (match[2] !== '>-') {
			runCommands.push(match[2])
			continue
		}
		const runIndent = match[1].length
		const commandLines = []
		for (index += 1; index < workflowLines.length; index += 1) {
			const line = workflowLines[index]
			if (!line.trim()) continue
			if (line.search(/\S/u) <= runIndent) {
				index -= 1
				break
			}
			commandLines.push(line.trim())
		}
		runCommands.push(commandLines.join(' ').replace(/\\([()])/gu, '$1'))
	}
	const requiredFossCommand = REQUIRED_BUILD_COMMANDS.foss_boundary_tests.join(' ')
	if (runCommands[3] !== requiredFossCommand) {
		fail('public candidate CI FOSS boundary command does not exactly match the attestation gate')
	}
	if (!sameArray(runCommands, PUBLIC_CI_RUN_COMMANDS)) {
		fail('public candidate CI run commands must exactly match the attestation command allowlist')
	}
	if (sha256(Buffer.from(workflow)) !== PUBLIC_CI_TEMPLATE_SHA256) {
		fail('public candidate CI workflow differs from the reviewed canonical template')
	}
}

function candidateFileRecord(path, file) {
	return {
		path,
		source_path: file.source_path,
		source_sha256: file.source_sha256 ?? sha256(file.bytes),
		sha256: sha256(file.output_bytes ?? file.bytes),
		bytes: (file.output_bytes ?? file.bytes).length,
		mode: `100${(file.mode ?? 0o644).toString(8).padStart(3, '0')}`,
		transformed: Boolean(file.output_bytes),
	}
}

function clearanceReceipt(clearance) {
	return Object.fromEntries(
		REQUIRED_GATES.map((name) => [
			name,
			{
				status: clearance.gates[name].status,
				approved_by: clearance.gates[name].approved_by,
				approved_at: clearance.gates[name].approved_at,
				evidence: clearance.gates[name].evidence.map((entry) => ({ ...entry })),
			},
		])
	)
}

function sourceInventoryHash(records) {
	return sha256(
		canonicalJson(
			records
				.filter((record) => record.path !== 'LICENSE')
				.map((record) => ({
					path: record.path,
					source_path: record.source_path,
					source_sha256: record.source_sha256,
					mode: record.mode,
				}))
		)
	)
}

function readExternalCanonicalJson(path, label) {
	if (!path) fail(`${label} path is required`)
	const absolute = resolve(path)
	if (!existsSync(absolute)) fail(`${label} does not exist: ${absolute}`)
	if (lstatSync(absolute).isSymbolicLink() || !statSync(absolute).isFile()) {
		fail(`${label} must be a regular, non-symlinked file`)
	}
	const bytes = readFileSync(absolute)
	scanBytes(label, bytes)
	return { value: parseCanonicalJson(bytes, label), bytes, absolute }
}

function validateBuildAttestationReceipt(receipt, label = 'candidate build attestation receipt') {
	assertExactKeys(receipt, ['sha256', 'verified_by', 'verified_at', 'environment_names', 'commands'], label)
	if (!/^[0-9a-f]{64}$/u.test(receipt.sha256)) fail(`${label} hash is invalid`)
	if (typeof receipt.verified_by !== 'string' || !receipt.verified_by.trim()) {
		fail(`${label} requires a verification principal`)
	}
	if (
		typeof receipt.verified_at !== 'string' ||
		!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u.test(receipt.verified_at) ||
		Number.isNaN(Date.parse(receipt.verified_at))
	) {
		fail(`${label} verified_at is invalid`)
	}
	if (
		!Array.isArray(receipt.environment_names) ||
		!sameArray(receipt.environment_names, CLEAN_ATTESTATION_ENVIRONMENT_NAMES)
	) {
		fail(`${label} environment names do not match the minimal clean-build environment`)
	}
	assertExactKeys(receipt.commands, Object.keys(REQUIRED_BUILD_COMMANDS), `${label} commands`)
	for (const [name, command] of Object.entries(REQUIRED_BUILD_COMMANDS)) {
		const commandReceipt = receipt.commands[name]
		assertExactKeys(commandReceipt, ['command', 'status', 'completed_at', 'log_sha256'], `${label} ${name}`)
		if (!Array.isArray(commandReceipt.command) || !sameArray(commandReceipt.command, command)) {
			fail(`${label} ${name} command is not the required clean-candidate command`)
		}
		if (commandReceipt.status !== 'passed') fail(`${label} ${name} did not pass`)
		if (
			typeof commandReceipt.completed_at !== 'string' ||
			!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u.test(commandReceipt.completed_at) ||
			Number.isNaN(Date.parse(commandReceipt.completed_at))
		) {
			fail(`${label} ${name} completed_at is invalid`)
		}
		if (!/^[0-9a-f]{64}$/u.test(commandReceipt.log_sha256)) {
			fail(`${label} ${name} log hash is invalid`)
		}
	}
}

function validateBuildAttestation(path, expected) {
	const { value: attestation, bytes } = readExternalCanonicalJson(path, 'build attestation')
	assertExactKeys(
		attestation,
		[
			'schema_version',
			'candidate_scope',
			'private_origin_commit',
			'profile_sha256',
			'input_tree_sha256',
			'environment_names',
			'commands',
			'verified_by',
			'verified_at',
		],
		'build attestation'
	)
	if (attestation.schema_version !== 1 || attestation.candidate_scope !== 'apps/web') {
		fail('build attestation identity is invalid')
	}
	for (const [key, value] of Object.entries({
		private_origin_commit: expected.private_origin_commit,
		profile_sha256: expected.profile_sha256,
		input_tree_sha256: expected.input_tree_sha256,
	})) {
		if (attestation[key] !== value) fail(`build attestation ${key} does not match the release candidate`)
	}
	const receipt = {
		sha256: sha256(bytes),
		verified_by: attestation.verified_by,
		verified_at: attestation.verified_at,
		environment_names: attestation.environment_names,
		commands: Object.fromEntries(
			Object.entries(attestation.commands).map(([name, receipt]) => [name, { ...receipt }])
		),
	}
	validateBuildAttestationReceipt(receipt, 'build attestation')
	return receipt
}

function assertExternalReleaseInput(root, path, label) {
	if (!path) fail(`${label} path is required`)
	const actual = realpathSync(resolve(path))
	const source = realpathSync(root)
	if (actual === source || actual.startsWith(`${source}${sep}`)) {
		fail(`${label} must be outside the source worktree to avoid a self-referential approval`)
	}
}

function buildPlan(root, mode, { buildAttestationPath = null, clearancePath = null } = {}) {
	if (!['draft', 'release'].includes(mode)) fail('mode must be draft or release')
	privateRepositoryInvariant(root)
	const git = sourceGitState(root)
	const { profile, bytes: profileBytes } = validateProfile(root)
	const templateClearance = validateClearance(root)
	const licenseBytes = verifyOfficialLicense(root)
	const { files, excluded } = resolveAllowlist(root, profile)
	validateFossReleaseBoundary(files)
	validatePublicCandidateScaffolding(files)
	const profileSha256 = sha256(profileBytes)
	const inputTreeSha256 = sourceInventoryHash(
		[...files.entries()]
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([path, file]) => candidateFileRecord(path, file))
	)
	let { clearance, bytes: clearanceBytes } = templateClearance

	const packageFile = files.get('apps/web/package.json')
	if (!packageFile) fail('candidate plan must include apps/web/package.json')
	packageFile.source_sha256 = sha256(packageFile.bytes)
	packageFile.output_bytes = packageBytes(packageFile.bytes, mode)

	let buildAttestation = null
	if (mode === 'release') {
		if (!clearancePath) {
			const pending = REQUIRED_GATES.filter((name) => clearance.gates[name].status !== 'approved')
			if (pending.length > 0) fail(`release candidate blocked by pending human gates: ${pending.join(', ')}`)
			fail('release candidate requires an external inventory-bound clearance record')
		}
		assertExternalReleaseInput(root, clearancePath, 'external clearance')
		;({ clearance, bytes: clearanceBytes } = validateClearance(root, {
			clearancePath,
			expected: {
				private_origin_commit: git.commit,
				profile_sha256: profileSha256,
				input_tree_sha256: inputTreeSha256,
			},
			requireApproved: true,
		}))
		if (git.dirty) fail('release candidate requires a clean source worktree bound to its exact commit')
		validateTrackedReleaseInputs(root, files, git.commit)
		const blockers = releaseStateBlockers(files)
		if (blockers.length > 0) fail(`release-state documents/surfaces are still drafts: ${blockers.join(', ')}`)
		assertExternalReleaseInput(root, buildAttestationPath, 'build attestation')
		buildAttestation = validateBuildAttestation(buildAttestationPath, {
			private_origin_commit: git.commit,
			profile_sha256: profileSha256,
			input_tree_sha256: inputTreeSha256,
		})
		files.set('LICENSE', {
			source_path: OFFICIAL_LICENSE.path,
			source_sha256: OFFICIAL_LICENSE.sha256,
			bytes: licenseBytes,
			mode: 0o644,
		})
	}

	const records = [...files.entries()]
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([path, file]) => candidateFileRecord(path, file))
	const manifest = {
		schema_version: 1,
		candidate_scope: 'apps/web',
		mode,
		private_origin_commit: git.commit,
		source_dirty: git.dirty,
		source_status_sha256: git.status_sha256,
		profile_sha256: profileSha256,
		input_tree_sha256: inputTreeSha256,
		clearance_sha256: sha256(clearanceBytes),
		clearance: clearanceReceipt(clearance),
		build_attestation: buildAttestation,
		foss_release_boundary: FOSS_RELEASE_BOUNDARY,
		license:
			mode === 'release'
				? {
						spdx: OFFICIAL_LICENSE.spdx,
						included: true,
						source_url: OFFICIAL_LICENSE.source_url,
						sha256: OFFICIAL_LICENSE.sha256,
					}
				: { spdx: 'UNLICENSED', included: false, source_url: null, sha256: null },
		excluded_paths: HARD_EXCLUDED_PATHS,
		excluded_during_expansion: excluded,
		files: records,
	}
	return { files, manifest }
}

function assertOutputTarget(root, outDir) {
	const absolute = resolve(outDir)
	const sourceReal = realpathSync(root)
	const parent = dirname(absolute)
	if (!existsSync(parent) || !statSync(parent).isDirectory()) {
		fail(`candidate output parent must already be a directory: ${parent}`)
	}
	const targetReal = join(realpathSync(parent), basename(absolute))
	if (targetReal === sourceReal || targetReal.startsWith(`${sourceReal}${sep}`)) {
		fail('candidate output must be outside the private source worktree')
	}
	if (existsSync(absolute)) fail(`candidate output already exists: ${absolute}`)
	mkdirSync(absolute)
	const createdReal = realpathSync(absolute)
	if (createdReal !== targetReal || createdReal === sourceReal || createdReal.startsWith(`${sourceReal}${sep}`)) {
		fail('created candidate output resolved inside the private source worktree')
	}
	return createdReal
}

function actualCandidateFiles(root) {
	const files = []
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name)
		)) {
			const absolute = join(directory, entry.name)
			const repoPath = candidatePathFromAbsolute(root, absolute)
			const stats = lstatSync(absolute)
			if (stats.isSymbolicLink()) fail(`candidate contains symlink: ${repoPath}`)
			if (entry.name === '.git') fail(`candidate contains Git history: ${repoPath}`)
			if (stats.isDirectory()) visit(absolute)
			else if (stats.isFile()) files.push(repoPath)
			else fail(`candidate contains non-regular entry: ${repoPath}`)
		}
	}
	visit(root)
	return files.sort()
}

export function auditCandidate(
	candidateDir,
	{ sourceRoot, ledgerPath, clearancePath = null, buildAttestationPath = null } = {}
) {
	const root = resolve(candidateDir)
	if (!sourceRoot) fail('independent candidate audit requires the trusted private source root')
	const trustedSourceRoot = resolve(sourceRoot)
	if (!existsSync(root) || !statSync(root).isDirectory()) fail(`candidate directory does not exist: ${root}`)
	if (!ledgerPath) fail('independent candidate audit requires the external private ledger')
	assertExternalReleaseInput(trustedSourceRoot, ledgerPath, LEDGER_LABEL)
	const ledgerReal = realpathSync(resolve(ledgerPath))
	if (process.platform !== 'win32' && (statSync(ledgerReal).mode & 0o077) !== 0) {
		fail('private release ledger must not be readable or writable by group or other users')
	}
	const candidateReal = realpathSync(root)
	if (ledgerReal === candidateReal || ledgerReal.startsWith(`${candidateReal}${sep}`)) {
		fail('private release ledger must not be stored inside the candidate')
	}
	const { value: manifest, bytes: manifestBytes } = readExternalCanonicalJson(ledgerPath, LEDGER_LABEL)
	scanBytes('private-ledger.json', manifestBytes)
	assertExactKeys(
		manifest,
		[
			'schema_version',
			'candidate_scope',
			'mode',
			'private_origin_commit',
			'source_dirty',
			'source_status_sha256',
			'profile_sha256',
			'input_tree_sha256',
			'clearance_sha256',
			'clearance',
			'build_attestation',
			'foss_release_boundary',
			'license',
			'excluded_paths',
			'excluded_during_expansion',
			'files',
		],
		LEDGER_LABEL
	)
	if (manifest.schema_version !== 1 || manifest.candidate_scope !== 'apps/web')
		fail('candidate manifest identity is invalid')
	if (!['draft', 'release'].includes(manifest.mode)) fail('candidate manifest mode is invalid')
	if (!/^[0-9a-f]{40,64}$/u.test(manifest.private_origin_commit)) fail('candidate private_origin_commit is invalid')
	if (typeof manifest.source_dirty !== 'boolean') fail('candidate source_dirty is invalid')
	for (const [label, value] of [
		['source_status_sha256', manifest.source_status_sha256],
		['profile_sha256', manifest.profile_sha256],
		['input_tree_sha256', manifest.input_tree_sha256],
		['clearance_sha256', manifest.clearance_sha256],
	]) {
		if (!/^[0-9a-f]{64}$/u.test(value)) fail(`candidate ${label} is not a lowercase SHA-256`)
	}
	privateRepositoryInvariant(trustedSourceRoot)
	const trustedGit = sourceGitState(trustedSourceRoot)
	if (
		trustedGit.commit !== manifest.private_origin_commit ||
		trustedGit.dirty !== manifest.source_dirty ||
		trustedGit.status_sha256 !== manifest.source_status_sha256
	) {
		fail('candidate source identity does not match the trusted source worktree')
	}
	const { profile: trustedProfile, bytes: trustedProfileBytes } = validateProfile(trustedSourceRoot)
	if (sha256(trustedProfileBytes) !== manifest.profile_sha256) {
		fail('candidate profile hash does not match the trusted allowlist')
	}
	const trustedPlan = resolveAllowlist(trustedSourceRoot, trustedProfile)
	validateFossReleaseBoundary(trustedPlan.files)
	validatePublicCandidateScaffolding(trustedPlan.files)
	if (manifest.mode === 'release') {
		validateTrackedReleaseInputs(trustedSourceRoot, trustedPlan.files, trustedGit.commit)
	}
	const trustedInputTreeSha256 = sourceInventoryHash(
		[...trustedPlan.files.entries()]
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([path, file]) => candidateFileRecord(path, file))
	)
	if (trustedInputTreeSha256 !== manifest.input_tree_sha256) {
		fail('candidate input-tree hash does not match the trusted source allowlist')
	}
	if (manifest.mode === 'release') {
		assertExternalReleaseInput(trustedSourceRoot, clearancePath, 'external clearance')
	} else if (clearancePath) {
		fail('draft candidate audit must use the tracked pending-clearance template')
	}
	const { clearance: trustedClearance, bytes: trustedClearanceBytes } = validateClearance(trustedSourceRoot, {
		clearancePath: manifest.mode === 'release' ? clearancePath : null,
		expected:
			manifest.mode === 'release'
				? {
						private_origin_commit: manifest.private_origin_commit,
						profile_sha256: manifest.profile_sha256,
						input_tree_sha256: manifest.input_tree_sha256,
					}
				: null,
		requireApproved: manifest.mode === 'release',
	})
	if (sha256(trustedClearanceBytes) !== manifest.clearance_sha256) {
		fail('candidate clearance hash does not match the trusted clearance record')
	}
	assertExactKeys(manifest.clearance, REQUIRED_GATES, 'candidate clearance receipt')
	for (const name of REQUIRED_GATES) {
		const gate = manifest.clearance[name]
		assertExactKeys(
			gate,
			['status', 'approved_by', 'approved_at', 'evidence'],
			`candidate clearance receipt ${name}`
		)
		if (!Array.isArray(gate.evidence)) fail(`candidate clearance evidence is invalid: ${name}`)
		for (const evidence of gate.evidence) {
			assertExactKeys(evidence, ['path', 'sha256'], `candidate clearance evidence ${name}`)
			normalizeRepoPath(evidence.path, `candidate clearance evidence path ${name}`)
			if (!/^[0-9a-f]{64}$/u.test(evidence.sha256)) fail(`candidate clearance evidence hash is invalid: ${name}`)
		}
		if (!['pending', 'approved'].includes(gate.status)) fail(`candidate clearance status is invalid: ${name}`)
		if (gate.status === 'approved') {
			if (typeof gate.approved_by !== 'string' || !gate.approved_by.trim())
				fail(`candidate approval has no reviewer: ${name}`)
			if (!validCalendarDate(gate.approved_at)) {
				fail(`candidate approval has no valid date: ${name}`)
			}
		} else if (gate.approved_by !== null || gate.approved_at !== null) {
			fail(`candidate pending gate carries approval metadata: ${name}`)
		}
	}
	if (JSON.stringify(manifest.clearance) !== JSON.stringify(clearanceReceipt(trustedClearance))) {
		fail('candidate clearance receipt does not match the trusted clearance record')
	}
	assertExactKeys(manifest.license, ['spdx', 'included', 'source_url', 'sha256'], 'candidate license receipt')
	if (manifest.mode === 'draft') {
		if (manifest.build_attestation !== null) fail('draft candidate must not claim a passing build attestation')
		if (buildAttestationPath) fail('draft candidate audit must not receive a build attestation')
	} else {
		validateBuildAttestationReceipt(manifest.build_attestation)
		assertExternalReleaseInput(trustedSourceRoot, buildAttestationPath, 'build attestation')
		const trustedBuildAttestation = validateBuildAttestation(buildAttestationPath, {
			private_origin_commit: manifest.private_origin_commit,
			profile_sha256: manifest.profile_sha256,
			input_tree_sha256: manifest.input_tree_sha256,
		})
		if (JSON.stringify(trustedBuildAttestation) !== JSON.stringify(manifest.build_attestation)) {
			fail('candidate build attestation receipt does not match the external attestation')
		}
	}
	if (JSON.stringify(manifest.foss_release_boundary) !== JSON.stringify(FOSS_RELEASE_BOUNDARY)) {
		fail('candidate FOSS release boundary receipt is invalid')
	}
	if (!sameArray(manifest.excluded_paths, HARD_EXCLUDED_PATHS)) fail('candidate excluded path boundary drifted')
	if (!Array.isArray(manifest.excluded_during_expansion)) fail('candidate excluded expansion receipt is invalid')
	if (!Array.isArray(manifest.files) || manifest.files.length === 0)
		fail('candidate manifest files must be non-empty')
	const paths = manifest.files.map((file) => file.path)
	if (new Set(paths).size !== paths.length || !sameArray(paths, [...paths].sort())) {
		fail('candidate manifest paths must be unique and sorted')
	}
	for (const [index, record] of manifest.files.entries()) {
		assertExactKeys(
			record,
			['path', 'source_path', 'source_sha256', 'sha256', 'bytes', 'mode', 'transformed'],
			`${LEDGER_LABEL}.files[${index}]`
		)
		normalizeRepoPath(record.path, `${LEDGER_LABEL}.files[${index}].path`)
		normalizeRepoPath(record.source_path, `${LEDGER_LABEL}.files[${index}].source_path`)
		if (!/^[0-9a-f]{64}$/u.test(record.source_sha256) || !/^[0-9a-f]{64}$/u.test(record.sha256)) {
			fail(`candidate manifest file hashes must be lowercase SHA-256: ${record.path}`)
		}
		if (!Number.isSafeInteger(record.bytes) || record.bytes < 0)
			fail(`candidate manifest byte size is invalid: ${record.path}`)
		if (!/^100[0-7]{3}$/u.test(record.mode)) fail(`candidate manifest mode is invalid: ${record.path}`)
		if (typeof record.transformed !== 'boolean') fail(`candidate transformed marker is invalid: ${record.path}`)
	}
	const trustedPaths = [...trustedPlan.files.keys(), ...(manifest.mode === 'release' ? ['LICENSE'] : [])].sort()
	if (!sameArray(paths, trustedPaths)) {
		fail('candidate manifest inventory does not equal the trusted allowlist expansion')
	}
	if (!sameArray(manifest.excluded_during_expansion, trustedPlan.excluded)) {
		fail('candidate excluded-expansion receipt does not match the trusted allowlist expansion')
	}
	if (sourceInventoryHash(manifest.files) !== manifest.input_tree_sha256) {
		fail('candidate input-tree receipt does not match its source file records')
	}
	for (const record of manifest.files) {
		const sourcePath =
			record.path === 'LICENSE' ? OFFICIAL_LICENSE.path : trustedPlan.files.get(record.path)?.source_path
		if (record.source_path !== sourcePath) fail(`candidate source path is invalid: ${record.path}`)
		const sourceFile =
			record.path === 'LICENSE'
				? { bytes: verifyOfficialLicense(trustedSourceRoot), mode: 0o644 }
				: trustedPlan.files.get(record.path)
		if (!sourceFile || sha256(sourceFile.bytes) !== record.source_sha256) {
			fail(`candidate source hash is not backed by the trusted source: ${record.path}`)
		}
		const sourceMode = `100${sourceFile.mode.toString(8).padStart(3, '0')}`
		if (sourceMode !== record.mode) fail(`candidate source mode is invalid: ${record.path}`)
		if (record.path === 'apps/web/package.json') {
			if (!record.transformed) fail('candidate package must record its SPDX-only transformation')
		} else if (record.transformed || record.source_sha256 !== record.sha256) {
			fail(`candidate has an unauthorized transformation: ${record.path}`)
		}
	}
	const actual = actualCandidateFiles(root)
	const expected = [...paths].sort()
	if (!sameArray(actual, expected)) {
		const extra = actual.filter((path) => !expected.includes(path))
		const missing = expected.filter((path) => !actual.includes(path))
		fail(`candidate inventory differs from manifest; extra=[${extra.join(', ')}] missing=[${missing.join(', ')}]`)
	}
	for (const record of manifest.files) {
		const blockedBy = excludedPath(record.path)
		if (blockedBy) fail(`candidate contains excluded path ${record.path} (blocked by ${blockedBy})`)
		const absolute = safeJoin(root, record.path)
		const bytes = readFileSync(absolute)
		scanBytes(record.path, bytes)
		if (sha256(bytes) !== record.sha256 || bytes.length !== record.bytes) {
			fail(`candidate hash/size mismatch: ${record.path}`)
		}
		const actualMode = `100${(statSync(absolute).mode & 0o777).toString(8).padStart(3, '0')}`
		if (actualMode !== record.mode) fail(`candidate mode mismatch: ${record.path}`)
	}
	const candidateFiles = new Map(paths.map((path) => [path, { bytes: readFileSync(safeJoin(root, path)) }]))
	validateFossReleaseBoundary(candidateFiles)
	for (const required of REQUIRED_DOCUMENTS) {
		if (!paths.includes(required)) fail(`candidate is missing required governance document ${required}`)
	}
	if (!paths.some((path) => path.startsWith('docs/current/'))) fail('candidate is missing docs/current')
	const packageOutput = readFileSync(safeJoin(root, 'apps/web/package.json'))
	const expectedPackageOutput = packageBytes(trustedPlan.files.get('apps/web/package.json').bytes, manifest.mode)
	if (!packageOutput.equals(expectedPackageOutput)) fail('candidate package transformation is not SPDX-only')
	const pkg = JSON.parse(packageOutput.toString('utf8'))
	if (pkg.private !== true) fail('candidate package must remain private to prevent npm publication')
	if (manifest.mode === 'draft') {
		if (
			manifest.license.spdx !== 'UNLICENSED' ||
			manifest.license.included !== false ||
			manifest.license.source_url !== null ||
			manifest.license.sha256 !== null
		) {
			fail('draft candidate license receipt is invalid')
		}
		if (pkg.license !== 'UNLICENSED' || existsSync(safeJoin(root, 'LICENSE'))) {
			fail('draft candidate must remain UNLICENSED and contain no LICENSE')
		}
	} else {
		if (manifest.source_dirty) fail('release candidate cannot be sourced from a dirty worktree')
		if (
			manifest.license.spdx !== OFFICIAL_LICENSE.spdx ||
			manifest.license.included !== true ||
			manifest.license.source_url !== OFFICIAL_LICENSE.source_url ||
			manifest.license.sha256 !== OFFICIAL_LICENSE.sha256
		) {
			fail('release candidate license receipt is invalid')
		}
		if (pkg.license !== OFFICIAL_LICENSE.spdx) fail('release candidate package SPDX is wrong')
		const license = readFileSync(safeJoin(root, 'LICENSE'))
		if (sha256(license) !== OFFICIAL_LICENSE.sha256)
			fail('release candidate LICENSE is not the pinned GNU AGPLv3 text')
		const blockers = releaseStateBlockers(candidateFiles)
		if (blockers.length > 0) fail(`release candidate still contains release-state blockers: ${blockers.join(', ')}`)
		for (const name of REQUIRED_GATES) {
			if (manifest.clearance?.[name]?.status !== 'approved')
				fail(`release candidate clearance is not approved: ${name}`)
		}
	}
	return {
		mode: manifest.mode,
		private_origin_commit: manifest.private_origin_commit,
		files: manifest.files.length,
		ledger_sha256: sha256(manifestBytes),
	}
}

function defaultAttestationCommandRunner(command, { cwd, environment }) {
	const result = spawnSync(command[0], command.slice(1), {
		cwd,
		env: environment,
		encoding: null,
		maxBuffer: 32 * 1024 * 1024,
	})
	if (result.error) fail(`clean-candidate command could not start: ${command.join(' ')}`)
	return {
		status: result.status,
		output: Buffer.concat([
			result.stdout ?? Buffer.alloc(0),
			Buffer.from('\n--- stderr ---\n'),
			result.stderr ?? Buffer.alloc(0),
		]),
	}
}

function verifyAttestedCandidateInputs(candidate, manifest) {
	if (existsSync(safeJoin(candidate, '.git'))) fail('clean-candidate commands introduced Git history')
	for (const record of manifest.files) {
		const absolute = safeJoin(candidate, record.path)
		if (!existsSync(absolute)) fail(`clean-candidate commands removed an audited input: ${record.path}`)
		assertNoSymlinkPath(candidate, record.path)
		const stats = lstatSync(absolute)
		if (!stats.isFile()) fail(`clean-candidate commands replaced an audited input: ${record.path}`)
		const bytes = readFileSync(absolute)
		const mode = `100${(stats.mode & 0o777).toString(8).padStart(3, '0')}`
		if (sha256(bytes) !== record.sha256 || bytes.length !== record.bytes || mode !== record.mode) {
			fail(`clean-candidate commands mutated an audited input: ${record.path}`)
		}
	}
}

function assertExternalOutputFile(sourceRoot, candidateRoot, outPath, label) {
	if (!outPath) fail(`${label} requires an explicit output path`)
	const absolute = resolve(outPath)
	if (existsSync(absolute)) fail(`${label} output already exists: ${absolute}`)
	const parent = dirname(absolute)
	if (!existsSync(parent) || !statSync(parent).isDirectory()) fail(`${label} output parent must be a directory`)
	const actual = join(realpathSync(parent), basename(absolute))
	for (const [boundary, boundaryLabel] of [
		[realpathSync(sourceRoot), 'source worktree'],
		[realpathSync(candidateRoot), 'candidate tree'],
	]) {
		if (actual === boundary || actual.startsWith(`${boundary}${sep}`)) {
			fail(`${label} output must be outside the ${boundaryLabel}`)
		}
	}
	return actual
}

export function attestCandidate({
	candidateDir,
	sourceRoot,
	ledgerPath,
	outPath,
	verifiedBy,
	commandRunner = defaultAttestationCommandRunner,
	now = () => new Date(),
}) {
	const candidate = resolve(candidateDir)
	const source = resolve(sourceRoot)
	const audit = auditCandidate(candidate, { sourceRoot: source, ledgerPath })
	if (audit.mode !== 'draft') fail('build attestation must run against an unlicensed draft candidate')
	const { value: manifest } = readExternalCanonicalJson(ledgerPath, LEDGER_LABEL)
	if (manifest.source_dirty) fail('build attestation requires a draft made from a clean source worktree')
	if (typeof verifiedBy !== 'string' || !verifiedBy.trim()) fail('build attestation requires --verified-by')
	const { profile } = validateProfile(source)
	const trustedPlan = resolveAllowlist(source, profile)
	validateTrackedReleaseInputs(source, trustedPlan.files, manifest.private_origin_commit)
	const output = assertExternalOutputFile(source, candidate, outPath, 'build attestation')
	const environment = {
		CI: '1',
		DATABASE_URL: 'postgresql://split:split@127.0.0.1:5432/split',
		FORCE_COLOR: '0',
		LANG: 'C.UTF-8',
		NEXT_PUBLIC_BASE_URL: 'http://localhost:3000',
		NO_COLOR: '1',
		PATH: process.env.PATH ?? '',
		SEO_INDEXABLE: 'false',
		TZ: 'UTC',
	}
	const commands = {}
	for (const [name, command] of Object.entries(REQUIRED_BUILD_COMMANDS)) {
		const result = commandRunner(command, { cwd: candidate, environment })
		const outputBytes = Buffer.isBuffer(result?.output)
			? result.output
			: Buffer.from(typeof result?.output === 'string' ? result.output : '')
		if (result?.status !== 0) {
			fail(`clean-candidate ${name} failed; redacted log SHA-256 ${sha256(outputBytes)}`)
		}
		commands[name] = {
			command: [...command],
			status: 'passed',
			completed_at: now().toISOString(),
			log_sha256: sha256(outputBytes),
		}
	}
	verifyAttestedCandidateInputs(candidate, manifest)
	validateTrackedReleaseInputs(source, trustedPlan.files, manifest.private_origin_commit)
	const verifiedAt = now().toISOString()
	const attestation = {
		schema_version: 1,
		candidate_scope: 'apps/web',
		private_origin_commit: manifest.private_origin_commit,
		profile_sha256: manifest.profile_sha256,
		input_tree_sha256: manifest.input_tree_sha256,
		environment_names: [...CLEAN_ATTESTATION_ENVIRONMENT_NAMES],
		commands,
		verified_by: verifiedBy,
		verified_at: verifiedAt,
	}
	validateBuildAttestationReceipt(
		{
			sha256: sha256(Buffer.from(canonicalJson(attestation))),
			verified_by: attestation.verified_by,
			verified_at: attestation.verified_at,
			environment_names: attestation.environment_names,
			commands: attestation.commands,
		},
		'generated build attestation'
	)
	writeFileSync(output, canonicalJson(attestation), { flag: 'wx', mode: 0o600 })
	return {
		output,
		private_origin_commit: manifest.private_origin_commit,
		input_tree_sha256: manifest.input_tree_sha256,
		sha256: sha256(readFileSync(output)),
	}
}

function validateHttpsArchiveUrl(value, publicCommit, archiveSha256) {
	let parsed
	try {
		parsed = new URL(value)
	} catch {
		fail('release receipt archive URL is invalid')
	}
	if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
		fail('release receipt archive URL must be HTTPS without credentials or a fragment')
	}
	if (!parsed.pathname.includes(publicCommit) && !parsed.pathname.includes(archiveSha256)) {
		fail('release receipt archive URL path must contain the immutable public commit or archive hash')
	}
	return parsed.toString()
}

function validateReleaseReceiptValue(receipt) {
	assertExactKeys(
		receipt,
		[
			'schema_version',
			'candidate_scope',
			'public_release_commit',
			'build_commit',
			'candidate_tree_sha256',
			'source_archive_url',
			'source_archive_sha256',
			'build_environment',
			'files',
		],
		'external release receipt'
	)
	if (receipt.schema_version !== 1 || receipt.candidate_scope !== 'apps/web') {
		fail('external release receipt identity is invalid')
	}
	for (const key of ['public_release_commit', 'build_commit']) {
		if (!/^[0-9a-f]{40}$/u.test(receipt[key])) fail(`external release receipt ${key} is invalid`)
	}
	if (receipt.public_release_commit !== receipt.build_commit) {
		fail('external release receipt build commit does not equal the public history-free release commit')
	}
	for (const key of ['candidate_tree_sha256', 'source_archive_sha256']) {
		if (!/^[0-9a-f]{64}$/u.test(receipt[key])) fail(`external release receipt ${key} is invalid`)
	}
	validateHttpsArchiveUrl(receipt.source_archive_url, receipt.public_release_commit, receipt.source_archive_sha256)
	assertExactKeys(receipt.build_environment, PUBLIC_RELEASE_ENVIRONMENT_KEYS, 'release build environment')
	const expectedEnvironment = {
		NEXT_PUBLIC_FOSS_RELEASED: '1',
		NEXT_PUBLIC_BUILD_COMMIT: receipt.build_commit,
		NEXT_PUBLIC_SOURCE_COMMIT: receipt.public_release_commit,
		NEXT_PUBLIC_SOURCE_ARCHIVE_URL: receipt.source_archive_url,
		NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256: receipt.source_archive_sha256,
	}
	if (JSON.stringify(receipt.build_environment) !== JSON.stringify(expectedEnvironment)) {
		fail('external release receipt build environment is not derived from the verified receipt')
	}
	if (!Array.isArray(receipt.files) || receipt.files.length === 0) fail('public release manifest files are missing')
	const paths = receipt.files.map((file) => file.path)
	if (new Set(paths).size !== paths.length || !sameArray(paths, [...paths].sort())) {
		fail('public release manifest file paths must be unique and sorted')
	}
	for (const [index, file] of receipt.files.entries()) {
		assertExactKeys(file, ['path', 'sha256', 'bytes', 'mode'], `public release manifest file ${index}`)
		normalizeRepoPath(file.path, `public release manifest file ${index}`)
		if (!/^[0-9a-f]{64}$/u.test(file.sha256)) fail(`public release manifest hash is invalid: ${file.path}`)
		if (!Number.isSafeInteger(file.bytes) || file.bytes < 0)
			fail(`public release manifest size is invalid: ${file.path}`)
		if (!/^100[0-7]{3}$/u.test(file.mode)) fail(`public release manifest mode is invalid: ${file.path}`)
	}
	if (sha256(canonicalJson(receipt.files)) !== receipt.candidate_tree_sha256) {
		fail('public release manifest tree hash does not match its distributable file records')
	}
}

function commitTreeFiles(root, commit) {
	const listing = execFileSync('git', ['--no-replace-objects', 'ls-tree', '-r', '-z', '--full-tree', commit], {
		cwd: root,
		encoding: null,
		maxBuffer: 64 * 1024 * 1024,
	})
	const files = []
	for (const record of listing.toString('utf8').split('\0').filter(Boolean)) {
		const match = /^(100[0-7]{3}) (blob) ([0-9a-f]{40,64})\t([\s\S]+)$/u.exec(record)
		if (!match) fail('public release commit contains a non-regular Git tree entry')
		const path = normalizeRepoPath(match[4], 'public release commit path')
		const bytes = execFileSync('git', ['--no-replace-objects', 'cat-file', 'blob', match[3]], {
			cwd: root,
			encoding: null,
			maxBuffer: MAX_FILE_BYTES + 1024,
		})
		files.push({ path, mode: match[1], object: match[3], bytes })
	}
	files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
	if (new Set(files.map((file) => file.path)).size !== files.length) {
		fail('public release commit contains duplicate paths')
	}
	return files
}

function writeTarString(header, offset, width, value, label) {
	const bytes = Buffer.from(value, 'utf8')
	if (bytes.length > width) fail(`source archive ${label} exceeds the ustar field limit`)
	bytes.copy(header, offset)
}

function writeTarOctal(header, offset, width, value, label) {
	const octal = value.toString(8)
	if (octal.length > width - 1) fail(`source archive ${label} exceeds the ustar numeric limit`)
	writeTarString(header, offset, width, `${octal.padStart(width - 1, '0')}\0`, label)
}

function tarPathFields(path) {
	if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' }
	for (let splitAt = path.lastIndexOf('/'); splitAt > 0; splitAt = path.lastIndexOf('/', splitAt - 1)) {
		const prefix = path.slice(0, splitAt)
		const name = path.slice(splitAt + 1)
		if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix }
	}
	fail(`source archive path exceeds the ustar path limit: ${path}`)
}

function buildSourceArchive(entries, archivePrefix) {
	const blocks = []
	for (const entry of entries) {
		const archivePath = `${archivePrefix}/${entry.path}`
		const { name, prefix } = tarPathFields(archivePath)
		const header = Buffer.alloc(512)
		writeTarString(header, 0, 100, name, 'name')
		writeTarOctal(header, 100, 8, Number.parseInt(entry.mode.slice(-3), 8), 'mode')
		writeTarOctal(header, 108, 8, 0, 'uid')
		writeTarOctal(header, 116, 8, 0, 'gid')
		writeTarOctal(header, 124, 12, entry.bytes.length, 'size')
		writeTarOctal(header, 136, 12, 0, 'mtime')
		header.fill(0x20, 148, 156)
		header[156] = 0x30
		writeTarString(header, 257, 6, 'ustar\0', 'magic')
		writeTarString(header, 263, 2, '00', 'version')
		writeTarString(header, 345, 155, prefix, 'prefix')
		const checksum = [...header].reduce((sum, byte) => sum + byte, 0)
		writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `, 'checksum')
		blocks.push(header, entry.bytes)
		const padding = (512 - (entry.bytes.length % 512)) % 512
		if (padding) blocks.push(Buffer.alloc(padding))
	}
	blocks.push(Buffer.alloc(1024))
	return gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 })
}

function tarText(header, offset, width) {
	const field = header.subarray(offset, offset + width)
	const terminator = field.indexOf(0)
	return field.subarray(0, terminator === -1 ? field.length : terminator).toString('utf8')
}

function tarOctal(header, offset, width, label) {
	const value = tarText(header, offset, width).trim()
	if (!/^[0-7]+$/u.test(value)) fail(`source archive has an invalid ${label}`)
	return Number.parseInt(value, 8)
}

function verifySourceArchive(archiveBytes, expected, archivePrefix) {
	let tar
	try {
		tar = gunzipSync(archiveBytes)
	} catch {
		fail('source archive is not a valid gzip stream')
	}
	const actual = []
	let offset = 0
	let ended = false
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512)
		if (header.every((byte) => byte === 0)) {
			if (offset + 1024 > tar.length || !tar.subarray(offset + 512, offset + 1024).every((byte) => byte === 0)) {
				fail('source archive is missing the two-block end marker')
			}
			if (!tar.subarray(offset + 1024).every((byte) => byte === 0)) {
				fail('source archive contains data after the end marker')
			}
			ended = true
			break
		}
		if (tarText(header, 257, 6) !== 'ustar') fail('source archive entry is not ustar')
		const expectedChecksum = tarOctal(header, 148, 8, 'checksum')
		const checksumHeader = Buffer.from(header)
		checksumHeader.fill(0x20, 148, 156)
		const actualChecksum = [...checksumHeader].reduce((sum, byte) => sum + byte, 0)
		if (actualChecksum !== expectedChecksum) fail('source archive header checksum is invalid')
		const name = tarText(header, 0, 100)
		const prefix = tarText(header, 345, 155)
		const path = prefix ? `${prefix}/${name}` : name
		if (header[156] !== 0x30 && header[156] !== 0) fail(`source archive contains a non-file entry: ${path}`)
		const size = tarOctal(header, 124, 12, 'size')
		const mode = tarOctal(header, 100, 8, 'mode')
		const dataStart = offset + 512
		const dataEnd = dataStart + size
		if (dataEnd > tar.length) fail(`source archive entry is truncated: ${path}`)
		actual.push({ path, mode, bytes: tar.subarray(dataStart, dataEnd) })
		offset = dataStart + Math.ceil(size / 512) * 512
	}
	if (!ended) fail('source archive is missing its end marker')
	if (actual.length !== expected.length) fail('source archive file count differs from the public commit')
	for (const [index, entry] of expected.entries()) {
		const archived = actual[index]
		const expectedPath = `${archivePrefix}/${entry.path}`
		if (
			archived.path !== expectedPath ||
			archived.mode !== Number.parseInt(entry.mode.slice(-3), 8) ||
			!archived.bytes.equals(entry.bytes)
		) {
			fail(`source archive differs from the public commit: ${entry.path}`)
		}
	}
}

export function createReleaseReceipt({
	candidateDir,
	sourceRoot,
	ledgerPath,
	clearancePath,
	buildAttestationPath,
	publicCheckout,
	buildCommit,
	archiveOutPath,
	archiveUrl,
	outPath,
}) {
	const candidate = resolve(candidateDir)
	const source = resolve(sourceRoot)
	const audit = auditCandidate(candidate, {
		sourceRoot: source,
		ledgerPath,
		clearancePath,
		buildAttestationPath,
	})
	if (audit.mode !== 'release') fail('external release receipt requires an audited licensed candidate')
	if (!publicCheckout) fail('external release receipt requires the checked-out public history-free repository')
	const publicRoot = resolve(publicCheckout)
	const publicGit = publicGitIdentity(publicRoot)
	if (!/^[0-9a-f]{40}$/u.test(buildCommit ?? '')) {
		fail('external release receipt requires an independently observed lowercase 40-hex build commit')
	}
	if (buildCommit !== publicGit.commit) {
		fail('independently observed build commit does not equal the audited public source commit')
	}
	const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
		cwd: publicRoot,
		encoding: 'utf8',
	}).trim()
	const grafts = join(gitDirectory, 'info/grafts')
	if (existsSync(grafts) && readFileSync(grafts, 'utf8').trim()) {
		fail('public checkout must not use Git grafts to hide parent history')
	}
	const replaceRefs = execFileSync('git', ['for-each-ref', '--format=%(refname)', 'refs/replace/'], {
		cwd: publicRoot,
		encoding: 'utf8',
	}).trim()
	if (replaceRefs) fail('public checkout must not use Git replacement refs to hide parent history')
	const refs = execFileSync('git', ['for-each-ref', '--format=%(refname) %(objecttype) %(objectname)'], {
		cwd: publicRoot,
		encoding: 'utf8',
	})
		.trim()
		.split('\n')
		.filter(Boolean)
	if (!sameArray(refs, [`refs/heads/main commit ${publicGit.commit}`])) {
		fail('public checkout must expose only refs/heads/main at the history-free release commit')
	}
	const remotes = execFileSync('git', ['remote'], { cwd: publicRoot, encoding: 'utf8' })
		.trim()
		.split(/\s+/u)
		.filter(Boolean)
	if (remotes.length > 0) fail('public checkout must be a fresh repository without configured remotes')
	const symbolicHead = execFileSync('git', ['symbolic-ref', '--quiet', 'HEAD'], {
		cwd: publicRoot,
		encoding: 'utf8',
	}).trim()
	if (symbolicHead !== 'refs/heads/main') fail('public checkout HEAD must be refs/heads/main')
	const rawCommit = execFileSync('git', ['--no-replace-objects', 'cat-file', '-p', publicGit.commit], {
		cwd: publicRoot,
		encoding: 'utf8',
	})
	const escapedName = PUBLIC_RELEASE_COMMIT.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
	const escapedEmail = PUBLIC_RELEASE_COMMIT.email.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
	const escapedMessage = PUBLIC_RELEASE_COMMIT.message.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
	const safeCommit = new RegExp(
		`^tree [0-9a-f]{40,64}\\nauthor ${escapedName} <${escapedEmail}> [0-9]+ \\+0000\\ncommitter ${escapedName} <${escapedEmail}> [0-9]+ \\+0000\\n\\n${escapedMessage}\\n$`,
		'u'
	)
	if (!safeCommit.test(rawCommit)) {
		fail('public release commit metadata must use the fixed Squirrel Labs identity and release message')
	}
	const allCommits = execFileSync('git', ['--no-replace-objects', 'rev-list', '--all'], {
		cwd: publicRoot,
		encoding: 'utf8',
	})
		.trim()
		.split(/\s+/u)
		.filter(Boolean)
	if (new Set(allCommits).size !== 1 || allCommits[0] !== publicGit.commit) {
		fail('public checkout must contain exactly one history-free commit across all refs')
	}
	const reflogCommits = execFileSync('git', ['reflog', '--all', '--format=%H'], {
		cwd: publicRoot,
		encoding: 'utf8',
	})
		.trim()
		.split(/\s+/u)
		.filter(Boolean)
	if (reflogCommits.some((commit) => commit !== publicGit.commit)) {
		fail('public checkout reflogs must contain only the history-free release commit')
	}
	const objectAudit = spawnSync(
		'git',
		['--no-replace-objects', 'fsck', '--full', '--unreachable', '--no-reflogs', '--no-progress'],
		{ cwd: publicRoot, encoding: 'utf8' }
	)
	if (objectAudit.status !== 0 || objectAudit.stdout.trim() || objectAudit.stderr.trim()) {
		fail('public checkout object database contains unreachable, dangling, or invalid objects')
	}
	const parentLine = execFileSync(
		'git',
		['--no-replace-objects', 'rev-list', '--parents', '-n', '1', publicGit.commit],
		{
			cwd: publicRoot,
			encoding: 'utf8',
		}
	)
		.trim()
		.split(/\s+/u)
	if (parentLine.length !== 1) fail('public release commit must have no parent history')
	const candidatePaths = actualCandidateFiles(candidate)
	const publicPaths = []
	const visitPublic = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (directory === publicRoot && entry.name === '.git') continue
			const absolute = join(directory, entry.name)
			const path = candidatePathFromAbsolute(publicRoot, absolute)
			const stats = lstatSync(absolute)
			if (stats.isSymbolicLink()) fail(`public checkout contains a symlink: ${path}`)
			if (stats.isDirectory()) visitPublic(absolute)
			else if (stats.isFile()) publicPaths.push(path)
			else fail(`public checkout contains a non-regular entry: ${path}`)
		}
	}
	visitPublic(publicRoot)
	publicPaths.sort()
	if (!sameArray(publicPaths, candidatePaths))
		fail('public checkout tree does not exactly equal the audited candidate')
	const committedFiles = commitTreeFiles(publicRoot, publicGit.commit)
	if (
		!sameArray(
			committedFiles.map((file) => file.path),
			candidatePaths
		)
	) {
		fail('public release commit does not contain the exact audited candidate inventory')
	}
	for (const [index, path] of candidatePaths.entries()) {
		const candidateFile = safeJoin(candidate, path)
		const publicFile = safeJoin(publicRoot, path)
		const candidateBytes = readFileSync(candidateFile)
		const publicBytes = readFileSync(publicFile)
		const committed = committedFiles[index]
		if (!candidateBytes.equals(publicBytes)) {
			fail(`public release commit differs from the audited candidate: ${path}`)
		}
		const candidateMode = `100${(statSync(candidateFile).mode & 0o777).toString(8).padStart(3, '0')}`
		const publicMode = `100${(statSync(publicFile).mode & 0o777).toString(8).padStart(3, '0')}`
		if (candidateMode !== publicMode) {
			fail(`public release mode differs from the audited candidate: ${path}`)
		}
		if (!candidateBytes.equals(committed.bytes) || candidateMode !== committed.mode) {
			fail(`public release commit blob differs from the audited candidate: ${path}`)
		}
	}
	const archiveOutput = assertExternalOutputFile(source, candidate, archiveOutPath, 'candidate archive')
	const publicReal = realpathSync(publicRoot)
	if (archiveOutput === publicReal || archiveOutput.startsWith(`${publicReal}${sep}`)) {
		fail('candidate archive output must be outside the public checkout')
	}
	const archivePrefix = `peanut-split-${publicGit.commit}`
	const archiveBytes = buildSourceArchive(committedFiles, archivePrefix)
	verifySourceArchive(archiveBytes, committedFiles, archivePrefix)
	const archiveSha256 = sha256(archiveBytes)
	const normalizedArchiveUrl = validateHttpsArchiveUrl(archiveUrl, publicGit.commit, archiveSha256)
	const publicFiles = committedFiles.map((file) => {
		return {
			path: file.path,
			sha256: sha256(file.bytes),
			bytes: file.bytes.length,
			mode: file.mode,
		}
	})
	const receipt = {
		schema_version: 1,
		candidate_scope: 'apps/web',
		public_release_commit: publicGit.commit,
		build_commit: buildCommit,
		candidate_tree_sha256: sha256(canonicalJson(publicFiles)),
		source_archive_url: normalizedArchiveUrl,
		source_archive_sha256: archiveSha256,
		build_environment: {
			NEXT_PUBLIC_FOSS_RELEASED: '1',
			NEXT_PUBLIC_BUILD_COMMIT: buildCommit,
			NEXT_PUBLIC_SOURCE_COMMIT: publicGit.commit,
			NEXT_PUBLIC_SOURCE_ARCHIVE_URL: normalizedArchiveUrl,
			NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256: archiveSha256,
		},
		files: publicFiles,
	}
	validateReleaseReceiptValue(receipt)
	if (publicGitIdentity(publicRoot).commit !== publicGit.commit) {
		fail('public checkout HEAD changed while the release receipt was derived')
	}
	const output = assertExternalOutputFile(source, candidate, outPath, 'external release receipt')
	if (output === publicReal || output.startsWith(`${publicReal}${sep}`)) {
		fail('external release receipt output must be outside the public checkout')
	}
	if (output === archiveOutput) fail('source archive and external release receipt require different outputs')
	writeFileSync(archiveOutput, archiveBytes, { flag: 'wx', mode: 0o644 })
	writeFileSync(output, canonicalJson(receipt), { flag: 'wx', mode: 0o644 })
	return { output, archive: archiveOutput, sha256: sha256(readFileSync(output)), receipt }
}

export function buildCandidate({
	root,
	outDir,
	ledgerOutPath = null,
	mode = 'draft',
	dryRun = false,
	clearancePath = null,
	buildAttestationPath = null,
}) {
	const repositoryRoot = resolve(root)
	const { files, manifest } = buildPlan(repositoryRoot, mode, { clearancePath, buildAttestationPath })
	if (dryRun) {
		return {
			dry_run: true,
			mode,
			private_origin_commit: manifest.private_origin_commit,
			source_dirty: manifest.source_dirty,
			profile_sha256: manifest.profile_sha256,
			input_tree_sha256: manifest.input_tree_sha256,
			foss_release_boundary: manifest.foss_release_boundary,
			files: manifest.files.length,
			pending_gates: REQUIRED_GATES.filter((name) => manifest.clearance[name].status !== 'approved'),
			excluded_paths: manifest.excluded_paths,
		}
	}
	if (!outDir) fail('an explicit --out directory is required unless --dry-run is used')
	if (!ledgerOutPath) fail('an explicit external --ledger-out file is required for a written candidate')
	const outputRoot = assertOutputTarget(repositoryRoot, outDir)
	const ledgerOutput = assertExternalOutputFile(repositoryRoot, outputRoot, ledgerOutPath, 'private release ledger')
	for (const [path, file] of [...files.entries()].sort(([left], [right]) =>
		left < right ? -1 : left > right ? 1 : 0
	)) {
		const destination = safeJoin(outputRoot, path)
		mkdirSync(dirname(destination), { recursive: true })
		writeFileSync(destination, file.output_bytes ?? file.bytes)
		chmodSync(destination, file.mode ?? 0o644)
	}
	writeFileSync(ledgerOutput, canonicalJson(manifest), { flag: 'wx', mode: 0o600 })
	const audit = auditCandidate(outputRoot, {
		sourceRoot: repositoryRoot,
		ledgerPath: ledgerOutput,
		clearancePath: mode === 'release' ? clearancePath : null,
		buildAttestationPath: mode === 'release' ? buildAttestationPath : null,
	})
	return { dry_run: false, output: outputRoot, private_ledger: ledgerOutput, ...audit }
}
