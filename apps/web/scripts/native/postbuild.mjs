#!/usr/bin/env node
/**
 * Prunes and checks the store-app export in .next-native/ (ARCHITECTURE 2.3). Runs after
 * `next build` in `pnpm native:build`. Every failure exits non-zero with a one-line reason, so a
 * broken export never reaches `cap sync`.
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = join(appRoot, '.next-native')
const MAX_BYTES = 15 * 1024 * 1024

function fail(reason) {
    console.error(`native postbuild: ${reason}`)
    process.exit(1)
}

function filesBelow(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = join(directory, entry.name)
        return entry.isDirectory() ? filesBelow(target) : [target]
    })
}

if (!existsSync(join(outDir, 'index.html'))) fail('.next-native/index.html is missing; did next build export?')

// 1. Prune what public/ copied in (or Next always writes) that the app never loads. Capacitor
//    never serves 404/ or _not-found/: an unknown path gets the root index.html.
const pruned = [
    'press',
    'dev',
    'icons/splash',
    'install',
    'og-default.png',
    'sw.js',
    'sw.js.map',
    '.well-known',
    'app-config.json',
    '404',
    '_not-found',
]
for (const path of pruned) rmSync(join(outDir, path), { recursive: true, force: true })
for (const name of readdirSync(outDir)) {
    const generated = /^opengraph-image/.test(name) || /^swe-worker.*\.js$/.test(name)
    // Search-engine ownership files: Google's verification page and the IndexNow key.
    const siteVerification = /^google[0-9a-f]+\.(html|txt)$/.test(name) || /^[0-9a-f]{32}\.txt$/.test(name)
    if (generated || siteVerification) rmSync(join(outDir, name), { recursive: true, force: true })
}

const files = filesBelow(outDir)
const rel = (file) => relative(outDir, file).replaceAll('\\', '/')

// 2. Exactly the native routes. An extra page means a web page leaked into the binary.
const expectedHtml = [
    '404.html',
    'app/index.html',
    'import/index.html',
    'index.html',
    'new/index.html',
    'room/import/index.html',
    'room/index.html',
]
const html = files
    .map(rel)
    .filter((path) => path.endsWith('.html'))
    .sort()
if (JSON.stringify(html) !== JSON.stringify(expectedHtml)) {
    fail(`HTML route set is [${html.join(', ')}], expected [${expectedHtml.join(', ')}]`)
}

// 3. Web-only machinery that must not ship in the app.
for (const path of ['cache', 'server', 'sw.js', 'manifest.webmanifest']) {
    if (existsSync(join(outDir, path))) fail(`${path} must not be in the export`)
}
const forbidden = [
    '/split-static/',
    'serviceWorker.register',
    'googletagmanager',
    'googleadservices',
    'static.ads-twitter.com',
]
const code = files.filter((file) => /\.(js|html)$/.test(file))
const sources = new Map(code.map((file) => [file, readFileSync(file, 'utf8')]))
for (const [file, source] of sources) {
    const hit = forbidden.find((needle) => source.includes(needle))
    if (hit) fail(`${rel(file)} contains forbidden string "${hit}"`)
}

// 4. The API origin is baked in. Read the value this build inlined; never assume a fallback
//    (peanut-ui shipped an unbaked env for months).
const chunks = [...sources].filter(([file]) => file.endsWith('.js'))
const containedInChunk = (value) => chunks.some(([, source]) => source.includes(value))
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
if (!baseUrl) fail('NEXT_PUBLIC_BASE_URL is not set; run through `pnpm native:build`')
if (!containedInChunk(baseUrl)) fail(`API origin ${baseUrl} is not in any JS chunk`)

// 5. Sentry reports from the app only when the DSN was baked in.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn && !containedInChunk(dsn)) fail('NEXT_PUBLIC_SENTRY_DSN is set but not in any JS chunk')

// 6. Size.
const total = files.reduce((sum, file) => sum + statSync(file).size, 0)
const megabytes = (total / 1024 / 1024).toFixed(2)
if (total > MAX_BYTES) fail(`export is ${megabytes} MB, above the 15 MB cap`)

// 7. Next always builds an `output: 'export'` app inside .next and only copies the export to
//    .next-native, so .next now holds this app build in place of any web build. Clear it (keeping
//    .next/cache so the next web build stays fast): a later `next start`, standalone copy or
//    `.next/static` check then fails loudly instead of using the app build.
const buildDir = join(appRoot, '.next')
if (existsSync(buildDir)) {
    for (const name of readdirSync(buildDir)) {
        if (name !== 'cache') rmSync(join(buildDir, name), { recursive: true, force: true })
    }
}

console.log(`native postbuild: ok, ${html.length} pages, ${files.length} files, total ${megabytes} MB`)
