#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const chunksRoot = join(appRoot, '.next/static/chunks')

function filesBelow(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = join(directory, entry.name)
        return entry.isDirectory() ? filesBelow(target) : [target]
    })
}

const chunks = filesBelow(chunksRoot).filter((file) => file.endsWith('.js'))
const sourceOf = (files) => files.map((file) => readFileSync(file, 'utf8')).join('\n')
const matching = (pattern) => chunks.filter((file) => pattern.test(file.replaceAll('\\', '/')))

const globalEntries = chunks.filter((file) => /^(?:main|main-app)-[^/]+\.js$/.test(basename(file)))
const productLayouts = matching(/\/app\/\(product-shell\)\/layout-[^/]+\.js$/)
const contentLayouts = matching(/\/app\/\(split-content\)\/layout-[^/]+\.js$/)

assert.ok(existsSync(join(appRoot, 'public/sw.js')), 'Serwist did not emit public/sw.js')
assert.ok(globalEntries.length > 0, 'Next emitted no global client entry')
assert.equal(productLayouts.length, 1, 'expected one compiled product root layout')
assert.equal(contentLayouts.length, 1, 'expected one compiled content root layout')

const globalSource = sourceOf(globalEntries)
const productSource = sourceOf(productLayouts)
const contentSource = sourceOf(contentLayouts)

// `register: false` must still expose the supported Serwist window instance before React effects,
// while eliminating the global call and the default reconnect reload from content's shared entry.
assert.match(globalSource, /window\.serwist=new /, 'global entry no longer initializes window.serwist')
assert.doesNotMatch(globalSource, /window\.serwist\.register\(/, 'global entry automatically registers /sw.js')
assert.doesNotMatch(
    globalSource,
    /window\.addEventListener\(["']online["'],[^;]*location\.reload/,
    'global entry reloads content on reconnect'
)

assert.match(productSource, /window\.serwist\.register\(\)/, 'product layout has no Serwist registration')
assert.match(
    productSource,
    /navigator\.serviceWorker\.register\(["']\/sw\.js["'],\{scope:["']\/["']\}\)/,
    'product layout has no native ordering fallback'
)
assert.match(productSource, /addEventListener\(["']online["']/, 'product layout lost reconnect reload behavior')
assert.doesNotMatch(
    contentSource,
    /serwist\.register|serviceWorker\.register|addEventListener\(["']online["']/,
    'content layout owns a PWA side effect'
)

process.stdout.write('PWA build boundary: product-only registration verified.\n')
