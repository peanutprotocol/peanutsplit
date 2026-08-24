import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import ts from 'typescript'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function generatedHeader(source, hash) {
	return [
		'<!-- GENERATED FILE. Run `pnpm docs:generate`; do not hand-edit. -->',
		'',
		`Source: \`${source}\`  `,
		`Input SHA-256: \`${hash}\``,
		'',
	].join('\n')
}

function prismaInventory() {
	const source = 'apps/web/prisma/schema.prisma'
	const text = readFileSync(join(repositoryRoot, source), 'utf8')
	const enumMatch = text.match(/enum\s+SplitMode\s*\{([\s\S]*?)\n\}/)
	const splitModes = enumMatch
		? enumMatch[1]
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith('@@'))
		: []

	const models = [...text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((match) => {
		const fields = match[2]
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('//') && !line.startsWith('///') && !line.startsWith('@@'))
			.map((line) => {
				const [name, type, ...attributes] = line.split(/\s+/)
				return { name, type, attributes: attributes.join(' ') || '—' }
			})
		return { name: match[1], fields }
	})

	const body = [
		'# Generated data-model inventory',
		'',
		generatedHeader(source, sha256(text)),
		`PostgreSQL namespace: \`split\`  `,
		`Models: ${models.length}  `,
		`Split modes: ${splitModes.map((mode) => `\`${mode}\``).join(', ')}`,
		'',
		...models.flatMap((model) => [
			`## ${model.name}`,
			'',
			'| Field | Prisma type | Attributes |',
			'| --- | --- | --- |',
			...model.fields.map(
				(field) => `| \`${field.name}\` | \`${field.type}\` | ${field.attributes.replaceAll('|', '\\|')} |`
			),
			'',
		]),
	].join('\n')

	return `${body.trim()}\n`
}

function routeFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) return routeFiles(path)
		return entry.name === 'route.ts' ? [path] : []
	})
}

function exportedHttpMethods(text, source) {
	const sourceFile = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	if (sourceFile.parseDiagnostics.length) {
		const detail = sourceFile.parseDiagnostics
			.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
			.join('; ')
		throw new Error(`Cannot parse ${source}: ${detail}`)
	}

	const methods = []
	const exported = (node) =>
		(ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(
			(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
		) ?? false
	const add = (name) => {
		if (HTTP_METHODS.has(name)) methods.push(name)
	}

	for (const statement of sourceFile.statements) {
		if (ts.isFunctionDeclaration(statement) && exported(statement) && statement.name) {
			add(statement.name.text)
			continue
		}
		if (ts.isVariableStatement(statement) && exported(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (ts.isIdentifier(declaration.name)) add(declaration.name.text)
			}
			continue
		}
		if (
			ts.isExportDeclaration(statement) &&
			!statement.isTypeOnly &&
			statement.exportClause &&
			ts.isNamedExports(statement.exportClause)
		) {
			for (const element of statement.exportClause.elements) add(element.name.text)
		}
	}

	if (!methods.length) throw new Error(`${source} exports no HTTP method`)
	if (new Set(methods).size !== methods.length) throw new Error(`${source} exports a duplicate HTTP method`)
	return methods
}

function routeInventory() {
	const sourceRoot = join(repositoryRoot, 'apps/web/src/app')
	const files = routeFiles(sourceRoot).sort()
	const routes = files
		.flatMap((file) => {
			const text = readFileSync(file, 'utf8')
			const source = relative(repositoryRoot, file).split(sep).join('/')
			const routePath = relative(join(repositoryRoot, 'apps/web/src/app'), file)
				.split(sep)
				.join('/')
				.replace(/(^|\/)\([^/]+\)(?=\/|$)/g, '')
				.replace(/^\/+/, '')
				.replace(/\/route\.ts$/, '')
				.replaceAll('[', ':')
				.replaceAll(']', '')
			const path = `/${routePath}`
			const methods = exportedHttpMethods(text, source)
			return methods.map((method) => ({ method, path, source }))
		})
		.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method))

	const inputs = files
		.map((file) => `${relative(repositoryRoot, file).split(sep).join('/')}\0${readFileSync(file, 'utf8')}`)
		.join('\0')

	return `${[
		'# Generated HTTP route inventory',
		'',
		generatedHeader('apps/web/src/app/**/route.ts', sha256(inputs)),
		`Exported operations: ${routes.length}`,
		'',
		'| Method | Path | Handler |',
		'| --- | --- | --- |',
		...routes.map((route) => `| \`${route.method}\` | \`${route.path}\` | \`${route.source}\` |`),
		'',
		'This inventory proves exported verbs and paths only. Read `../API.md` and the handler source for trust,',
		'validation, status, rate-limit, idempotency, retention, and feature-gate semantics.',
	]
		.join('\n')
		.trim()}\n`
}

const rawOutputs = new Map([
	['docs/current/generated/DATA-MODEL-INVENTORY.md', prismaInventory()],
	['docs/current/generated/API-ROUTES.md', routeInventory()],
])

const outputs = new Map(
	await Promise.all(
		[...rawOutputs].map(async ([localPath, content]) => {
			const target = join(repositoryRoot, localPath)
			const config = (await resolveConfig(target)) ?? {}
			return [localPath, await format(content, { ...config, filepath: target })]
		})
	)
)

let failed = false
for (const [localPath, expected] of outputs) {
	const target = join(repositoryRoot, localPath)
	if (checkOnly) {
		const actual = existsSync(target) ? readFileSync(target, 'utf8') : null
		if (actual !== expected) {
			console.error(`${localPath} is stale or missing; run pnpm docs:generate`)
			failed = true
		}
		continue
	}

	mkdirSync(dirname(target), { recursive: true })
	writeFileSync(target, expected)
	console.log(`generated ${localPath}`)
}

if (failed) process.exit(1)
if (checkOnly) console.log('Generated reference docs are current')
