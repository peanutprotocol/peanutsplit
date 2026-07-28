#!/usr/bin/env node
/**
 * Key-parity gate for the message catalogs.
 *
 * This exists because of how a missing translation fails: next-intl returns the key path itself.
 * `room.settle.record` renders as the literal text "room.settle.record", which nobody notices in
 * a dev session they are running in English, and which ships. There is no crash, no warning in
 * the browser, no failing test — just a user in São Paulo looking at a dotted identifier where a
 * button label should be. So the check has to be mechanical and it has to run in CI.
 *
 * Two failures, both exit 1:
 *
 *   1. A key referenced in `src/` that does not exist in `en.json` — a typo or a rename.
 *   2. A key in `en.json` missing from `es.json` or `pt-BR.json` — a translation not done.
 *
 * Computed keys (`t(someVariable)`, `t(\`a.${b}\`)`) cannot be resolved statically and are
 * reported as skipped rather than guessed at. Keep them rare: the code paths that use them
 * (the error-code map, mainly) are covered by check 2 instead, since that one compares catalogs
 * to each other and never looks at the source.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')
const srcRoot = join(appRoot, 'src')
const messagesRoot = join(srcRoot, 'i18n/messages')

const DEFAULT_LOCALE = 'en'
const LOCALES = ['en', 'es', 'pt-BR']

// ---------------------------------------------------------------- catalogs

/** Dotted paths of every string leaf. A nested object is a namespace, never a message. */
function leafKeys(node, prefix = '') {
    const keys = []
    for (const [key, value] of Object.entries(node)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'string') keys.push(path)
        else if (value && typeof value === 'object') keys.push(...leafKeys(value, path))
    }
    return keys
}

const catalogs = new Map()
for (const locale of LOCALES) {
    const file = join(messagesRoot, `${locale}.json`)
    catalogs.set(locale, new Set(leafKeys(JSON.parse(readFileSync(file, 'utf8')))))
}
const englishKeys = catalogs.get(DEFAULT_LOCALE)

// ---------------------------------------------------------------- source scan

const SOURCE_EXTENSIONS = ['.ts', '.tsx']
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'i18n'])

function sourceFiles(dir) {
    const files = []
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRECTORIES.has(entry)) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) files.push(...sourceFiles(full))
        else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) files.push(full)
    }
    return files
}

/**
 * `const t = useTranslations('room.settle')` → the variable `t` resolves keys under
 * `room.settle`. `getTranslations` is the async server twin and binds identically. A namespace
 * argument is optional; without one the variable resolves against the catalog root.
 */
const BINDING =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:(['"])([\w.]+)\2)?\s*\)/g

/**
 * A call on one of those variables. The leading `(?<![\w.$])` is load-bearing: without it
 * `foo.t('x')` and — the case that actually bit — `someString.test('x')` both match, and the
 * audit starts demanding catalog entries for regex fixtures.
 *
 * `t.rich`, `t.raw`, `t.markup` and `t.has` all take a key in the same position.
 */
const CALL = /(?<![\w.$])([A-Za-z_$][\w$]*)(?:\.(?:rich|raw|markup|has))?\(\s*(['"])([^'"\n]+)\2/g

/** Same shape, but the first argument is not a literal — a variable, a template, a ternary. */
const COMPUTED_CALL = /(?<![\w.$])([A-Za-z_$][\w$]*)(?:\.(?:rich|raw|markup|has))?\(\s*(?!['")])/g

/**
 * Comments are stripped first, or a doc comment that *describes* a computed key ("a
 * `t(`step${n}.title`)` loop would…") gets reported as one. Only block comments and whole-line
 * `//` comments go: a trailing `//` strip would eat the rest of any line holding a URL literal,
 * and with it any real `t('…')` after it.
 */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const referenced = new Map()
const skipped = []

for (const file of sourceFiles(srcRoot)) {
    const source = stripComments(readFileSync(file, 'utf8'))

    const namespaces = new Map()
    for (const match of source.matchAll(BINDING)) namespaces.set(match[1], match[3] ?? '')
    if (namespaces.size === 0) continue

    for (const match of source.matchAll(CALL)) {
        const namespace = namespaces.get(match[1])
        if (namespace === undefined) continue
        const key = namespace ? `${namespace}.${match[3]}` : match[3]
        if (!referenced.has(key)) referenced.set(key, relative(appRoot, file))
    }

    for (const match of source.matchAll(COMPUTED_CALL)) {
        if (!namespaces.has(match[1])) continue
        skipped.push(`${relative(appRoot, file)} — ${match[1]}(<computed>)`)
    }
}

// ---------------------------------------------------------------- report

const missingInEnglish = [...referenced].filter(([key]) => !englishKeys.has(key))

const missingTranslations = []
for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue
    const keys = catalogs.get(locale)
    const missing = [...englishKeys].filter((key) => !keys.has(key))
    const extra = [...keys].filter((key) => !englishKeys.has(key))
    if (missing.length > 0 || extra.length > 0) missingTranslations.push({ locale, missing, extra })
}

for (const locale of LOCALES) {
    console.log(`${locale.padEnd(6)} ${catalogs.get(locale).size} keys`)
}
console.log(`refs   ${referenced.size} literal keys in src/, ${skipped.length} computed (skipped)`)

if (skipped.length > 0) {
    console.log('\nskipped (dynamic keys — verified by catalog parity, not by usage):')
    for (const entry of [...new Set(skipped)]) console.log(`  ${entry}`)
}

let failed = false

if (missingInEnglish.length > 0) {
    failed = true
    console.error(`\nreferenced but missing from ${DEFAULT_LOCALE}.json:`)
    for (const [key, file] of missingInEnglish) console.error(`  ${key}  (${file})`)
}

for (const { locale, missing, extra } of missingTranslations) {
    failed = true
    if (missing.length > 0) {
        console.error(`\nin ${DEFAULT_LOCALE}.json but missing from ${locale}.json:`)
        for (const key of missing) console.error(`  ${key}`)
    }
    if (extra.length > 0) {
        // Not fatal in spirit but treated as such: an orphan key is either a rename that was
        // half-applied or a translation of something that no longer exists.
        console.error(`\nin ${locale}.json but not in ${DEFAULT_LOCALE}.json:`)
        for (const key of extra) console.error(`  ${key}`)
    }
}

if (failed) {
    console.error('\ni18n audit failed')
    process.exit(1)
}

console.log('\ni18n audit clean')
