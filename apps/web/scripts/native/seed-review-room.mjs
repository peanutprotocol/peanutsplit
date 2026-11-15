#!/usr/bin/env node
/**
 * Creates the room that App Store and Google Play reviewers open (docs/NATIVE-HANDOFF.md, step K2).
 *
 *   node apps/web/scripts/native/seed-review-room.mjs                 # https://peanutsplit.com
 *   node apps/web/scripts/native/seed-review-room.mjs <base-url>      # another deployment
 *   node apps/web/scripts/native/seed-review-room.mjs --dry-run       # print the plan, send nothing
 *
 * It uses only the public API, as the app does: one room create, then one expense create per row
 * below, attributed to the creator through X-Member-Token. Generic first names, no real people.
 *
 * Against production this is a write, so only a person runs it, never CI. Keep the printed link out
 * of the repository: the room link is the room's credential, and it belongs only in the App Review
 * notes and the Play Console "App access" field.
 */

import { randomUUID } from 'node:crypto'

const DEFAULT_BASE_URL = 'https://peanutsplit.com'

const ROOM = {
    name: 'Lisbon weekend',
    currency: 'EUR',
    creatorName: 'Maya',
    memberNames: ['Leo', 'Sam', 'Nora'],
}

/** Amounts are minor units (cents). `among` omitted = everyone in the room, split equally. */
const EXPENSES = [
    { description: 'Dinner at the harbour', amountMinor: '9640', paidBy: 'Maya' },
    { description: 'Groceries', amountMinor: '5430', paidBy: 'Leo' },
    { description: 'Tram day passes', amountMinor: '2560', paidBy: 'Sam' },
    { description: 'Museum tickets', amountMinor: '4500', paidBy: 'Nora', among: ['Maya', 'Leo', 'Nora'] },
    { description: 'Pastries and coffee', amountMinor: '1880', paidBy: 'Maya' },
]

function parseArgs(argv) {
    const args = argv.slice(2)
    const dryRun = args.includes('--dry-run')
    const positional = args.filter((arg) => !arg.startsWith('--'))
    const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--dry-run')
    if (unknown.length > 0 || positional.length > 1) {
        throw new Error(
            `Usage: seed-review-room.mjs [base-url] [--dry-run] (unknown: ${[...unknown, ...positional.slice(1)].join(' ')})`
        )
    }
    const baseUrl = new URL(positional[0] ?? DEFAULT_BASE_URL)
    if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost' && baseUrl.hostname !== '127.0.0.1') {
        throw new Error(`Refusing ${baseUrl.origin}: use https, or localhost for a local server.`)
    }
    return { baseUrl: baseUrl.origin, dryRun }
}

function formatEuro(amountMinor) {
    return `EUR ${(Number(amountMinor) / 100).toFixed(2)}`
}

function printPlan(baseUrl) {
    console.log(`Target: ${baseUrl}`)
    console.log(`Room: "${ROOM.name}" in ${ROOM.currency}, created by ${ROOM.creatorName}`)
    console.log(`Members: ${[ROOM.creatorName, ...ROOM.memberNames].join(', ')}`)
    for (const expense of EXPENSES) {
        const among = expense.among ? expense.among.join(', ') : 'everyone'
        console.log(
            `Expense: ${expense.description}, ${formatEuro(expense.amountMinor)}, paid by ${expense.paidBy}, split among ${among}`
        )
    }
}

async function call(baseUrl, path, init) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        // The room remembers the language it was created in for its link preview.
        headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en', ...init?.headers },
    })
    const text = await response.text()
    if (!response.ok) {
        // The error body names the code and field; it never echoes a member token.
        throw new Error(
            `${init?.method ?? 'GET'} ${path.replace(/\/api\/rooms\/[^/]+/, '/api/rooms/<slug>')} -> ${response.status} ${text.slice(0, 300)}`
        )
    }
    return text ? JSON.parse(text) : null
}

async function seed(baseUrl) {
    const created = await call(baseUrl, '/api/rooms', { method: 'POST', body: JSON.stringify(ROOM) })
    const slug = created.room.slug
    const memberIdByName = new Map(created.members.map((member) => [member.name, member.id]))
    const memberId = (name) => {
        const id = memberIdByName.get(name)
        if (!id) throw new Error(`The created room has no member named ${name}.`)
        return id
    }

    for (const expense of EXPENSES) {
        await call(baseUrl, `/api/rooms/${encodeURIComponent(slug)}/expenses`, {
            method: 'POST',
            headers: { 'X-Member-Token': created.memberToken },
            body: JSON.stringify({
                // One key per expense makes a retried request a no-op on the server.
                clientKey: randomUUID(),
                description: expense.description,
                amountMinor: expense.amountMinor,
                currency: ROOM.currency,
                paidById: memberId(expense.paidBy),
                splitMode: 'EQUAL',
                ...(expense.among ? { participantIds: expense.among.map(memberId) } : {}),
            }),
        })
    }

    // Reviewers are told receipt scan works; this shows whether the deployment has it on.
    const scan = await call(baseUrl, `/api/rooms/${encodeURIComponent(slug)}/receipt-parse`).catch(() => null)

    console.log('')
    console.log(`Room link: ${baseUrl}/r/${slug}`)
    console.log(`Slug: ${slug}`)
    console.log(`Receipt scan enabled: ${scan?.enabled === true ? 'yes' : 'NO (check before submitting)'}`)
    console.log('Paste the link only into the App Review notes and the Play Console App access field.')
}

async function main() {
    if (process.env.CI) {
        console.error('seed-review-room.mjs writes a real room; it never runs in CI.')
        process.exit(1)
    }
    const { baseUrl, dryRun } = parseArgs(process.argv)
    printPlan(baseUrl)
    if (dryRun) {
        console.log('')
        console.log('Dry run: no request sent.')
        return
    }
    console.log('')
    await seed(baseUrl)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
