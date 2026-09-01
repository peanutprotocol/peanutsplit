#!/usr/bin/env node
/**
 * Emit THIRD_PARTY_LICENSES.md — the dependency notice bundle the AGPL release needs.
 *
 * Two lockfiles, because `apps/web` sits outside the pnpm workspace on purpose: the root answers
 * for the repo and `apps/api`, and `apps/web` has to be asked separately with `--ignore-workspace`
 * or pnpm walks up and answers for the workspace a second time.
 *
 *     pnpm licenses:generate    # write the file
 *     pnpm licenses:check       # fail if it is stale
 *
 * This is a notice bundle, not a CycloneDX SBOM. It records what every installed package is
 * licensed under, which is what THIRD_PARTY_NOTICES.md promises a recipient.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'THIRD_PARTY_LICENSES.md')

/** Corepack first: a bare `pnpm` on PATH is often an older major that rejects this workspace file
 *  outright, and it fails with an exit code rather than ENOENT, so trying it first hides the good
 *  one behind a confusing error. Fall through on any failure, and report the last one. */
const pnpm = (cwd, args) => {
	let last
	for (const [file, prefix] of [
		['corepack', ['pnpm']],
		['pnpm', []],
	]) {
		try {
			return execFileSync(file, [...prefix, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
		} catch (error) {
			last = error
		}
	}
	throw new Error(`could not run \`pnpm ${args.join(' ')}\` in ${cwd}: ${last?.message ?? 'unknown error'}`)
}

const collect = (cwd, extraArgs) => JSON.parse(pnpm(cwd, ['licenses', 'list', '--json', ...extraArgs]))

/** One `name@version -> license` map, so a dependency shared by both trees is listed once. */
const merge = (...trees) => {
	const packages = new Map()
	for (const tree of trees) {
		for (const [license, entries] of Object.entries(tree)) {
			for (const entry of entries) {
				for (const version of entry.versions ?? []) packages.set(`${entry.name}@${version}`, license)
			}
		}
	}
	return packages
}

const render = (packages) => {
	const byLicense = new Map()
	for (const [id, license] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
		if (!byLicense.has(license)) byLicense.set(license, [])
		byLicense.get(license).push(id)
	}
	const licenses = [...byLicense.keys()].sort()
	const lines = [
		'# Third-party licenses',
		'',
		'**Generated — do not edit.** Run `pnpm licenses:generate` after any lockfile change.',
		'',
		'Every installed dependency of Peanut Split and the license it ships under, across both',
		'lockfiles. Prose notices for the material that needs one — fonts, icon geometry, quoted',
		'competitor copy — are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).',
		'',
		`${packages.size} packages, ${licenses.length} license classes.`,
		'',
		'| License | Packages |',
		'| --- | ---: |',
		...licenses.map((l) => `| \`${l}\` | ${byLicense.get(l).length} |`),
		'',
	]
	for (const license of licenses) {
		lines.push(`## ${license}`, '')
		for (const id of byLicense.get(license)) lines.push(`- \`${id}\``)
		lines.push('')
	}
	return `${lines.join('\n')}`
}

const body = render(merge(collect(ROOT, []), collect(path.join(ROOT, 'apps', 'web'), ['--ignore-workspace'])))

if (process.argv.includes('--check')) {
	if (readFileSync(OUT, 'utf8') !== body) {
		console.error('THIRD_PARTY_LICENSES.md is stale. Run `pnpm licenses:generate`.')
		process.exit(1)
	}
	console.log('Third-party license inventory is current')
} else {
	writeFileSync(OUT, body)
	console.log(`Wrote ${path.relative(ROOT, OUT)}`)
}
