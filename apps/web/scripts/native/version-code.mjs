#!/usr/bin/env node
/**
 * Prints the native build number: whole minutes since 2026-01-01T00:00Z (ARCHITECTURE 11).
 *
 * iOS CURRENT_PROJECT_VERSION and Android versionCode use the same number, so one build is one
 * number on both stores. It grows with every run and stays under Android's 2,100,000,000 limit
 * for about 4,000 years. The version gate compares it with minBuild in public/app-config.json.
 */

import { pathToFileURL } from 'node:url'

const EPOCH_MS = Date.UTC(2026, 0, 1)

/** Whole minutes between 2026-01-01T00:00Z and `now` (milliseconds since the Unix epoch). */
export function versionCode(now = Date.now()) {
    return Math.floor((now - EPOCH_MS) / 60_000)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(versionCode())
}
