#!/usr/bin/env node
/**
 * Changes the app's bundle ID / package name and the Apple Team ID everywhere they are written,
 * in one command (PLAN 4.5). Use it once, before the first signed build: the bundle ID can never
 * change after release.
 *
 *   node scripts/native/set-identifiers.mjs --app-id com.peanutsplit.app --team PW388G893L [--dry-run]
 *
 * The current values are read from capacitor.config.ts (appId) and the App target's Release
 * configuration (DEVELOPMENT_TEAM). The Android `namespace` (the Java package of MainActivity)
 * stays as it is: only the applicationId is the Play package name.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const option = (name) => {
    const index = args.indexOf(name)
    return index === -1 ? null : args[index + 1]
}
const appId = option('--app-id')
const team = option('--team')
const dryRun = args.includes('--dry-run')

function fail(message) {
    console.error(message)
    process.exit(1)
}

// Android package names allow no hyphens; each segment starts with a letter.
if (!appId || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(appId)) {
    fail(
        'usage: set-identifiers.mjs --app-id <reverse.dns.id> --team <TEAMID> [--dry-run]\n--app-id must look like com.example.app'
    )
}
if (!team || !/^[A-Z0-9]{10}$/.test(team)) fail('--team must be a 10-character Apple Team ID (A-Z, 0-9)')

const FILES = {
    config: 'capacitor.config.ts',
    pbxproj: 'ios/App/App.xcodeproj/project.pbxproj',
    gradle: 'android/app/build.gradle',
    strings: 'android/app/src/main/res/values/strings.xml',
    aasa: 'public/.well-known/apple-app-site-association',
    assetlinks: 'public/.well-known/assetlinks.json',
    appConfig: 'public/app-config.json',
}
const read = (file) => readFileSync(path.join(root, file), 'utf8')

const currentAppId = read(FILES.config).match(/appId: '([^']+)'/)?.[1]
const releaseConfig = read(FILES.pbxproj).match(
    /\/\* Release \*\/ = \{\s*isa = XCBuildConfiguration;\s*buildSettings = \{[^}]*?INFOPLIST_FILE[^}]*?\};/
)?.[0]
const currentTeam = releaseConfig?.match(/DEVELOPMENT_TEAM = (\w+);/)?.[1]
if (!currentAppId) fail(`could not read appId from ${FILES.config}`)
if (!currentTeam) fail(`could not read DEVELOPMENT_TEAM from the App Release configuration in ${FILES.pbxproj}`)

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Each edit: a pattern that must match at least once, and what replaces each match. */
const EDITS = {
    [FILES.config]: [[new RegExp(`appId: '${escape(currentAppId)}'`, 'g'), `appId: '${appId}'`]],
    [FILES.pbxproj]: [
        [
            new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${escape(currentAppId)};`, 'g'),
            `PRODUCT_BUNDLE_IDENTIFIER = ${appId};`,
        ],
        [new RegExp(`DEVELOPMENT_TEAM = ${escape(currentTeam)};`, 'g'), `DEVELOPMENT_TEAM = ${team};`],
    ],
    [FILES.gradle]: [[new RegExp(`applicationId "${escape(currentAppId)}"`, 'g'), `applicationId "${appId}"`]],
    [FILES.strings]: [[new RegExp(`>${escape(currentAppId)}<`, 'g'), `>${appId}<`]],
    [FILES.aasa]: [[new RegExp(`"${escape(currentTeam)}\\.${escape(currentAppId)}"`, 'g'), `"${team}.${appId}"`]],
    [FILES.assetlinks]: [[new RegExp(`"package_name": "${escape(currentAppId)}"`, 'g'), `"package_name": "${appId}"`]],
    [FILES.appConfig]: [[new RegExp(`details\\?id=${escape(currentAppId)}"`, 'g'), `details?id=${appId}"`]],
}

const changes = []
for (const [file, edits] of Object.entries(EDITS)) {
    let text = read(file)
    const before = text
    for (const [pattern, replacement] of edits) {
        const count = text.match(pattern)?.length ?? 0
        if (count === 0) fail(`${file}: expected ${pattern} and found none; nothing was written`)
        text = text.replace(pattern, replacement)
        changes.push(`${file}: ${count} x ${pattern.source.replace(/\\/g, '')} -> ${replacement}`)
    }
    if (text !== before) EDITS[file].result = text
}

console.log(`${dryRun ? 'Would change' : 'Changing'} ${currentAppId} -> ${appId}, team ${currentTeam} -> ${team}:`)
for (const line of changes) console.log(`  ${line}`)

if (dryRun) {
    console.log('Dry run: no file written.')
} else {
    for (const [file, edits] of Object.entries(EDITS)) {
        if (edits.result !== undefined) writeFileSync(path.join(root, file), edits.result)
    }
    console.log(
        'Done. Also update SPLIT_APNS_BUNDLE_ID and SPLIT_APNS_TEAM_ID on the server, and the App Store and Play records.'
    )
}
