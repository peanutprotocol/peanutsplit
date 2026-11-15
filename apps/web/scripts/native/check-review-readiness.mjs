#!/usr/bin/env node
/**
 * Checks that production is ready for store review of the apps (PLAN 8.2 K5, ARCHITECTURE 14.4).
 *
 *   node scripts/native/check-review-readiness.mjs [room-slug]
 *
 * Each check prints one line and the script exits 1 when any check fails. It sends only read
 * requests (OPTIONS and GET) to https://peanutsplit.com. The release workflow runs it as a
 * warning; before submitting, a human runs it and every line must say ok.
 *
 * - CORS: the app's origins get a preflight answer, or every API call from the app fails.
 * - apple-app-site-association: iOS opens room links in the app only when this file answers
 *   200 application/json with no redirect and names the app as TEAMID.bundleID.
 * - assetlinks.json: Android verifies App Links against the signing key fingerprints. The repo
 *   ships a placeholder until the Play App Signing key exists (HANDOFF step 9).
 * - Receipt scan: the reviewer must see the scan button. The answer of the receipt-parse GET is
 *   the same for every room, so any valid slug works; the default is the test slug.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = 'https://peanutsplit.com'
const APP_ORIGINS = ['capacitor://localhost', 'https://localhost']
const TIMEOUT_MS = 15_000
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const slug = process.argv[2] ?? 'ski-trip-kunc-syrup-drum'

/** The bundle ID and the Release team, read from the same files set-identifiers.mjs edits. */
function appIdentity() {
    const appId = readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8').match(/appId: '([^']+)'/)?.[1]
    const releaseConfig = readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8').match(
        /\/\* Release \*\/ = \{\s*isa = XCBuildConfiguration;\s*buildSettings = \{[^}]*?INFOPLIST_FILE[^}]*?\};/
    )?.[0]
    const team = releaseConfig?.match(/DEVELOPMENT_TEAM = (\w+);/)?.[1]
    if (!appId) throw new Error('could not read appId from capacitor.config.ts')
    if (!team) throw new Error('could not read DEVELOPMENT_TEAM from the App Release configuration')
    return { appId, team }
}

const request = (url, init = {}) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), ...init })

/** Reads a JSON body that must come back 200, application/json and without a redirect. */
async function getJson(url) {
    const response = await request(url)
    if (response.status !== 200) throw new Error(`status ${response.status}, expected 200 with no redirect`)
    const type = response.headers.get('content-type') ?? ''
    if (!/^application\/json(?:;|$)/i.test(type)) throw new Error(`content-type "${type}", expected application/json`)
    const text = await response.text()
    try {
        return { text, body: JSON.parse(text) }
    } catch {
        throw new Error('the body is not valid JSON')
    }
}

const checks = [
    ...APP_ORIGINS.map((appOrigin) => ({
        name: `CORS preflight from ${appOrigin}`,
        async run() {
            const response = await request(`${ORIGIN}/api/currencies`, {
                method: 'OPTIONS',
                headers: { Origin: appOrigin, 'Access-Control-Request-Method': 'GET' },
            })
            const allowed = response.headers.get('access-control-allow-origin')
            if (response.status !== 204) throw new Error(`status ${response.status}, expected 204`)
            if (allowed !== appOrigin) throw new Error(`Access-Control-Allow-Origin is "${allowed ?? ''}"`)
            return '204 with a matching Access-Control-Allow-Origin'
        },
    })),
    {
        name: 'apple-app-site-association',
        async run() {
            const { appId, team } = appIdentity()
            const { text, body } = await getJson(`${ORIGIN}/.well-known/apple-app-site-association`)
            if (text.includes('TEAMID')) throw new Error('the file still contains the TEAMID placeholder')
            const appIds = (body?.applinks?.details ?? []).flatMap((detail) => detail?.appIDs ?? [])
            const expected = `${team}.${appId}`
            if (!appIds.includes(expected))
                throw new Error(`appIDs ${JSON.stringify(appIds)} do not include ${expected}`)
            return `200 application/json, names ${expected}`
        },
    },
    {
        name: 'assetlinks.json',
        async run() {
            const { appId } = appIdentity()
            const { body } = await getJson(`${ORIGIN}/.well-known/assetlinks.json`)
            const entry = (Array.isArray(body) ? body : []).find((item) => item?.target?.package_name === appId)
            if (!entry) throw new Error(`no entry for ${appId}`)
            const fingerprints = entry.target.sha256_cert_fingerprints ?? []
            const real = fingerprints.filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))
            if (real.length !== fingerprints.length)
                throw new Error('a fingerprint is still the placeholder or malformed')
            if (real.length === 0) throw new Error('no SHA-256 fingerprint')
            return `${real.length} SHA-256 fingerprint(s) for ${appId}`
        },
    },
    {
        name: 'receipt scan enabled',
        async run() {
            const { body } = await getJson(`${ORIGIN}/api/rooms/${encodeURIComponent(slug)}/receipt-parse`)
            if (body?.enabled !== true) throw new Error(`answer is ${JSON.stringify(body)}, expected {"enabled":true}`)
            return 'enabled: true'
        },
    },
]

let failed = false
for (const check of checks) {
    try {
        console.log(`ok   ${check.name}: ${await check.run()}`)
    } catch (error) {
        failed = true
        const reason = error instanceof Error ? (error.cause?.message ?? error.message) : String(error)
        console.log(`FAIL ${check.name}: ${reason}`)
    }
}
process.exit(failed ? 1 : 0)
