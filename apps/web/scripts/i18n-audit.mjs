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
 * Three failures, all exit 1:
 *
 *   1. A key referenced in `src/` that does not exist in `en.json` — a typo or a rename.
 *   2. A key in `en.json` missing from `es-419.json` or `pt-br.json` — a translation not done.
 *   3. A `{placeholder}` in the message that the call site never passes a value for. This fails
 *      the same silent way: next-intl cannot format the message, so it returns the key path and
 *      "Dani joined after 1 earlier expense" ships as "room.latecomer.title". A reader who has
 *      the value on screen right above it — the avatar, the name — sees a dotted identifier
 *      instead of the sentence. Caught for real on `room.latecomer.body`.
 *   4. A locale with grammatical plural categories omits one of them from an ICU plural. The
 *      `other` branch prevents a crash but can silently render the wrong noun form.
 *   5. Translation suppression appears below the document root. Native catalogs own the page;
 *      one root `translate="no"` policy replaces component-level translator workarounds.
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
// `uk` is catalog-gated while its native-speaker approval is pending. It deliberately does not
// appear in src/i18n/locales.ts yet, so it cannot be selected or auto-negotiated in production.
const LOCALES = ['en', 'es-419', 'pt-br', 'pl', 'de', 'fr', 'uk']

// ---------------------------------------------------------------- catalogs

/**
 * Dotted path → message, for every string leaf. A nested object is a namespace, never a message.
 * Check 3 needs the text, not only the path, so this keeps both.
 */
function leafMessages(node, prefix = '', out = new Map()) {
    for (const [key, value] of Object.entries(node)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'string') out.set(path, value)
        else if (value && typeof value === 'object') leafMessages(value, path, out)
    }
    return out
}

const catalogs = new Map()
for (const locale of LOCALES) {
    const file = join(messagesRoot, `${locale}.json`)
    catalogs.set(locale, leafMessages(JSON.parse(readFileSync(file, 'utf8'))))
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
 *
 * BOTH argument forms, and the second one is not cosmetic: the server twin is normally called as
 * `getTranslations({ locale, namespace: 'content' })`, and while this only matched a bare string
 * literal every one of those bound nothing — so every key under that namespace was invisible to
 * check 1 and could be typo'd or renamed with no gate at all.
 */
const BINDING =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:(['"])([\w.]+)\2|\{[^}]*namespace\s*:\s*(['"])([\w.]+)\4[^}]*\}|\{[^}]*\})?\s*\)/g

/**
 * The THIRD binder, and the one this script could not see at all until it was added.
 *
 * `getTranslator` (`src/i18n/t.ts`) is how code that is not a component resolves a message — the
 * OG card builders, which draw a whole subtree (`card.*`, `preview.*`) onto an image that goes
 * into a group chat. Its argument is a LOCALE, not a namespace, so the variable resolves against
 * the catalog root and the two patterns above never matched it. Every key drawn on a card was
 * therefore invisible to check 1: it could be typo'd or renamed with no gate, and the failure
 * mode is a card printing the literal text `card.crew.title`.
 *
 * Check 3 does not apply to these sites and they are reported rather than failed. The translator
 * returns the MESSAGE, and a caller is free to interpolate it later — `roomCard.ts` does exactly
 * that, holding `preview.statOne` as a template and substituting `{amount}` inside `statLine`. A
 * value missing at the `t()` call is normal there, not a bug. What still guards the drawn strings
 * is `achievementCard.test.ts`, which asserts no `{` or `}` survives into any card in any locale.
 */
const TRANSLATOR_BINDING = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*await\s+getTranslator\(/g

/**
 * A call on one of those variables. The leading `(?<![\w.$])` is load-bearing: without it
 * `foo.t('x')` and — the case that actually bit — `someString.test('x')` both match, and the
 * audit starts demanding catalog entries for regex fixtures.
 *
 * `t.rich`, `t.raw`, `t.markup` and `t.has` all take a key in the same position. The variant is
 * captured because check 3 does not apply to `.raw` or `.has`: neither formats the message, so
 * neither can miss a value.
 */
const CALL = /(?<![\w.$])([A-Za-z_$][\w$]*)(?:\.(rich|raw|markup|has))?\(\s*(['"])([^'"\n]+)\3/g

/** Same shape, but the first argument is not a literal — a variable, a template, a ternary. */
const COMPUTED_CALL = /(?<![\w.$])([A-Za-z_$][\w$]*)(?:\.(?:rich|raw|markup|has))?\(\s*(?!['")])/g

/**
 * Comments are stripped first, or a doc comment that *describes* a computed key ("a
 * `t(`step${n}.title`)` loop would…") gets reported as one. Only block comments and whole-line
 * `//` comments go: a trailing `//` strip would eat the rest of any line holding a URL literal,
 * and with it any real `t('…')` after it.
 */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ---------------------------------------------------------------- placeholders

/**
 * The argument names a message interpolates. `{name}` and the ICU forms alike: `{count, plural,
 * …}` needs `count` exactly as `{name}` needs `name`. A plural branch (`one {# apple}`) is not a
 * placeholder — `#` is not an identifier, so the pattern passes over it — while a nested `{total}`
 * inside a branch is one, and is found.
 */
const placeholdersIn = (message) => new Set([...message.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]))

/** Find the closing brace for an ICU argument, including nested branch bodies. */
function closingBrace(message, open) {
    let depth = 0
    for (let index = open; index < message.length; index++) {
        if (message[index] === '{') depth += 1
        else if (message[index] === '}' && (depth -= 1) === 0) return index
    }
    return -1
}

/**
 * Return every ICU plural in a message and its top-level selectors. Regex alone cannot parse a
 * plural body because every selector owns a nested `{…}` branch, so the small scanner only reads
 * selectors while it is outside those branch bodies. Nested plurals are found by the outer header
 * scan in their own right.
 */
function pluralsIn(message) {
    const plurals = []
    const header = /\{\s*(\w+)\s*,\s*(plural|selectordinal)\s*,/g
    for (const match of message.matchAll(header)) {
        const close = closingBrace(message, match.index)
        if (close === -1) continue // next-intl reports malformed ICU; this gate owns categories.

        const body = message.slice(match.index + match[0].length, close)
        const selectors = new Set()
        let cursor = 0
        let depth = 0
        while (cursor < body.length) {
            if (depth === 0) {
                const offset = /^\s*offset\s*:\s*\d+/.exec(body.slice(cursor))
                if (offset) {
                    cursor += offset[0].length
                    continue
                }
                const selector = /^\s*(=?[\w-]+)\s*\{/.exec(body.slice(cursor))
                if (selector) {
                    selectors.add(selector[1])
                    cursor += selector[0].length
                    depth = 1
                    continue
                }
            }

            if (body[cursor] === '{') depth += 1
            else if (body[cursor] === '}') depth -= 1
            cursor += 1
        }
        plurals.push({ argument: match[1], selectors })
    }
    return plurals
}

/** The text between a call's parentheses, found by balancing them. */
function callArguments(source, openParen) {
    let depth = 0
    for (let index = openParen; index < source.length; index++) {
        const character = source[index]
        if (character === '(') depth += 1
        else if (character === ')' && (depth -= 1) === 0) return source.slice(openParen + 1, index)
    }
    return ''
}

/**
 * Where a property's value ends: the `,` that starts the next property, or the `}` that closes the
 * object. Used to step OVER the value, because only the name side of `person: name` is an argument
 * the call passes — see `passedValues`.
 */
function endOfValue(values, start) {
    let depth = 0
    for (let index = start; index < values.length; index++) {
        const character = values[index]
        if ('([{'.includes(character)) depth += 1
        else if (')]}'.includes(character)) {
            if (depth === 0) return index
            depth -= 1
        } else if (character === ',' && depth === 0) return index
    }
    return values.length
}

/**
 * The keys of the values object a call passes, or null when it passes no second argument at all.
 * `spread` marks `{...values}`, which cannot be resolved statically — the call is reported as
 * skipped rather than failed, on the same grounds as a computed key.
 *
 * Only the NAME side counts. Harvesting identifiers from both sides is what made this check pass
 * on `t('title', { person: name })` for a message that interpolates `{name}` — the audit read the
 * value expression as a second argument name, so the one shape it exists to catch went through it.
 */
function passedValues(args) {
    let depth = 0
    let comma = -1
    for (let index = 0; index < args.length && comma === -1; index++) {
        const character = args[index]
        if ('([{'.includes(character)) depth += 1
        else if (')]}'.includes(character)) depth -= 1
        else if (character === ',' && depth === 0) comma = index
    }
    if (comma === -1) return null

    const values = args.slice(comma + 1).trim()
    // A variable rather than a literal (`t('x', params)`) is as opaque as a spread.
    if (!values.startsWith('{')) return { keys: new Set(), spread: true }

    const keys = new Set()
    let spread = false
    depth = 0
    for (let index = 0; index < values.length; index++) {
        const character = values[index]
        if ('([{'.includes(character)) {
            depth += 1
            continue
        }
        if (')]}'.includes(character)) {
            depth -= 1
            if (depth === 0) break
            continue
        }
        // Only the outermost level names arguments; anything deeper belongs to a nested value.
        if (depth !== 1) continue
        if (values.startsWith('...', index)) {
            spread = true
            continue
        }
        const property = /^([A-Za-z_$][\w$]*)\s*([:,}\n])/.exec(values.slice(index))
        if (!property) continue
        keys.add(property[1])
        // `{ name }` and `{ name, count }` name themselves and end where they are read. A `key:`
        // is followed by an expression that names nothing, so skip to the next property.
        if (property[2] !== ':') {
            index += property[1].length - 1
            continue
        }
        index = endOfValue(values, index + property[0].length) - 1
    }
    return { keys, spread }
}

const referenced = new Map()
const valueSites = []
/** Call sites whose KEY cannot be resolved statically. */
const skipped = []
/** Call sites whose key is known but whose VALUES are not a literal object, so check 3 cannot run
 *  on them. A different thing from a computed key, and counted separately: mixing the two inflated
 *  the "computed (skipped)" number on the summary line with sites that have no computed key at
 *  all. */
const opaqueValues = []
/** Call sites on a `getTranslator` variable: the key is checked, the values are not. */
const templateSites = []

for (const file of sourceFiles(srcRoot)) {
    const source = stripComments(readFileSync(file, 'utf8'))

    const namespaces = new Map()
    // Group 3 is the string form's namespace, group 5 the object form's; neither
    // means the variable resolves against the catalog root.
    for (const match of source.matchAll(BINDING)) namespaces.set(match[1], match[3] ?? match[5] ?? '')
    const templates = new Set()
    for (const match of source.matchAll(TRANSLATOR_BINDING)) {
        namespaces.set(match[1], '')
        templates.add(match[1])
    }
    if (namespaces.size === 0) continue

    for (const match of source.matchAll(CALL)) {
        const namespace = namespaces.get(match[1])
        if (namespace === undefined) continue
        const key = namespace ? `${namespace}.${match[4]}` : match[4]
        if (!referenced.has(key)) referenced.set(key, relative(appRoot, file))
        if (match[2] === 'raw' || match[2] === 'has') continue
        if (templates.has(match[1])) {
            templateSites.push(`${relative(appRoot, file)} — ${key}`)
            continue
        }
        const openParen = source.indexOf('(', match.index)
        valueSites.push({ key, file: relative(appRoot, file), values: passedValues(callArguments(source, openParen)) })
    }

    for (const match of source.matchAll(COMPUTED_CALL)) {
        if (!namespaces.has(match[1])) continue
        skipped.push(`${relative(appRoot, file)} — ${match[1]}(<computed>)`)
    }
}

// ---------------------------------------------------------------- document policy

const layoutPath = 'src/app/(product-shell)/layout.tsx'
const translationPolicyViolations = []
for (const file of sourceFiles(srcRoot)) {
    const path = relative(appRoot, file)
    const source = stripComments(readFileSync(file, 'utf8'))
    if (source.includes('notranslate')) translationPolicyViolations.push(`${path} uses notranslate`)

    const attributes = [...source.matchAll(/translate\s*=\s*['"]no['"]/g)]
    if (path !== layoutPath && attributes.length > 0) {
        translationPolicyViolations.push(`${path} suppresses translation below the document root`)
    }
    if (path === layoutPath && attributes.length !== 1) {
        translationPolicyViolations.push(`${path} must contain exactly one translate="no" policy`)
    }
}

const layoutSource = stripComments(readFileSync(join(appRoot, layoutPath), 'utf8'))
if (!/<html\s[^>]*lang=\{HREFLANG\[locale\]\}[^>]*translate="no"/.test(layoutSource)) {
    translationPolicyViolations.push(`${layoutPath} must bind lang and the native-only policy on <html>`)
}

// ---------------------------------------------------------------- report

const missingInEnglish = [...referenced].filter(([key]) => !englishKeys.has(key))

const missingTranslations = []
for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue
    const keys = catalogs.get(locale)
    const missing = [...englishKeys.keys()].filter((key) => !keys.has(key))
    const extra = [...keys.keys()].filter((key) => !englishKeys.has(key))
    if (missing.length > 0 || extra.length > 0) missingTranslations.push({ locale, missing, extra })
}

/**
 * Check 3, first half: a call that formats a message must pass a value for every placeholder in
 * it. Keys reached through a computed key are not here — they are in `skipped` already.
 */
const missingValues = []
for (const { key, file, values } of valueSites) {
    const message = englishKeys.get(key)
    if (message === undefined) continue // check 1 already owns this one
    const wanted = placeholdersIn(message)
    if (wanted.size === 0) continue
    if (values === null) {
        missingValues.push({ key, file, missing: [...wanted] })
        continue
    }
    if (values.spread) {
        opaqueValues.push(`${file} — ${key}`)
        continue
    }
    const missing = [...wanted].filter((name) => !values.keys.has(name))
    if (missing.length > 0) missingValues.push({ key, file, missing })
}

/**
 * Second half: a translation must interpolate the same arguments as the English message. The call
 * site is written against English, so a placeholder only `pt-BR.json` has gets no value and the
 * whole message falls back to its key path — for Brazilian readers only, which is exactly the
 * audience least likely to be in the room when it is noticed.
 */
const placeholderDrift = []
for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue
    for (const [key, message] of catalogs.get(locale)) {
        const english = englishKeys.get(key)
        if (english === undefined) continue
        const wanted = [...placeholdersIn(english)].sort()
        const has = [...placeholdersIn(message)].sort()
        if (wanted.join() !== has.join()) placeholderDrift.push({ locale, key, wanted, has })
    }
}

/**
 * `other` is a legal fallback, so ICU will not throw when these branches are absent — it will say
 * the wrong thing. German and French need the singular branch; Polish and Ukrainian also need the
 * Slavic `few` and `many` forms. Existing en/es-419/pt-br contain a handful of deliberately
 * plural-only facts, so this new strictness starts with the locale-expansion catalogs rather than
 * rewriting already-shipped copy as collateral work.
 */
const REQUIRED_PLURAL_CATEGORIES = new Map([
    ['de', ['one', 'other']],
    ['fr', ['one', 'other']],
    ['pl', ['one', 'few', 'many', 'other']],
    ['uk', ['one', 'few', 'many', 'other']],
])
const missingPluralCategories = []
for (const [locale, required] of REQUIRED_PLURAL_CATEGORIES) {
    for (const [key, message] of catalogs.get(locale)) {
        for (const { argument, selectors } of pluralsIn(message)) {
            const missing = required.filter((category) => !selectors.has(category))
            if (missing.length > 0) missingPluralCategories.push({ locale, key, argument, missing })
        }
    }
}

for (const locale of LOCALES) {
    console.log(`${locale.padEnd(6)} ${catalogs.get(locale).size} keys`)
}
console.log(`refs   ${referenced.size} literal keys in src/, ${skipped.length} computed (skipped)`)

if (skipped.length > 0) {
    console.log('\nskipped (dynamic keys — verified by catalog parity, not by usage):')
    for (const entry of [...new Set(skipped)]) console.log(`  ${entry}`)
}

if (opaqueValues.length > 0) {
    console.log('\nplaceholders unchecked (values are not a literal object):')
    for (const entry of [...new Set(opaqueValues)]) console.log(`  ${entry}`)
}

if (templateSites.length > 0) {
    console.log('\nplaceholders unchecked (getTranslator returns the template; the caller may interpolate later):')
    for (const entry of [...new Set(templateSites)]) console.log(`  ${entry}`)
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

if (missingValues.length > 0) {
    failed = true
    console.error('\nplaceholder with no value passed at the call site:')
    for (const { key, file, missing } of missingValues)
        console.error(`  ${key}  needs {${missing.join('}, {')}}  (${file})`)
}

for (const { locale, key, wanted, has } of placeholderDrift) {
    failed = true
    console.error(`\n${locale}.json interpolates different arguments than ${DEFAULT_LOCALE}.json:`)
    console.error(`  ${key}  ${DEFAULT_LOCALE}: ${wanted.join(', ') || 'none'}  ${locale}: ${has.join(', ') || 'none'}`)
}

for (const { locale, key, argument, missing } of missingPluralCategories) {
    failed = true
    console.error(`\n${locale}.json is missing plural categories required by its grammar:`)
    console.error(`  ${key}  {${argument}, plural, …} needs ${missing.join(', ')}`)
}

if (translationPolicyViolations.length > 0) {
    failed = true
    console.error('\ninvalid document translation policy:')
    for (const violation of translationPolicyViolations) console.error(`  ${violation}`)
}

if (failed) {
    console.error('\ni18n audit failed')
    process.exit(1)
}

console.log('\ni18n audit clean')
