#!/usr/bin/env node
// Checks the store texts before anyone pastes them into App Store Connect or Play Console.
//
// listing.md: every required field exists, its stated length matches its text, the text fits the
// store limit, and no field uses a word the stores or the product rules forbid (PLAN 7.1).
// review-notes.md: every double-quoted string is a UI label that exists in en.json, so a
// reviewer who looks for it finds it on screen.
//
// Usage: node apps/web/store/check-listing.mjs [--listing <path>] [--review-notes <path>]
// Exits 1 and names the field or the label on the first kind of failure it finds.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function argValue(name, fallback) {
    const at = process.argv.indexOf(name)
    return at === -1 ? fallback : process.argv[at + 1]
}

const listingPath = argValue('--listing', join(here, 'listing.md'))
const reviewNotesPath = argValue('--review-notes', join(here, 'review-notes.md'))
const enPath = join(here, '..', 'src', 'i18n', 'messages', 'en.json')

// Store limits from PLAN 7.1. The limit written in listing.md must agree, so the file never
// advertises a looser limit than the store applies.
const LIMITS = {
    'ios.name': 30,
    'ios.subtitle': 30,
    'ios.keywords': 100,
    'ios.promotionalText': 170,
    'ios.description': 4000,
    'play.title': 30,
    'play.shortDescription': 80,
    'play.fullDescription': 4000,
}

const REQUIRED = [
    ...Object.keys(LIMITS),
    'ios.category',
    'ios.privacyUrl',
    'ios.supportUrl',
    'ios.copyright',
    'play.category',
    'play.contactEmail',
    'play.privacyUrl',
]

// Words that would invite finance or crypto review, describe Split as a website, or overpromise
// offline use (mono split-content/product/truths.md, offline-creates-only).
const BANNED_EVERYWHERE = [
    /\bcrypto\w*/i,
    /\bwallets?\b/i,
    /\bstablecoins?\b/i,
    /\bUSDC\b/i,
    /\bdigital dollars?\b/i,
    /\bpayments?\b/i,
    /\bsend(?:s|ing)? money\b/i,
    /\btransfers?\b/i,
    /\bbank(?:s|ing)?\b/i,
    /\bPWA\b/i,
    /\bweb ?apps?\b/i,
    /\bworks? offline\b/i,
    /\bopens? offline\b/i,
    // Peanut appears only as part of the product name, never as a way to pay. The support
    // address (support@peanut.me) is the one other allowed use.
    /(?<!@)\bPeanut\b(?! Split\b)/i,
    // Competitors: never in keywords or any other field.
    /\bsplitwise\b/i,
    /\btricount\b/i,
    /\bsettle ?up\b/i,
    /\bsplid\b/i,
    /\bkittysplit\b/i,
    /\bvenmo\b/i,
    /\bpaypal\b/i,
    /\brevolut\b/i,
    /\bbunq\b/i,
]

// Apple 2.3.10 forbids other platforms in iOS metadata; Play text stays free of Apple words too.
const BANNED_IOS = [/\bandroid\b/i, /\bgoogle play\b/i, /\bplay store\b/i]
const BANNED_PLAY = [/\biphone\b/i, /\bipad\b/i, /\bios\b/i, /\bapp store\b/i, /\bapple\b/i]

const failures = []

function parseFields(markdown) {
    const fields = new Map()
    // The format example in the file sits inside a four-backtick fence; it is not a field.
    const withoutExample = markdown.replace(/^````[\s\S]*?^````$/gm, '')
    for (const section of withoutExample.split(/^(?=### )/m)) {
        const id = section.match(/^### `((?:ios|play)\.[A-Za-z]+)`/)?.[1]
        if (!id) continue
        const match = section.match(/^Limit: (none|\d+)\.(?: Length: (\d+)\.)?\n+```text\n([\s\S]*?)\n```$/m)
        if (!match) {
            failures.push(`${id}: needs a "Limit: …" line followed by a text fence`)
            continue
        }
        const [, limit, length, text] = match
        if (fields.has(id)) failures.push(`${id}: defined twice`)
        fields.set(id, {
            limit: limit === 'none' ? null : Number(limit),
            length: length === undefined ? null : Number(length),
            text,
        })
    }
    return fields
}

function checkListing() {
    const fields = parseFields(readFileSync(listingPath, 'utf8'))
    for (const id of REQUIRED) if (!fields.has(id)) failures.push(`${id}: missing from ${listingPath}`)

    for (const [id, field] of fields) {
        // Code points, not UTF-16 units: the stores count "•" and "©" as one character each.
        const actual = [...field.text].length
        const storeLimit = LIMITS[id] ?? null
        if (storeLimit !== null && field.limit !== storeLimit) {
            failures.push(`${id}: limit written as ${field.limit}, store limit is ${storeLimit}`)
        }
        if (field.limit !== null) {
            if (field.length !== actual) failures.push(`${id}: Length says ${field.length}, text has ${actual}`)
            if (actual > field.limit) failures.push(`${id}: ${actual} characters, over the limit of ${field.limit}`)
        }
        const platformBans = id.startsWith('ios.') ? BANNED_IOS : BANNED_PLAY
        for (const pattern of [...BANNED_EVERYWHERE, ...platformBans]) {
            const hit = field.text.match(pattern)
            if (hit) failures.push(`${id}: banned word "${hit[0]}"`)
        }
        if (id === 'ios.keywords' && /\s/.test(field.text)) failures.push(`${id}: keywords contain whitespace`)
    }
}

function flattenValues(node, out) {
    if (typeof node === 'string') out.add(node)
    else if (node && typeof node === 'object') for (const value of Object.values(node)) flattenValues(value, out)
    return out
}

function checkReviewNotes() {
    const labels = flattenValues(JSON.parse(readFileSync(enPath, 'utf8')), new Set())
    const notes = readFileSync(reviewNotesPath, 'utf8')
    // Straight and curly double quotes both mark a UI label in the notes.
    for (const match of notes.matchAll(/"([^"\n]+)"|“([^”\n]+)”/g)) {
        const label = match[1] ?? match[2]
        if (!labels.has(label)) failures.push(`review-notes: "${label}" is not a value in en.json`)
    }
}

checkListing()
checkReviewNotes()

if (failures.length > 0) {
    for (const failure of failures) console.error(failure)
    process.exit(1)
}
console.log('store texts ok')
