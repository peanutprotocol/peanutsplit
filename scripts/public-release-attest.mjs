#!/usr/bin/env node
import { resolve } from 'node:path'
import { attestCandidate } from './public-release-lib.mjs'

function parseArgs(argv) {
	const options = {
		candidateDir: null,
		sourceRoot: resolve(import.meta.dirname, '..'),
		ledgerPath: null,
		outPath: null,
		verifiedBy: null,
		json: false,
	}
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]
		if (argument === '--') continue
		if (argument === '--help' || argument === '-h') return { help: true }
		if (argument === '--json') options.json = true
		else if (['--candidate', '--source-root', '--ledger', '--out', '--verified-by'].includes(argument)) {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
			index += 1
			if (argument === '--candidate') options.candidateDir = resolve(value)
			else if (argument === '--source-root') options.sourceRoot = resolve(value)
			else if (argument === '--ledger') options.ledgerPath = resolve(value)
			else if (argument === '--out') options.outPath = resolve(value)
			else options.verifiedBy = value
		} else throw new Error(`unknown argument: ${argument}`)
	}
	return options
}

try {
	const options = parseArgs(process.argv.slice(2))
	if (options.help) {
		console.log(
			'Usage: node scripts/public-release-attest.mjs --candidate PATH --ledger FILE --out FILE --verified-by PRINCIPAL [--source-root PATH] [--json]'
		)
		process.exit(0)
	}
	if (!options.candidateDir) throw new Error('--candidate is required')
	const result = attestCandidate(options)
	if (options.json) console.log(JSON.stringify(result, null, 2))
	else {
		console.log(
			`Clean-candidate build attestation written to ${result.output}\n` +
				`Private origin: ${result.private_origin_commit}\nAttestation SHA-256: ${result.sha256}`
		)
	}
} catch (error) {
	console.error(error.message)
	process.exit(1)
}
