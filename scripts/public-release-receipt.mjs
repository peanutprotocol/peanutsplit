#!/usr/bin/env node
import { resolve } from 'node:path'
import { createReleaseReceipt } from './public-release-lib.mjs'

function parseArgs(argv) {
	const options = {
		candidateDir: null,
		sourceRoot: resolve(import.meta.dirname, '..'),
		ledgerPath: null,
		clearancePath: null,
		buildAttestationPath: null,
		publicCheckout: null,
		buildCommit: null,
		archiveOutPath: null,
		archiveUrl: null,
		outPath: null,
		json: false,
	}
	const mappings = {
		'--candidate': 'candidateDir',
		'--source-root': 'sourceRoot',
		'--ledger': 'ledgerPath',
		'--clearance': 'clearancePath',
		'--build-attestation': 'buildAttestationPath',
		'--public-checkout': 'publicCheckout',
		'--build-commit': 'buildCommit',
		'--archive-out': 'archiveOutPath',
		'--archive-url': 'archiveUrl',
		'--out': 'outPath',
	}
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]
		if (argument === '--') continue
		if (argument === '--help' || argument === '-h') return { help: true }
		if (argument === '--json') options.json = true
		else if (mappings[argument]) {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
			index += 1
			options[mappings[argument]] = [
				'candidateDir',
				'sourceRoot',
				'ledgerPath',
				'clearancePath',
				'buildAttestationPath',
				'publicCheckout',
				'archiveOutPath',
				'outPath',
			].includes(mappings[argument])
				? resolve(value)
				: value
		} else throw new Error(`unknown argument: ${argument}`)
	}
	return options
}

try {
	const options = parseArgs(process.argv.slice(2))
	if (options.help) {
		console.log(
			'Usage: node scripts/public-release-receipt.mjs --candidate PATH --ledger FILE --clearance FILE --build-attestation FILE --public-checkout PATH --build-commit 40_HEX --archive-out FILE --archive-url HTTPS_URL --out FILE [--source-root PATH] [--json]'
		)
		process.exit(0)
	}
	const result = createReleaseReceipt(options)
	if (options.json) console.log(JSON.stringify(result, null, 2))
	else {
		console.log(
			`External release receipt written to ${result.output}\n` +
				`Receipt SHA-256: ${result.sha256}\nThis command did not publish, deploy, or open the FOSS flag.`
		)
	}
} catch (error) {
	console.error(error.message)
	process.exit(1)
}
