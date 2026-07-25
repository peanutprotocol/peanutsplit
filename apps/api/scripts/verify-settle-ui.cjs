/**
 * Drives the real settle-with-Peanut flow through a real browser and asserts
 * BACKEND state, not just what's on screen.
 *
 * Run from a directory that has playwright available (engineering/qa in mono):
 *   node verify-settle-ui.cjs
 *
 * Assumes API on :5051 and UI on :3051 with PEANUT_WEBHOOK_SECRET=local-dev-secret.
 */
const { chromium } = require('playwright')
const { createHmac } = require('crypto')

const API = 'http://localhost:5051/split'
const HOOK = 'http://localhost:5051/webhooks/peanut'
const UI = 'http://localhost:3051'
const SECRET = process.env.PEANUT_WEBHOOK_SECRET || 'local-dev-secret'
const SHOTS = process.env.SHOT_DIR || '/tmp'

let pass = 0
let fail = 0
const ok = (label, actual, expected) => {
	if (String(actual) === String(expected)) {
		console.log(`  PASS  ${label} (${actual})`)
		pass++
	} else {
		console.log(`  FAIL  ${label} — expected ${expected}, got ${actual}`)
		fail++
	}
}

const post = (url, body, headers = {}) =>
	fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body),
	})

async function main() {
	// Seed a room with a real debt: Bob fronts 40, split two ways.
	const room = await (await post(`${API}/rooms`, { title: 'Sailing trip', baseCurrency: 'EUR' })).json()
	const slug = room.slug
	const alice = (await (await post(`${API}/rooms/${slug}/members`, { displayName: 'Alice' })).json()).createdMemberId
	const bob = (await (await post(`${API}/rooms/${slug}/members`, { displayName: 'Bob' })).json()).createdMemberId
	await post(`${API}/rooms/${slug}/expenses`, {
		description: 'Marina fees',
		amountMinor: '4000',
		currency: 'EUR',
		splitKind: 'EQUAL',
		paidByMemberId: bob,
	})

	const browser = await chromium.launch()
	const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
	// Claim Alice's identity the way the app does, then load the room.
	await page.goto(`${UI}/room/${slug}`)
	await page.evaluate(([s, id]) => localStorage.setItem(`peanut-split:member:${s}`, id), [slug, alice])
	await page.reload({ waitUntil: 'networkidle' })

	// Peanut's checkout is a placeholder URL that won't resolve, so keep the
	// popup from actually navigating and capture where it was sent instead.
	let payUrl = null
	await page.context().route('**/*', (route) => {
		const url = route.request().url()
		if (url.includes('peanut.me/request')) {
			payUrl = url
			return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>peanut checkout</h1>' })
		}
		return route.continue()
	})

	await page
		.getByRole('button', { name: /settle up/i })
		.first()
		.click()
	await page.waitForTimeout(600)
	await page.screenshot({ path: `${SHOTS}/settle-drawer.png` })

	const cta = page.getByRole('button', { name: /Settle .* with Peanut/i })
	ok('Peanut CTA is shown with the amount', await cta.isVisible(), 'true')
	// Bob fronted 40 split two ways, so Alice's half is 20 — the CTA must name
	// what she owes, not what was spent.
	ok('CTA names what Alice owes, not the bill total', (await cta.textContent()).includes('20'), 'true')

	await cta.click()
	await page.waitForTimeout(1500)

	const afterIntent = await (await fetch(`${API}/rooms/${slug}`)).json()
	ok('backend recorded a pending intent', afterIntent.pendingSettleIntents.length, 1)
	ok('no settlement yet — nothing is claimed until Peanut confirms', afterIntent.settlements.length, 0)
	ok('payer was sent to a pay URL', payUrl !== null, 'true')
	ok('pay URL does not leak the room slug', payUrl && !payUrl.includes(slug), 'true')

	await page.waitForTimeout(500)
	await page.screenshot({ path: `${SHOTS}/settle-pending.png` })
	ok('room shows the payment in flight', await page.getByText(/Waiting for Peanut/i).isVisible(), 'true')

	// Peanut confirms.
	const reference = afterIntent.pendingSettleIntents[0].reference
	const body = JSON.stringify({
		paymentId: 'pay_ui_test',
		reference,
		amountMinor: '2000',
		currency: 'EUR',
		status: 'completed',
	})
	const hookRes = await fetch(HOOK, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-peanut-signature': createHmac('sha256', SECRET).update(Buffer.from(body, 'utf8')).digest('hex'),
		},
		body,
	})
	ok('webhook accepted', hookRes.status, 200)

	// The 8s poll should pull the receipt in without any interaction.
	await page.waitForTimeout(9000)
	await page.screenshot({ path: `${SHOTS}/settle-receipt.png` })

	const final = await (await fetch(`${API}/rooms/${slug}`)).json()
	ok('settlement recorded as PEANUT', final.settlements.filter((s) => s.method === 'PEANUT').length, 1)
	ok('pending cleared', final.pendingSettleIntents.length, 0)
	ok(
		'balances net to zero',
		final.balances.reduce((n, b) => n + Math.abs(Number(b.netMinor)), 0),
		0
	)
	ok('receipt appears in the room without a reload', await page.getByText(/Confirmed by Peanut/i).isVisible(), 'true')
	ok(
		'room reads as settled up',
		await page
			.getByText(/all settled up/i)
			.first()
			.isVisible(),
		'true'
	)

	await browser.close()
	console.log(`\npassed=${pass} failed=${fail}`)
	process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
	console.error('ERR', e)
	process.exit(1)
})
