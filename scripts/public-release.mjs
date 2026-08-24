#!/usr/bin/env node
import { resolve } from 'node:path'
import { buildCandidate } from './public-release-lib.mjs'

function usage() {
	return `Usage: node scripts/public-release.mjs [--draft|--release] [--dry-run] [--out PATH] [--ledger-out FILE] [--root PATH] [--clearance FILE] [--build-attestation FILE] [--json]

Builds a local history-free apps/web candidate. It never initializes Git or publishes anything.`
}

function parseArgs(argv) {
	const options = {
		root: resolve(import.meta.dirname, '..'),
		outDir: null,
		ledgerOutPath: null,
		mode: 'draft',
		dryRun: false,
		json: false,
		clearancePath: null,
		buildAttestationPath: null,
	}
	let selectedMode = false
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]
		if (argument === '--') continue
		if (argument === '--help' || argument === '-h') return { help: true }
		if (argument === '--draft' || argument === '--release') {
			if (selectedMode) throw new Error('choose exactly one of --draft or --release')
			selectedMode = true
			options.mode = argument === '--release' ? 'release' : 'draft'
		} else if (argument === '--dry-run') options.dryRun = true
		else if (argument === '--json') options.json = true
		else if (['--out', '--ledger-out', '--root', '--clearance', '--build-attestation'].includes(argument)) {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`)
			index += 1
			if (argument === '--out') options.outDir = resolve(value)
			else if (argument === '--ledger-out') options.ledgerOutPath = resolve(value)
			else if (argument === '--root') options.root = resolve(value)
			else if (argument === '--clearance') options.clearancePath = resolve(value)
			else options.buildAttestationPath = resolve(value)
		} else throw new Error(`unknown argument: ${argument}`)
	}
	return options
}

try {
	const options = parseArgs(process.argv.slice(2))
	if (options.help) {
		console.log(usage())
		process.exit(0)
	}
	const result = buildCandidate(options)
	if (options.json) console.log(JSON.stringify(result, null, 2))
	else if (result.dry_run) {
		console.log(
			`Public-release ${result.mode} dry-run: ${result.files} files from private origin ${result.private_origin_commit}; ` +
				`source ${result.source_dirty ? 'is dirty' : 'is clean'}; pending gates: ${result.pending_gates.join(', ') || 'none'}`
		)
	} else {
		console.log(
			`Public-release ${result.mode} candidate built and audited: ${result.files} files at ${result.output}\n` +
				`Private ledger: ${result.private_ledger}\nLedger SHA-256: ${result.ledger_sha256}\nNo Git repository or remote was created.`
		)
	}
} catch (error) {
	console.error(error.message)
	process.exit(1)
}
