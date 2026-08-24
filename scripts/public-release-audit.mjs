#!/usr/bin/env node
import { resolve } from 'node:path'
import { auditCandidate } from './public-release-lib.mjs'

function parseArgs(argv) {
	let candidate = null
	let sourceRoot = resolve(import.meta.dirname, '..')
	let ledgerPath = null
	let clearancePath = null
	let buildAttestationPath = null
	let json = false
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]
		if (argument === '--') continue
		if (argument === '--help' || argument === '-h') return { help: true }
		if (argument === '--json') json = true
		else if (
			['--candidate', '--source-root', '--ledger', '--clearance', '--build-attestation'].includes(argument)
		) {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`)
			if (argument === '--candidate') candidate = resolve(value)
			else if (argument === '--source-root') sourceRoot = resolve(value)
			else if (argument === '--ledger') ledgerPath = resolve(value)
			else if (argument === '--clearance') clearancePath = resolve(value)
			else buildAttestationPath = resolve(value)
			index += 1
		} else throw new Error(`unknown argument: ${argument}`)
	}
	return { candidate, sourceRoot, ledgerPath, clearancePath, buildAttestationPath, json }
}

try {
	const options = parseArgs(process.argv.slice(2))
	if (options.help) {
		console.log(
			'Usage: node scripts/public-release-audit.mjs --candidate PATH --ledger FILE [--source-root PATH] [--clearance FILE] [--build-attestation FILE] [--json]'
		)
		process.exit(0)
	}
	if (!options.candidate) throw new Error('--candidate is required')
	const result = auditCandidate(options.candidate, {
		sourceRoot: options.sourceRoot,
		ledgerPath: options.ledgerPath,
		clearancePath: options.clearancePath,
		buildAttestationPath: options.buildAttestationPath,
	})
	if (options.json) console.log(JSON.stringify(result, null, 2))
	else {
		console.log(
			`Public-release candidate audit clean: ${result.mode}, ${result.files} files, private origin ${result.private_origin_commit}\n` +
				`Private ledger SHA-256: ${result.ledger_sha256}`
		)
	}
} catch (error) {
	console.error(error.message)
	process.exit(1)
}
