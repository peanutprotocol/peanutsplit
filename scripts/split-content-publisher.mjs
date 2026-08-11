#!/usr/bin/env node

/**
 * Target-owned half of the Split content publisher.
 *
 * Mono's mirror script is allowed to run only in the read-only preparation job. That job packs
 * the resulting machine-owned tree into a data-only JSON bundle. The write-capable job runs this
 * file from PeanutSplit main, revalidates the bundle, installs it, and refuses every diff outside
 * the locked destination.
 */

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const LOCK_KEYS = [
	'schema_version',
	'source_repository',
	'source_branch',
	'mirror_script_path',
	'mirror_script_git_blob',
	'mirror_script_sha256',
	'destination_root',
	'artifact_branch',
	'ci_workflow',
]
const MANIFEST_KEYS = [
	'schema_version',
	'source_repository',
	'source_commit',
	'content_root',
	'locales',
	'input_sha256',
	'entries',
]
const ENTRY_KEYS = [
	'content_type',
	'slug',
	'locale',
	'public_path',
	'output_path',
	'output_sha256',
	'source_input_paths',
]
const V2_ENTRY_KEYS = [
	'content_type',
	'slug',
	'locale',
	'public_path',
	'legacy_paths',
	'output_path',
	'output_sha256',
	'source_input_paths',
]
const PAYLOAD_KEYS = [
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
]
const GENERATED_FROM_KEYS = ['template', 'data', 'product', 'workflow', 'context', 'guidelines']
const GENERATED_FROM_SECTIONS = [
	{ key: 'template', kind: 'scalar' },
	{ key: 'data', kind: 'list' },
	{ key: 'product', kind: 'list' },
	{ key: 'workflow', kind: 'scalar' },
	{ key: 'context', kind: 'list' },
	{ key: 'guidelines', kind: 'list' },
]
const TYPE_RANK = new Map(['guide', 'hub', 'tools_hub', 'calculator'].map((type, index) => [type, index]))
const BUNDLE_KEYS = [
	'schema_version',
	'source_repository',
	'source_commit',
	'target_base_commit',
	'destination_root',
	'prior_tree_sha256',
	'tree_sha256',
	'files',
]
const BUNDLE_FILE_KEYS = ['path', 'sha256', 'content_base64']
const SOURCE_REPOSITORY = 'peanutprotocol/mono'
const SOURCE_BRANCH = 'main'
const MIRROR_SCRIPT_PATH = 'scripts/split-content-mirror.mjs'
const DESTINATION_ROOT = 'apps/web/src/generated/seo'
const ARTIFACT_BRANCH = 'automation/split-content-artifacts'
const CI_WORKFLOW = 'ci.yml'
const PUBLISHED_PREFIX = 'split-content/published/'
const LOCALES = ['en', 'es-419', 'pt-br']
const COMMIT_SHA = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const GIT_BLOB = /^[0-9a-f]{40}$/
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CLAIM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const LEGACY_PATH = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/
const RESERVED_LEGACY_PREFIXES = ['/api', '/app', '/import', '/new', '/r']
const CALCULATOR_SLUGS = ['rent-split-calculator', 'mileage-split-calculator']
const MILEAGE_CODES = ['AU', 'BE', 'BR', 'CA', 'FR', 'DE', 'IE', 'NL', 'PL', 'ES', 'GB', 'US']

export class PublisherValidationError extends Error {
	constructor(message) {
		super(message)
		this.name = 'PublisherValidationError'
	}
}

function fail(message) {
	throw new PublisherValidationError(message)
}

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(value, expected, label) {
	if (!isPlainObject(value)) fail(`${label} must be an object`)
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		fail(`${label} keys must be exactly: ${wanted.join(', ')}`)
	}
}

function assertExactOrderedKeys(value, expected, label) {
	assertExactKeys(value, expected, label)
	const actual = Object.keys(value)
	if (actual.some((key, index) => key !== expected[index])) {
		fail(`${label} keys must use the canonical order: ${expected.join(', ')}`)
	}
}

function assertNonEmptyString(value, label) {
	if (typeof value !== 'string' || value.trim() !== value || !value)
		fail(`${label} must be a non-empty trimmed string`)
}

function assertDate(value, label) {
	if (typeof value !== 'string' || !DATE.test(value)) fail(`${label} must be an ISO calendar date`)
	const parsed = new Date(`${value}T00:00:00.000Z`)
	if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
		fail(`${label} must be an ISO calendar date`)
	}
}

function assertStringArray(value, label, { min = 0, pattern } = {}) {
	if (!Array.isArray(value) || value.length < min)
		fail(`${label} must be a string array with at least ${min} item(s)`)
	const seen = new Set()
	for (const [index, item] of value.entries()) {
		assertNonEmptyString(item, `${label}[${index}]`)
		if (pattern && !pattern.test(item)) fail(`${label}[${index}] is invalid: ${item}`)
		if (seen.has(item)) fail(`${label} contains a duplicate: ${item}`)
		seen.add(item)
	}
	return value
}

function assertLegacyPath(value, label) {
	if (typeof value !== 'string' || !LEGACY_PATH.test(value) || (value !== '/' && value.endsWith('/'))) {
		fail(`${label} must be a normalized root-relative legacy path`)
	}
	if (RESERVED_LEGACY_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))) {
		fail(`${label} is in a product or API namespace: ${value}`)
	}
}

function assertPublicPath(value, label) {
	if (typeof value !== 'string' || !LEGACY_PATH.test(value) || value === '/' || value.endsWith('/')) {
		fail(`${label} must be a normalized root-relative public path`)
	}
}

function parseCanonicalJsonBytes(bytes, label) {
	const parsed = parseJsonBytes(bytes, label)
	const canonical = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`)
	if (!canonical.equals(bytes)) fail(`${label} must use canonical two-space JSON with one final newline`)
	return parsed
}

function assertCommit(value, label) {
	if (typeof value !== 'string' || !COMMIT_SHA.test(value)) {
		fail(`${label} must be a lowercase 40-character Git SHA`)
	}
}

function assertSha256(value, label) {
	if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} must be a lowercase SHA-256`)
}

function assertSafeRelativePath(value, label) {
	if (typeof value !== 'string' || !value || !SAFE_PATH.test(value)) {
		fail(`${label} must be a non-empty POSIX repository path`)
	}
	if (
		value.startsWith('/') ||
		value.includes('\\') ||
		path.posix.normalize(value) !== value ||
		value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
	) {
		fail(`${label} escapes or is not normalized: ${value}`)
	}
}

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function compareAscii(left, right) {
	return left < right ? -1 : left > right ? 1 : 0
}

function parseJsonBytes(bytes, label) {
	const text = bytes.toString('utf8')
	if (!Buffer.from(text).equals(bytes)) fail(`${label} must be valid UTF-8`)
	try {
		return JSON.parse(text)
	} catch {
		fail(`${label} is not valid JSON`)
	}
}

function readRegularFile(filePath, label) {
	let stats
	try {
		stats = fs.lstatSync(filePath)
	} catch {
		fail(`${label} does not exist: ${filePath}`)
	}
	if (stats.isSymbolicLink() || !stats.isFile()) fail(`${label} must be a regular file: ${filePath}`)
	if ((stats.mode & 0o111) !== 0) fail(`${label} must not be executable: ${filePath}`)
	return fs.readFileSync(filePath)
}

function lstatIfPresent(filePath) {
	try {
		return fs.lstatSync(filePath)
	} catch (error) {
		if (error?.code === 'ENOENT') return undefined
		throw error
	}
}

function walkRegularTree(root, { allowMissing = false, label = 'artifact tree' } = {}) {
	const rootStats = lstatIfPresent(root)
	if (!rootStats) {
		if (allowMissing) return []
		fail(`${label} does not exist: ${root}`)
	}
	if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) fail(`${label} must be a real directory: ${root}`)

	const files = []
	const walk = (directory, prefix) => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
			assertSafeRelativePath(relativePath, `${label} entry`)
			const absolutePath = path.join(directory, entry.name)
			const stats = fs.lstatSync(absolutePath)
			if (stats.isSymbolicLink()) fail(`${label} contains a symlink: ${relativePath}`)
			if (stats.isDirectory()) {
				walk(absolutePath, relativePath)
			} else if (stats.isFile()) {
				if ((stats.mode & 0o111) !== 0) fail(`${label} contains an executable file: ${relativePath}`)
				files.push({ path: relativePath, bytes: fs.readFileSync(absolutePath) })
			} else {
				fail(`${label} contains a non-regular entry: ${relativePath}`)
			}
		}
	}
	walk(root, '')
	return files.sort((left, right) => compareAscii(left.path, right.path))
}

function treeSha256(files) {
	const digest = crypto.createHash('sha256')
	const sorted = [...files].sort((left, right) => compareAscii(left.path, right.path))
	const seen = new Set()
	for (const file of sorted) {
		assertSafeRelativePath(file.path, 'tree file path')
		if (seen.has(file.path)) fail(`tree contains a duplicate path: ${file.path}`)
		seen.add(file.path)
		const bytes = Buffer.from(file.bytes)
		digest.update(`${Buffer.byteLength(file.path, 'utf8')}:`)
		digest.update(file.path, 'utf8')
		digest.update(`\0${bytes.length}:`)
		digest.update(bytes)
		digest.update('\0')
	}
	return digest.digest('hex')
}

function assertSameStringSet(actual, expected, label) {
	const left = [...new Set(actual)].sort()
	const right = [...new Set(expected)].sort()
	const extra = left.filter((value) => !right.includes(value))
	const missing = right.filter((value) => !left.includes(value))
	if (extra.length || missing.length || actual.length !== left.length || expected.length !== right.length) {
		const details = [
			extra.length ? `extra: ${extra.join(', ')}` : '',
			missing.length ? `missing: ${missing.join(', ')}` : '',
			actual.length !== left.length ? 'duplicates in actual values' : '',
			expected.length !== right.length ? 'duplicates in expected values' : '',
		]
			.filter(Boolean)
			.join('; ')
		fail(`${label} mismatch${details ? ` (${details})` : ''}`)
	}
}

function assertExactArray(actual, expected, label) {
	if (
		!Array.isArray(actual) ||
		actual.length !== expected.length ||
		actual.some((item, index) => item !== expected[index])
	) {
		fail(`${label} must be exactly: ${expected.join(', ')}`)
	}
}

function expectedV2Paths(entry) {
	if (entry.content_type === 'guide') {
		return {
			publicPath: `/${entry.locale}/split/guides/${entry.slug}`,
			outputPath: `${PUBLISHED_PREFIX}guides/${entry.slug}/${entry.locale}.md`,
		}
	}
	if (entry.content_type === 'hub') {
		return {
			publicPath: `/${entry.locale}/split`,
			outputPath: `${PUBLISHED_PREFIX}hubs/split/${entry.locale}.json`,
		}
	}
	if (entry.content_type === 'tools_hub') {
		return {
			publicPath: '/en/split/tools',
			outputPath: `${PUBLISHED_PREFIX}tools-hubs/tools/en.json`,
		}
	}
	return {
		publicPath: `/en/split/tools/${entry.slug}`,
		outputPath: `${PUBLISHED_PREFIX}calculators/${entry.slug}/en.json`,
	}
}

function validateGeneratedFrom(value, entry, label) {
	assertExactOrderedKeys(value, GENERATED_FROM_KEYS, `${label}.generated_from`)
	assertNonEmptyString(value.template, `${label}.generated_from.template`)
	assertNonEmptyString(value.workflow, `${label}.generated_from.workflow`)
	const data = assertStringArray(value.data, `${label}.generated_from.data`, { min: 1 })
	const product = assertStringArray(value.product, `${label}.generated_from.product`, { min: 1 })
	const context = assertStringArray(value.context, `${label}.generated_from.context`, { min: 1 })
	const guidelines = assertStringArray(value.guidelines, `${label}.generated_from.guidelines`, { min: 1 })
	const paths = [value.template, ...data, ...product, value.workflow, ...context, ...guidelines]
	for (const [index, inputPath] of paths.entries()) {
		assertSafeRelativePath(inputPath, `${label}.generated_from path ${index}`)
		if (
			(!inputPath.startsWith('split-content/_system/') && !inputPath.startsWith('split-content/product/')) ||
			inputPath.startsWith('split-content/_system/generated/')
		) {
			fail(`${label}.generated_from path is outside the source allowlist: ${inputPath}`)
		}
	}
	assertExactArray(paths, entry.source_input_paths, `${label}.generated_from flattened paths`)
}

function validateGuideGeneratedFrom(outputBytes, entry, label) {
	const text = outputBytes.toString('utf8')
	if (!Buffer.from(text).equals(outputBytes)) fail(`${label} must be valid UTF-8`)
	const lines = text.split('\n')
	if (lines[0] !== '---') fail(`${label} must start with YAML frontmatter`)
	const end = lines.indexOf('---', 1)
	if (end === -1) fail(`${label} frontmatter is not closed`)
	const indexes = []
	for (let index = 1; index < end; index += 1) if (lines[index] === 'generated_from:') indexes.push(index)
	if (indexes.length !== 1) fail(`${label} must contain exactly one generated_from block`)

	const paths = []
	let cursor = indexes[0] + 1
	for (const section of GENERATED_FROM_SECTIONS) {
		if (section.kind === 'scalar') {
			const prefix = `  ${section.key}: `
			const line = lines[cursor] ?? ''
			if (!line.startsWith(prefix) || line.length === prefix.length) {
				fail(`${label} generated_from.${section.key} must be one repository path`)
			}
			const sourcePath = line.slice(prefix.length)
			assertSafeRelativePath(sourcePath, `${label} generated_from.${section.key}`)
			paths.push(sourcePath)
			cursor += 1
			continue
		}

		if (lines[cursor] !== `  ${section.key}:`) {
			fail(`${label} generated_from.${section.key} must be a path list in the known block order`)
		}
		cursor += 1
		const firstPathIndex = paths.length
		while (cursor < end && lines[cursor].startsWith('    - ')) {
			const sourcePath = lines[cursor].slice('    - '.length)
			assertSafeRelativePath(sourcePath, `${label} generated_from.${section.key}`)
			paths.push(sourcePath)
			cursor += 1
		}
		if (paths.length === firstPathIndex) fail(`${label} generated_from.${section.key} must not be empty`)
	}
	if (!(lines[cursor] ?? '').startsWith('generated_at: ')) {
		fail(`${label} generated_from block has an unknown, missing, or out-of-order field`)
	}
	assertExactArray(paths, entry.source_input_paths, `${label} generated_from paths`)
}

function validateTextSection(value, label, { list = false } = {}) {
	assertExactOrderedKeys(value, ['title', 'body'], label)
	assertNonEmptyString(value.title, `${label}.title`)
	if (list) assertStringArray(value.body, `${label}.body`, { min: 1 })
	else assertNonEmptyString(value.body, `${label}.body`)
}

function validateAction(value, label, { body = false } = {}) {
	const keys = body ? ['title', 'body', 'label', 'hint', 'action'] : ['kind', 'label', 'hint']
	assertExactOrderedKeys(value, keys, label)
	if (body) {
		assertNonEmptyString(value.title, `${label}.title`)
		assertNonEmptyString(value.body, `${label}.body`)
		if (value.action !== 'app_new') fail(`${label}.action must be app_new`)
	} else if (value.kind !== 'app_new') fail(`${label}.kind must be app_new`)
	assertNonEmptyString(value.label, `${label}.label`)
	assertNonEmptyString(value.hint, `${label}.hint`)
}

function validateHubContent(value, payload, label) {
	assertExactOrderedKeys(value, ['intro', 'primary_action', 'cards'], label)
	assertStringArray(value.intro, `${label}.intro`, { min: 1 })
	validateAction(value.primary_action, `${label}.primary_action`)
	if (!Array.isArray(value.cards) || value.cards.length === 0) fail(`${label}.cards must be a non-empty array`)
	const ids = []
	const legacyPaths = []
	const publicPaths = []
	for (const [index, card] of value.cards.entries()) {
		const cardLabel = `${label}.cards[${index}]`
		assertExactOrderedKeys(
			card,
			['id', 'kind', 'locale', 'title', 'description', 'date', 'tags', 'legacy_path', 'public_path'],
			cardLabel
		)
		if (typeof card.id !== 'string' || !SLUG.test(card.id)) fail(`${cardLabel}.id is invalid`)
		if (!['guide', 'alternative', 'tools_hub'].includes(card.kind)) fail(`${cardLabel}.kind is unsupported`)
		if (!LOCALES.includes(card.locale) || card.locale !== payload.lang) {
			fail(`${cardLabel}.locale must match the hub locale`)
		}
		assertNonEmptyString(card.title, `${cardLabel}.title`)
		assertNonEmptyString(card.description, `${cardLabel}.description`)
		if (card.date !== null) assertDate(card.date, `${cardLabel}.date`)
		assertStringArray(card.tags, `${cardLabel}.tags`)
		assertLegacyPath(card.legacy_path, `${cardLabel}.legacy_path`)
		assertPublicPath(card.public_path, `${cardLabel}.public_path`)

		const expectedPublicPath =
			card.kind === 'guide'
				? `/${card.locale}/split/guides/${card.id}`
				: card.kind === 'alternative'
					? `/${card.locale}/split/alternatives/${card.id}`
					: '/en/split/tools'
		if (card.kind === 'tools_hub' && (card.id !== 'tools' || card.locale !== 'en')) {
			fail(`${cardLabel} tools_hub identity must be en/tools`)
		}
		if (card.public_path !== expectedPublicPath) fail(`${cardLabel}.public_path must be ${expectedPublicPath}`)
		ids.push(`${card.kind}/${card.id}`)
		legacyPaths.push(card.legacy_path)
		publicPaths.push(card.public_path)
	}
	assertSameStringSet(ids, ids, `${label} card identities`)
	assertSameStringSet(legacyPaths, legacyPaths, `${label} card legacy paths`)
	assertSameStringSet(publicPaths, publicPaths, `${label} card public paths`)
}

function validateToolsHubContent(value, label) {
	assertExactOrderedKeys(value, ['intro', 'app_card', 'calculator_slugs'], label)
	assertStringArray(value.intro, `${label}.intro`, { min: 1 })
	validateAction(value.app_card, `${label}.app_card`, { body: true })
	assertExactArray(value.calculator_slugs, CALCULATOR_SLUGS, `${label}.calculator_slugs`)
}

function validateRelatedLink(value, label) {
	assertExactOrderedKeys(value, ['label', 'legacy_path', 'public_path'], label)
	assertNonEmptyString(value.label, `${label}.label`)
	assertLegacyPath(value.legacy_path, `${label}.legacy_path`)
	assertPublicPath(value.public_path, `${label}.public_path`)
}

function validateCalculatorCopy(value, label) {
	assertExactOrderedKeys(
		value,
		['intro', 'result', 'method', 'concession', 'good_to_know', 'cta', 'faq_title', 'faqs', 'related'],
		label
	)
	assertStringArray(value.intro, `${label}.intro`, { min: 1 })
	assertExactOrderedKeys(
		value.result,
		['title', 'hint', 'rounding_note', 'copy_label', 'copy_done'],
		`${label}.result`
	)
	for (const key of ['title', 'hint', 'rounding_note', 'copy_label', 'copy_done']) {
		assertNonEmptyString(value.result[key], `${label}.result.${key}`)
	}
	if (value.method !== null) validateTextSection(value.method, `${label}.method`, { list: true })
	validateTextSection(value.concession, `${label}.concession`)
	validateTextSection(value.good_to_know, `${label}.good_to_know`, { list: true })
	validateAction(value.cta, `${label}.cta`, { body: true })
	assertNonEmptyString(value.faq_title, `${label}.faq_title`)
	if (!Array.isArray(value.faqs) || value.faqs.length === 0) fail(`${label}.faqs must be a non-empty array`)
	for (const [index, faq] of value.faqs.entries()) {
		const faqLabel = `${label}.faqs[${index}]`
		assertExactOrderedKeys(faq, ['question', 'answer'], faqLabel)
		assertNonEmptyString(faq.question, `${faqLabel}.question`)
		assertNonEmptyString(faq.answer, `${faqLabel}.answer`)
	}
	if (!Array.isArray(value.related) || value.related.length < 1 || value.related.length > 3) {
		fail(`${label}.related must contain one to three links`)
	}
	value.related.forEach((item, index) => validateRelatedLink(item, `${label}.related[${index}]`))
}

function validateSourceUrl(value, label) {
	assertNonEmptyString(value, label)
	let url
	try {
		url = new URL(value)
	} catch {
		fail(`${label} must be an absolute HTTPS URL`)
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
		fail(`${label} must be an absolute HTTPS URL without credentials or a fragment`)
	}
}

function validateMileageData(value, label) {
	assertExactOrderedKeys(value, ['version', 'retrieved_at', 'rows'], label)
	assertNonEmptyString(value.version, `${label}.version`)
	assertDate(value.retrieved_at, `${label}.retrieved_at`)
	if (!Array.isArray(value.rows) || value.rows.length !== MILEAGE_CODES.length) {
		fail(`${label}.rows must contain the exact reviewed country set`)
	}
	const codes = []
	for (const [index, row] of value.rows.entries()) {
		const rowLabel = `${label}.rows[${index}]`
		assertExactOrderedKeys(
			row,
			['code', 'label', 'unit', 'rate_decimal', 'currency', 'note', 'source_label', 'source_url'],
			rowLabel
		)
		if (row.code !== MILEAGE_CODES[index]) fail(`${rowLabel}.code must be ${MILEAGE_CODES[index]}`)
		assertNonEmptyString(row.label, `${rowLabel}.label`)
		if (!['km', 'mile'].includes(row.unit)) fail(`${rowLabel}.unit must be km or mile`)
		if (
			row.rate_decimal !== null &&
			(typeof row.rate_decimal !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.rate_decimal))
		) {
			fail(`${rowLabel}.rate_decimal must be a non-negative decimal string or null`)
		}
		if (typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency)) {
			fail(`${rowLabel}.currency must be an ISO-style uppercase currency code`)
		}
		assertNonEmptyString(row.note, `${rowLabel}.note`)
		assertNonEmptyString(row.source_label, `${rowLabel}.source_label`)
		validateSourceUrl(row.source_url, `${rowLabel}.source_url`)
		codes.push(row.code)
	}
	assertSameStringSet(codes, codes, `${label} country codes`)
}

function validateCalculatorContent(value, entry, label) {
	assertExactOrderedKeys(value, ['engine', 'copy', 'data'], label)
	const expectedEngine = entry.slug === 'rent-split-calculator' ? 'rent_split_v1' : 'mileage_split_v1'
	if (!CALCULATOR_SLUGS.includes(entry.slug)) fail(`${label} has no reviewed calculator engine for ${entry.slug}`)
	if (value.engine !== expectedEngine) fail(`${label}.engine must be ${expectedEngine}`)
	validateCalculatorCopy(value.copy, `${label}.copy`)
	if (entry.slug === 'rent-split-calculator') {
		if (value.data !== null) fail(`${label}.data must be null for rent_split_v1`)
	} else validateMileageData(value.data, `${label}.data`)
}

function validateV2Payload(outputBytes, entry, entries, label) {
	const payload = parseCanonicalJsonBytes(outputBytes, label)
	assertExactOrderedKeys(payload, PAYLOAD_KEYS, label)
	if (payload.payload_schema_version !== 1) fail(`${label}.payload_schema_version must be 1`)
	if (payload.type !== entry.content_type || payload.slug !== entry.slug || payload.lang !== entry.locale) {
		fail(`${label} identity disagrees with its manifest entry`)
	}
	assertNonEmptyString(payload.title, `${label}.title`)
	assertNonEmptyString(payload.description, `${label}.description`)
	const expectedCanonical = `https://peanut.me${entry.public_path}`
	if (payload.canonical !== expectedCanonical) fail(`${label}.canonical must be ${expectedCanonical}`)

	const siblings = entries
		.filter((candidate) => candidate.content_type === entry.content_type && candidate.slug === entry.slug)
		.sort((left, right) => LOCALES.indexOf(left.locale) - LOCALES.indexOf(right.locale))
	const alternateLocales = siblings.map((candidate) => candidate.locale)
	assertExactOrderedKeys(payload.alternates, alternateLocales, `${label}.alternates`)
	for (const sibling of siblings) {
		if (payload.alternates[sibling.locale] !== sibling.output_path) {
			fail(`${label}.alternates.${sibling.locale} must be ${sibling.output_path}`)
		}
	}
	assertStringArray(payload.claims, `${label}.claims`, { min: 1, pattern: CLAIM })
	const expectedSchemaTypes =
		entry.content_type === 'calculator' ? ['WebApplication', 'FAQPage'] : ['CollectionPage', 'ItemList']
	assertExactArray(payload.schema_types, expectedSchemaTypes, `${label}.schema_types`)
	validateGeneratedFrom(payload.generated_from, entry, label)
	assertDate(payload.generated_at, `${label}.generated_at`)
	if (entry.content_type === 'hub') validateHubContent(payload.content, payload, `${label}.content`)
	else if (entry.content_type === 'tools_hub') validateToolsHubContent(payload.content, `${label}.content`)
	else validateCalculatorContent(payload.content, entry, `${label}.content`)
	return payload
}

function validateManifestV1(files, sourceCommit) {
	const fileMap = new Map(files.map((file) => [file.path, file.bytes]))
	const manifestBytes = fileMap.get('manifest.json')
	if (!manifestBytes) fail('artifact tree must contain manifest.json')
	const manifest = parseJsonBytes(manifestBytes, 'artifact manifest')
	assertExactKeys(manifest, MANIFEST_KEYS, 'artifact manifest')
	if (manifest.schema_version !== 1) fail('artifact manifest schema_version must be 1')
	if (manifest.source_repository !== SOURCE_REPOSITORY) {
		fail(`artifact manifest source_repository must be ${SOURCE_REPOSITORY}`)
	}
	if (manifest.source_commit !== sourceCommit) fail('artifact manifest source_commit does not match the bundle')
	if (manifest.content_root !== 'split-content') fail('artifact manifest content_root must be split-content')
	if (
		!Array.isArray(manifest.locales) ||
		manifest.locales.length !== LOCALES.length ||
		manifest.locales.some((locale, index) => locale !== LOCALES[index])
	) {
		fail(`artifact manifest locales must be exactly ${LOCALES.join(', ')} in that order`)
	}
	if (!isPlainObject(manifest.input_sha256)) fail('artifact manifest input_sha256 must be an object')
	const inputPaths = Object.keys(manifest.input_sha256)
	const sortedInputPaths = [...inputPaths].sort()
	if (inputPaths.some((inputPath, index) => inputPath !== sortedInputPaths[index])) {
		fail('artifact manifest input_sha256 keys must be sorted')
	}
	for (const inputPath of inputPaths) {
		assertSafeRelativePath(inputPath, `input_sha256 key ${inputPath}`)
		if (
			(!inputPath.startsWith('split-content/_system/') && !inputPath.startsWith('split-content/product/')) ||
			inputPath.startsWith('split-content/_system/generated/')
		) {
			fail(`input_sha256 key is outside the source allowlist: ${inputPath}`)
		}
		assertSha256(manifest.input_sha256[inputPath], `input_sha256 for ${inputPath}`)
	}
	if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
		fail('artifact manifest entries must be a non-empty array')
	}

	const destinationPaths = []
	const publicPaths = []
	const usedInputs = []
	const matrix = new Map()
	const localeRank = new Map(LOCALES.map((locale, index) => [locale, index]))
	for (const [index, entry] of manifest.entries.entries()) {
		const label = `artifact manifest entries[${index}]`
		assertExactKeys(entry, ENTRY_KEYS, label)
		if (entry.content_type !== 'guide') fail(`${label}.content_type must be guide in schema v1`)
		if (typeof entry.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) {
			fail(`${label}.slug is invalid`)
		}
		if (!LOCALES.includes(entry.locale)) fail(`${label}.locale is unsupported`)
		const expectedPublicPath = `/${entry.locale}/split/guides/${entry.slug}`
		if (entry.public_path !== expectedPublicPath) fail(`${label}.public_path must be ${expectedPublicPath}`)
		const expectedOutputPath = `${PUBLISHED_PREFIX}guides/${entry.slug}/${entry.locale}.md`
		if (entry.output_path !== expectedOutputPath) fail(`${label}.output_path must be ${expectedOutputPath}`)
		assertSha256(entry.output_sha256, `${label}.output_sha256`)
		if (!Array.isArray(entry.source_input_paths) || entry.source_input_paths.length === 0) {
			fail(`${label}.source_input_paths must be a non-empty array`)
		}
		const entryInputs = new Set()
		for (const [inputIndex, inputPath] of entry.source_input_paths.entries()) {
			assertSafeRelativePath(inputPath, `${label}.source_input_paths[${inputIndex}]`)
			if (
				(!inputPath.startsWith('split-content/_system/') && !inputPath.startsWith('split-content/product/')) ||
				inputPath.startsWith('split-content/_system/generated/')
			) {
				fail(`${label}.source_input_paths is outside the source allowlist: ${inputPath}`)
			}
			if (entryInputs.has(inputPath)) fail(`${label}.source_input_paths contains a duplicate: ${inputPath}`)
			entryInputs.add(inputPath)
			usedInputs.push(inputPath)
		}

		const destinationPath = entry.output_path.slice(PUBLISHED_PREFIX.length)
		const outputBytes = fileMap.get(destinationPath)
		if (!outputBytes) fail(`artifact output is missing: ${destinationPath}`)
		const outputHash = sha256(outputBytes)
		if (outputHash !== entry.output_sha256) {
			fail(
				`artifact output SHA-256 mismatch for ${destinationPath}: expected ${entry.output_sha256}, got ${outputHash}`
			)
		}
		destinationPaths.push(destinationPath)
		publicPaths.push(entry.public_path)
		const matrixKey = `${entry.content_type}/${entry.slug}`
		matrix.set(matrixKey, [...(matrix.get(matrixKey) ?? []), entry.locale])
	}

	const expectedOrder = [...manifest.entries].sort(
		(left, right) =>
			compareAscii(left.slug, right.slug) || localeRank.get(left.locale) - localeRank.get(right.locale)
	)
	if (manifest.entries.some((entry, index) => entry !== expectedOrder[index])) {
		fail('artifact manifest entries must be sorted by slug and locale order')
	}
	for (const [key, locales] of matrix) {
		if (
			locales.length !== LOCALES.length ||
			LOCALES.some((locale) => locales.filter((item) => item === locale).length !== 1)
		) {
			fail(`schema v1 matrix for ${key} must contain exactly one ${LOCALES.join('/')} entry`)
		}
	}
	assertSameStringSet(publicPaths, publicPaths, 'public paths')
	assertSameStringSet(destinationPaths, destinationPaths, 'destination paths')
	assertSameStringSet([...new Set(usedInputs)], inputPaths, 'manifest source-input union')
	assertSameStringSet(
		files.map((file) => file.path),
		['manifest.json', ...destinationPaths],
		'artifact tree'
	)
	return manifest
}

function validateManifestV2(files, sourceCommit) {
	const fileMap = new Map(files.map((file) => [file.path, file.bytes]))
	const manifestBytes = fileMap.get('manifest.json')
	if (!manifestBytes) fail('artifact tree must contain manifest.json')
	const manifest = parseCanonicalJsonBytes(manifestBytes, 'artifact manifest')
	assertExactOrderedKeys(manifest, MANIFEST_KEYS, 'artifact manifest')
	if (manifest.schema_version !== 2) fail('artifact manifest schema_version must be 2')
	if (manifest.source_repository !== SOURCE_REPOSITORY) {
		fail(`artifact manifest source_repository must be ${SOURCE_REPOSITORY}`)
	}
	if (manifest.source_commit !== sourceCommit) fail('artifact manifest source_commit does not match the bundle')
	if (manifest.content_root !== 'split-content') fail('artifact manifest content_root must be split-content')
	assertExactArray(manifest.locales, LOCALES, 'artifact manifest locales')
	if (!isPlainObject(manifest.input_sha256)) fail('artifact manifest input_sha256 must be an object')
	const inputPaths = Object.keys(manifest.input_sha256)
	const sortedInputPaths = [...inputPaths].sort(compareAscii)
	if (inputPaths.some((inputPath, index) => inputPath !== sortedInputPaths[index])) {
		fail('artifact manifest input_sha256 keys must be sorted')
	}
	for (const inputPath of inputPaths) {
		assertSafeRelativePath(inputPath, `input_sha256 key ${inputPath}`)
		if (
			(!inputPath.startsWith('split-content/_system/') && !inputPath.startsWith('split-content/product/')) ||
			inputPath.startsWith('split-content/_system/generated/')
		) {
			fail(`input_sha256 key is outside the source allowlist: ${inputPath}`)
		}
		assertSha256(manifest.input_sha256[inputPath], `input_sha256 for ${inputPath}`)
	}
	if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
		fail('artifact manifest entries must be a non-empty array')
	}

	const destinationPaths = []
	const publicPaths = []
	const legacyPaths = []
	const usedInputs = []
	const groups = new Map()
	for (const [index, entry] of manifest.entries.entries()) {
		const label = `artifact manifest entries[${index}]`
		assertExactOrderedKeys(entry, V2_ENTRY_KEYS, label)
		if (!TYPE_RANK.has(entry.content_type)) fail(`${label}.content_type is unsupported in schema v2`)
		if (typeof entry.slug !== 'string' || !SLUG.test(entry.slug)) fail(`${label}.slug is invalid`)
		if (!LOCALES.includes(entry.locale)) fail(`${label}.locale is unsupported`)
		if (entry.content_type === 'hub' && entry.slug !== 'split') fail(`${label}.slug must be split for hub`)
		if (entry.content_type === 'tools_hub' && entry.slug !== 'tools') fail(`${label}.slug must be tools`)
		if (['tools_hub', 'calculator'].includes(entry.content_type) && entry.locale !== 'en') {
			fail(`${label}.${entry.content_type} must be English-only`)
		}

		const expected = expectedV2Paths(entry)
		if (entry.public_path !== expected.publicPath) fail(`${label}.public_path must be ${expected.publicPath}`)
		if (entry.output_path !== expected.outputPath) fail(`${label}.output_path must be ${expected.outputPath}`)
		assertPublicPath(entry.public_path, `${label}.public_path`)
		if (!Array.isArray(entry.legacy_paths)) fail(`${label}.legacy_paths must be an array`)
		const sortedLegacy = [...entry.legacy_paths].sort(compareAscii)
		if (
			entry.legacy_paths.some((legacyPath, legacyIndex) => legacyPath !== sortedLegacy[legacyIndex]) ||
			new Set(entry.legacy_paths).size !== entry.legacy_paths.length
		) {
			fail(`${label}.legacy_paths must be unique and sorted`)
		}
		entry.legacy_paths.forEach((legacyPath, legacyIndex) => {
			assertLegacyPath(legacyPath, `${label}.legacy_paths[${legacyIndex}]`)
			legacyPaths.push(legacyPath)
		})
		assertSha256(entry.output_sha256, `${label}.output_sha256`)
		if (!Array.isArray(entry.source_input_paths) || entry.source_input_paths.length === 0) {
			fail(`${label}.source_input_paths must be a non-empty array`)
		}
		const entryInputs = new Set()
		for (const [inputIndex, inputPath] of entry.source_input_paths.entries()) {
			assertSafeRelativePath(inputPath, `${label}.source_input_paths[${inputIndex}]`)
			if (
				(!inputPath.startsWith('split-content/_system/') && !inputPath.startsWith('split-content/product/')) ||
				inputPath.startsWith('split-content/_system/generated/')
			) {
				fail(`${label}.source_input_paths is outside the source allowlist: ${inputPath}`)
			}
			if (entryInputs.has(inputPath)) fail(`${label}.source_input_paths contains a duplicate: ${inputPath}`)
			entryInputs.add(inputPath)
			usedInputs.push(inputPath)
		}

		const destinationPath = entry.output_path.slice(PUBLISHED_PREFIX.length)
		const outputBytes = fileMap.get(destinationPath)
		if (!outputBytes) fail(`artifact output is missing: ${destinationPath}`)
		const outputHash = sha256(outputBytes)
		if (outputHash !== entry.output_sha256) {
			fail(
				`artifact output SHA-256 mismatch for ${destinationPath}: expected ${entry.output_sha256}, got ${outputHash}`
			)
		}
		if (entry.content_type === 'guide') {
			validateGuideGeneratedFrom(outputBytes, entry, `artifact output ${destinationPath}`)
		} else validateV2Payload(outputBytes, entry, manifest.entries, `artifact output ${destinationPath}`)
		destinationPaths.push(destinationPath)
		publicPaths.push(entry.public_path)
		const groupKey = `${entry.content_type}/${entry.slug}`
		groups.set(groupKey, [...(groups.get(groupKey) ?? []), entry.locale])
	}

	const expectedOrder = [...manifest.entries].sort(
		(left, right) =>
			TYPE_RANK.get(left.content_type) - TYPE_RANK.get(right.content_type) ||
			compareAscii(left.slug, right.slug) ||
			LOCALES.indexOf(left.locale) - LOCALES.indexOf(right.locale)
	)
	if (manifest.entries.some((entry, index) => entry !== expectedOrder[index])) {
		fail('artifact schema v2 entries must be sorted by type, slug, and locale order')
	}
	for (const [key, locales] of groups) {
		const [contentType] = key.split('/')
		if (new Set(locales).size !== locales.length) fail(`schema v2 matrix for ${key} contains a duplicate locale`)
		if (contentType === 'hub') assertExactArray(locales, LOCALES, `schema v2 matrix for ${key}`)
		if (contentType === 'tools_hub') assertExactArray(locales, ['en'], `schema v2 matrix for ${key}`)
		if (contentType === 'calculator') assertExactArray(locales, ['en'], `schema v2 matrix for ${key}`)
	}
	const structuredEntries = manifest.entries.filter((entry) => entry.content_type !== 'guide')
	if (structuredEntries.length > 0) {
		const hubs = structuredEntries.filter((entry) => entry.content_type === 'hub')
		const toolsHubs = structuredEntries.filter((entry) => entry.content_type === 'tools_hub')
		const calculators = structuredEntries.filter((entry) => entry.content_type === 'calculator')
		if (hubs.length !== LOCALES.length || toolsHubs.length !== 1) {
			fail('schema v2 structured pages must contain the complete three-hub and one-tools-hub cohort')
		}
		assertSameStringSet(
			calculators.map((entry) => entry.slug),
			CALCULATOR_SLUGS,
			'schema v2 calculator cohort'
		)
	}
	assertSameStringSet(publicPaths, publicPaths, 'public paths')
	assertSameStringSet(legacyPaths, legacyPaths, 'legacy paths')
	const publicPathSet = new Set(publicPaths)
	const conflictingLegacyPath = legacyPaths.find((legacyPath) => publicPathSet.has(legacyPath))
	if (conflictingLegacyPath) fail(`legacy path conflicts with a current public_path: ${conflictingLegacyPath}`)
	assertSameStringSet(destinationPaths, destinationPaths, 'destination paths')
	assertSameStringSet([...new Set(usedInputs)], inputPaths, 'manifest source-input union')
	assertSameStringSet(
		files.map((file) => file.path),
		['manifest.json', ...destinationPaths],
		'artifact tree'
	)
	return manifest
}

function validateManifest(files, sourceCommit) {
	const manifestBytes = files.find((file) => file.path === 'manifest.json')?.bytes
	if (!manifestBytes) fail('artifact tree must contain manifest.json')
	const raw = parseJsonBytes(manifestBytes, 'artifact manifest')
	if (raw?.schema_version === 1) return validateManifestV1(files, sourceCommit)
	if (raw?.schema_version === 2) return validateManifestV2(files, sourceCommit)
	fail('artifact manifest schema_version must be 1 or 2')
}

function manifestVersionIfPresent(files, label) {
	const bytes = files.find((file) => file.path === 'manifest.json')?.bytes
	if (!bytes) return undefined
	const manifest = parseJsonBytes(bytes, `${label} manifest`)
	if (![1, 2].includes(manifest?.schema_version)) fail(`${label} manifest schema_version must be 1 or 2`)
	return manifest.schema_version
}

function assertNoSchemaDowngrade(priorFiles, nextManifest, label) {
	const priorVersion = manifestVersionIfPresent(priorFiles, label)
	if (priorVersion === 2 && nextManifest.schema_version === 1) {
		fail('refusing to downgrade an installed schema v2 artifact to schema v1')
	}
}

export function loadPublisherLock(lockPath) {
	const lock = parseJsonBytes(readRegularFile(lockPath, 'publisher lock'), 'publisher lock')
	assertExactKeys(lock, LOCK_KEYS, 'publisher lock')
	if (lock.schema_version !== 1) fail('publisher lock schema_version must be 1')
	if (lock.source_repository !== SOURCE_REPOSITORY) fail(`source_repository must be ${SOURCE_REPOSITORY}`)
	if (lock.source_branch !== SOURCE_BRANCH) fail(`source_branch must be ${SOURCE_BRANCH}`)
	if (lock.mirror_script_path !== MIRROR_SCRIPT_PATH) fail(`mirror_script_path must be ${MIRROR_SCRIPT_PATH}`)
	if (!GIT_BLOB.test(lock.mirror_script_git_blob)) fail('mirror_script_git_blob must be a 40-character Git blob')
	assertSha256(lock.mirror_script_sha256, 'mirror_script_sha256')
	if (lock.destination_root !== DESTINATION_ROOT) fail(`destination_root must be ${DESTINATION_ROOT}`)
	if (lock.artifact_branch !== ARTIFACT_BRANCH) fail(`artifact_branch must be ${ARTIFACT_BRANCH}`)
	if (lock.ci_workflow !== CI_WORKFLOW) fail(`ci_workflow must be ${CI_WORKFLOW}`)
	return lock
}

export function verifyMirrorScript({ lockPath, mirrorScriptPath, mirrorScriptGitBlob }) {
	const lock = loadPublisherLock(lockPath)
	const bytes = readRegularFile(mirrorScriptPath, 'mono mirror script')
	if (mirrorScriptGitBlob !== lock.mirror_script_git_blob) {
		fail(`mono mirror script Git blob ${mirrorScriptGitBlob} does not match the reviewed pin`)
	}
	const actualSha256 = sha256(bytes)
	if (actualSha256 !== lock.mirror_script_sha256) {
		fail(`mono mirror script SHA-256 ${actualSha256} does not match the reviewed pin`)
	}
	return { mirrorScriptGitBlob, mirrorScriptSha256: actualSha256 }
}

function encodeBundleFile(file) {
	return {
		path: file.path,
		sha256: sha256(file.bytes),
		content_base64: file.bytes.toString('base64'),
	}
}

function decodeBundleFile(file, index) {
	const label = `bundle files[${index}]`
	assertExactKeys(file, BUNDLE_FILE_KEYS, label)
	assertSafeRelativePath(file.path, `${label}.path`)
	assertSha256(file.sha256, `${label}.sha256`)
	if (
		typeof file.content_base64 !== 'string' ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content_base64)
	) {
		fail(`${label}.content_base64 is not canonical base64`)
	}
	const bytes = Buffer.from(file.content_base64, 'base64')
	if (bytes.toString('base64') !== file.content_base64) fail(`${label}.content_base64 is not canonical base64`)
	const actualHash = sha256(bytes)
	if (actualHash !== file.sha256) fail(`${label} SHA-256 mismatch for ${file.path}`)
	return { path: file.path, bytes }
}

function validateBundle(bundle, lock) {
	assertExactKeys(bundle, BUNDLE_KEYS, 'publisher bundle')
	if (bundle.schema_version !== 1) fail('publisher bundle schema_version must be 1')
	if (bundle.source_repository !== lock.source_repository) fail('publisher bundle source_repository mismatch')
	assertCommit(bundle.source_commit, 'publisher bundle source_commit')
	assertCommit(bundle.target_base_commit, 'publisher bundle target_base_commit')
	if (bundle.destination_root !== lock.destination_root) fail('publisher bundle destination_root mismatch')
	assertSha256(bundle.prior_tree_sha256, 'publisher bundle prior_tree_sha256')
	assertSha256(bundle.tree_sha256, 'publisher bundle tree_sha256')
	if (!Array.isArray(bundle.files) || bundle.files.length === 0) fail('publisher bundle files must be non-empty')
	const files = bundle.files.map(decodeBundleFile)
	const paths = files.map((file) => file.path)
	if (paths.some((filePath, index) => index > 0 && compareAscii(paths[index - 1], filePath) >= 0)) {
		fail('publisher bundle files must be uniquely sorted by path')
	}
	const actualTreeHash = treeSha256(files)
	if (actualTreeHash !== bundle.tree_sha256) fail('publisher bundle tree_sha256 mismatch')
	const manifest = validateManifest(files, bundle.source_commit)
	return { files, manifest }
}

export function createPublisherBundle({
	lockPath,
	artifactRoot,
	priorArtifactRoot,
	bundlePath,
	sourceCommit,
	targetBaseCommit,
}) {
	const lock = loadPublisherLock(lockPath)
	assertCommit(sourceCommit, 'source commit')
	assertCommit(targetBaseCommit, 'target base commit')
	const files = walkRegularTree(artifactRoot)
	const manifest = validateManifest(files, sourceCommit)
	const priorFiles = walkRegularTree(priorArtifactRoot, { allowMissing: true, label: 'prior artifact tree' })
	assertNoSchemaDowngrade(priorFiles, manifest, 'prior artifact')
	const bundle = {
		schema_version: 1,
		source_repository: lock.source_repository,
		source_commit: sourceCommit,
		target_base_commit: targetBaseCommit,
		destination_root: lock.destination_root,
		prior_tree_sha256: treeSha256(priorFiles),
		tree_sha256: treeSha256(files),
		files: files.map(encodeBundleFile),
	}
	validateBundle(bundle, lock)
	fs.mkdirSync(path.dirname(path.resolve(bundlePath)), { recursive: true })
	try {
		fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
	} catch (error) {
		fail(
			`refusing to overwrite publisher bundle ${bundlePath}: ${error instanceof Error ? error.message : String(error)}`
		)
	}
	return {
		sourceCommit,
		targetBaseCommit,
		priorTreeSha256: bundle.prior_tree_sha256,
		treeSha256: bundle.tree_sha256,
		files: bundle.files.map((file) => file.path),
	}
}

function git(repoRoot, args, options = {}) {
	try {
		return execFileSync('git', ['-C', repoRoot, ...args], {
			encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
			maxBuffer: 32 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
	} catch (error) {
		const stderr = error?.stderr?.toString().trim()
		fail(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`)
	}
}

function assertRepoAtCommit(repoRoot, expectedCommit) {
	assertCommit(expectedCommit, 'expected target base commit')
	const realRepoRoot = fs.realpathSync(repoRoot)
	const topLevel = fs.realpathSync(git(repoRoot, ['rev-parse', '--show-toplevel']).trim())
	if (realRepoRoot !== topLevel) fail(`repo root is not the Git top level: ${repoRoot}`)
	const head = git(repoRoot, ['rev-parse', 'HEAD']).trim()
	if (head !== expectedCommit) fail(`target HEAD ${head} does not match pinned base ${expectedCommit}`)
	const dirty = git(repoRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { encoding: null })
	if (dirty.length !== 0) fail('target checkout must be completely clean before bundle installation')
}

function isWithin(parent, candidate) {
	const relative = path.relative(parent, candidate)
	return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function assertSafeDestination(repoRoot, destinationRoot) {
	assertSafeRelativePath(destinationRoot, 'destination root')
	const realRepoRoot = fs.realpathSync(repoRoot)
	const destination = path.resolve(realRepoRoot, ...destinationRoot.split('/'))
	if (!isWithin(realRepoRoot, destination) || destination === realRepoRoot)
		fail('destination root escapes the target repo')

	let current = realRepoRoot
	for (const segment of destinationRoot.split('/')) {
		current = path.join(current, segment)
		const stats = lstatIfPresent(current)
		if (!stats) continue
		if (stats.isSymbolicLink()) fail(`destination path contains a symlink: ${current}`)
		if (current !== destination && !stats.isDirectory()) fail(`destination parent is not a directory: ${current}`)
	}
	return destination
}

function materializeArtifact(root, files) {
	for (const file of files) {
		const target = path.join(root, ...file.path.split('/'))
		fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 })
		fs.writeFileSync(target, file.bytes, { flag: 'wx', mode: 0o644 })
	}
}

function replaceDestination(destination, files, sourceCommit) {
	const parent = path.dirname(destination)
	fs.mkdirSync(parent, { recursive: true, mode: 0o755 })
	const staged = fs.mkdtempSync(path.join(parent, '.split-content-next-'))
	let backup
	try {
		materializeArtifact(staged, files)
		validateManifest(walkRegularTree(staged), sourceCommit)
		if (lstatIfPresent(destination)) {
			backup = path.join(parent, `.split-content-old-${crypto.randomBytes(12).toString('hex')}`)
			fs.renameSync(destination, backup)
		}
		try {
			fs.renameSync(staged, destination)
		} catch (error) {
			if (backup && lstatIfPresent(backup) && !lstatIfPresent(destination)) fs.renameSync(backup, destination)
			throw error
		}
		if (backup) fs.rmSync(backup, { recursive: true, force: true })
	} finally {
		if (lstatIfPresent(staged)) fs.rmSync(staged, { recursive: true, force: true })
	}
}

function readBundle(bundlePath, lock) {
	const bundle = parseJsonBytes(readRegularFile(bundlePath, 'publisher bundle'), 'publisher bundle')
	const { files, manifest } = validateBundle(bundle, lock)
	return { bundle, files, manifest }
}

function validateBaseModes(repoRoot, targetBaseCommit, destinationRoot) {
	const tree = git(repoRoot, ['ls-tree', '-r', '-z', targetBaseCommit, '--', destinationRoot], { encoding: null })
	for (const record of tree.toString('utf8').split('\0').filter(Boolean)) {
		const separator = record.indexOf('\t')
		if (separator === -1) fail('target base contains an unparsable generated artifact entry')
		const [mode, type] = record.slice(0, separator).split(' ')
		const relativePath = record.slice(separator + 1)
		if (mode !== '100644' || type !== 'blob') {
			fail(`target base generated artifact must contain only 100644 blobs: ${relativePath}`)
		}
	}
}

export function assertPublisherDiff({ lockPath, repoRoot, targetBaseCommit }) {
	const lock = loadPublisherLock(lockPath)
	assertCommit(targetBaseCommit, 'target base commit')
	const head = git(repoRoot, ['rev-parse', 'HEAD']).trim()
	if (head !== targetBaseCommit) fail(`target HEAD ${head} does not match pinned base ${targetBaseCommit}`)
	validateBaseModes(repoRoot, targetBaseCommit, lock.destination_root)

	const raw = git(
		repoRoot,
		['-c', 'status.renames=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=no'],
		{ encoding: null }
	)
	const records = raw.toString('utf8').split('\0').filter(Boolean)
	const changedPaths = []
	for (const record of records) {
		if (record.length < 4 || record[2] !== ' ') fail('target status contains an unparsable entry')
		const status = record.slice(0, 2)
		const relativePath = record.slice(3)
		assertSafeRelativePath(relativePath, 'changed target path')
		if (!relativePath.startsWith(`${lock.destination_root}/`)) {
			fail(`publisher produced an unexpected target diff: ${relativePath}`)
		}
		if (
			/[^ MAD?]/.test(status) ||
			status.includes('U') ||
			status.includes('R') ||
			status.includes('C') ||
			status.includes('T')
		) {
			fail(`publisher produced an unsupported Git status ${status} for ${relativePath}`)
		}
		changedPaths.push(relativePath)
	}
	if (changedPaths.length === 0) return { changed: false, changedPaths: [] }

	const destination = assertSafeDestination(repoRoot, lock.destination_root)
	const files = walkRegularTree(destination)
	const manifestBytes = files.find((file) => file.path === 'manifest.json')?.bytes
	if (!manifestBytes) fail('changed artifact tree has no manifest.json')
	const manifest = parseJsonBytes(manifestBytes, 'changed artifact manifest')
	assertCommit(manifest.source_commit, 'changed artifact source_commit')
	validateManifest(files, manifest.source_commit)
	return {
		changed: true,
		changedPaths: changedPaths.sort(),
		sourceCommit: manifest.source_commit,
		treeSha256: treeSha256(files),
	}
}

export function installPublisherBundle({
	lockPath,
	bundlePath,
	repoRoot,
	targetBaseCommit,
	sourceCommit,
	treeSha256: expectedTreeSha256,
}) {
	const lock = loadPublisherLock(lockPath)
	const { bundle, files, manifest } = readBundle(bundlePath, lock)
	if (targetBaseCommit !== bundle.target_base_commit)
		fail('requested target base does not match the publisher bundle')
	assertCommit(sourceCommit, 'expected source commit')
	assertSha256(expectedTreeSha256, 'expected artifact tree SHA-256')
	if (sourceCommit !== bundle.source_commit) fail('expected source commit does not match the publisher bundle')
	if (expectedTreeSha256 !== bundle.tree_sha256)
		fail('expected artifact tree SHA-256 does not match the publisher bundle')
	assertRepoAtCommit(repoRoot, targetBaseCommit)
	const destination = assertSafeDestination(repoRoot, lock.destination_root)
	const priorFiles = walkRegularTree(destination, { allowMissing: true, label: 'current generated artifact tree' })
	assertNoSchemaDowngrade(priorFiles, manifest, 'current generated artifact')
	const actualPriorHash = treeSha256(priorFiles)
	if (actualPriorHash !== bundle.prior_tree_sha256) {
		fail(
			`current generated artifact tree ${actualPriorHash} does not match pinned prior tree ${bundle.prior_tree_sha256}`
		)
	}
	replaceDestination(destination, files, bundle.source_commit)
	const diff = assertPublisherDiff({ lockPath, repoRoot, targetBaseCommit })
	if (!diff.changed) fail('bundle claimed a publication but installed no target diff')
	if (diff.treeSha256 !== bundle.tree_sha256)
		fail('installed generated artifact tree differs from the publisher bundle')
	return {
		sourceCommit: bundle.source_commit,
		targetBaseCommit,
		treeSha256: bundle.tree_sha256,
		changedPaths: diff.changedPaths,
	}
}

function parseFlags(args, allowed, required = allowed) {
	if (args.length % 2 !== 0) fail(`invalid argument list near ${args.at(-1) ?? '<end>'}`)
	const values = new Map()
	for (let index = 0; index < args.length; index += 2) {
		const flag = args[index]
		const value = args[index + 1]
		if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) {
			fail(`invalid argument list near ${flag ?? '<end>'}`)
		}
		if (!allowed.includes(flag)) fail(`unknown argument: ${flag}`)
		if (values.has(flag)) fail(`duplicate argument: ${flag}`)
		values.set(flag, value)
	}
	for (const flag of required) if (!values.has(flag)) fail(`missing required argument: ${flag}`)
	return values
}

function runCli(argv) {
	const [command, ...args] = argv
	if (command === 'verify-lock') {
		const flags = parseFlags(args, ['--lock', '--mirror-script', '--mirror-blob'])
		return verifyMirrorScript({
			lockPath: flags.get('--lock'),
			mirrorScriptPath: flags.get('--mirror-script'),
			mirrorScriptGitBlob: flags.get('--mirror-blob'),
		})
	}
	if (command === 'pack') {
		const flags = parseFlags(args, [
			'--lock',
			'--artifact-root',
			'--prior-artifact-root',
			'--bundle',
			'--source-commit',
			'--target-base-commit',
		])
		return createPublisherBundle({
			lockPath: flags.get('--lock'),
			artifactRoot: flags.get('--artifact-root'),
			priorArtifactRoot: flags.get('--prior-artifact-root'),
			bundlePath: flags.get('--bundle'),
			sourceCommit: flags.get('--source-commit'),
			targetBaseCommit: flags.get('--target-base-commit'),
		})
	}
	if (command === 'install') {
		const flags = parseFlags(args, [
			'--lock',
			'--bundle',
			'--repo-root',
			'--target-base-commit',
			'--source-commit',
			'--tree-sha256',
		])
		return installPublisherBundle({
			lockPath: flags.get('--lock'),
			bundlePath: flags.get('--bundle'),
			repoRoot: flags.get('--repo-root'),
			targetBaseCommit: flags.get('--target-base-commit'),
			sourceCommit: flags.get('--source-commit'),
			treeSha256: flags.get('--tree-sha256'),
		})
	}
	if (command === 'assert-diff') {
		const flags = parseFlags(args, ['--lock', '--repo-root', '--target-base-commit'])
		return assertPublisherDiff({
			lockPath: flags.get('--lock'),
			repoRoot: flags.get('--repo-root'),
			targetBaseCommit: flags.get('--target-base-commit'),
		})
	}
	fail(`unknown command: ${command ?? '<none>'}`)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
	try {
		const result = runCli(process.argv.slice(2))
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		process.stderr.write(`split-content publisher failed: ${message}\n`)
		process.exitCode = 1
	}
}
