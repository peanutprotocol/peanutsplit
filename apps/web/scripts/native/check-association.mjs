#!/usr/bin/env node
/**
 * Checks the two app-association files against a running server.
 * Usage: node scripts/native/check-association.mjs [origin]   (default http://localhost:3100)
 *
 * iOS fetches the apple-app-site-association file and Android the assetlinks.json file to decide
 * whether `/r/` links open the app. Both refuse a redirect, and iOS refuses a body it cannot parse,
 * so each file must answer 200, application/json, with no redirect and valid JSON. A failure here
 * means room links open the browser instead of the app, with no error anywhere.
 */

const origin = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '')
const FILES = ['/.well-known/apple-app-site-association', '/.well-known/assetlinks.json']

let failed = false
for (const path of FILES) {
    const url = origin + path
    const problems = []
    try {
        const response = await fetch(url, { redirect: 'manual' })
        if (response.status !== 200) problems.push(`status ${response.status}, expected 200 with no redirect`)
        const type = response.headers.get('content-type') ?? ''
        if (!/^application\/json(?:;|$)/i.test(type)) problems.push(`content-type "${type}", expected application/json`)
        try {
            JSON.parse(await response.text())
        } catch {
            problems.push('the body is not valid JSON')
        }
    } catch (error) {
        problems.push(`request failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (problems.length > 0) {
        failed = true
        for (const problem of problems) console.error(`FAIL ${url}: ${problem}`)
    } else {
        console.log(`ok   ${url}`)
    }
}
process.exit(failed ? 1 : 0)
