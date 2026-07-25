/**
 * Walks the whole funnel in a browser and asserts every step actually emitted
 * its event, by reading the analytics buffer out of localStorage.
 *
 * The one number Split is judged on is derived from these events, so "we added
 * the tracking calls" isn't good enough — an event that silently doesn't fire
 * looks exactly like a user who didn't convert.
 *
 * Run from a directory with playwright available (mono/engineering/qa).
 */
const { chromium } = require('playwright')
const { createHmac } = require('crypto')

const API = 'http://localhost:5051/split'
const HOOK = 'http://localhost:5051/webhooks/peanut'
const UI = 'http://localhost:3051'
const SECRET = process.env.PEANUT_WEBHOOK_SECRET || 'local-dev-secret'

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

const events = (page) =>
	page.evaluate(() => {
		try {
			return JSON.parse(localStorage.getItem('peanut-split:events') || '[]')
		} catch {
			return []
		}
	})
const names = async (page) => (await events(page)).map((e) => e.name)

async function main() {
	const browser = await chromium.launch()
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
	const page = await ctx.newPage()

	// 1. create a room through the UI, carrying a campaign source
	await page.goto(`${UI}/room?utm_source=nomadlist`, { waitUntil: 'networkidle' })
	await page.getByPlaceholder(/sailing trip/i).fill('Ski trip Chamonix')
	await page.getByRole('button', { name: /create room/i }).click()
	await page.waitForURL(/\/room\/.+/, { timeout: 20000 })
	const slug = page.url().split('/room/')[1]

	ok('room_created fired', (await names(page)).includes('room_created'), 'true')
	ok('room_opened fired on landing in the room', (await names(page)).includes('room_opened'), 'true')

	const created = (await events(page)).find((e) => e.name === 'room_created')
	ok('attribution captured from the link', created.props.source, 'nomadlist')
	ok('event carries no room slug', JSON.stringify(created).includes(slug), 'false')

	// 2. claim a name
	await page.getByPlaceholder(/your name/i).fill('Alice')
	await page.getByRole('button', { name: /start splitting|^join$/i }).click()
	await page.waitForTimeout(1500)
	ok('member_joined fired', (await names(page)).includes('member_joined'), 'true')

	// 3. add an expense someone else will owe on
	const bob = (
		await (
			await fetch(`${API}/rooms/${slug}/members`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ displayName: 'Bob' }),
			})
		).json()
	).createdMemberId
	await page.reload({ waitUntil: 'networkidle' })
	await page
		.getByRole('button', { name: /add expense/i })
		.first()
		.click()
	await page.waitForTimeout(500)
	await page
		.getByPlaceholder(/what was it for/i)
		.first()
		.fill('Chalet')
	await page.getByPlaceholder('0.00').first().fill('40')
	await page
		.getByRole('button', { name: /^add expense$/i })
		.last()
		.click()
	await page.waitForTimeout(2000)
	ok('expense_added fired', (await names(page)).includes('expense_added'), 'true')

	// 4. open settle up and start a Peanut payment
	await page
		.context()
		.route('**/peanut.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }))
	await page
		.getByRole('button', { name: /settle up/i })
		.first()
		.click()
	await page.waitForTimeout(800)
	ok('settle_opened fired', (await names(page)).includes('settle_opened'), 'true')

	const cta = page.getByRole('button', { name: /with Peanut/i }).first()
	if (await cta.isVisible()) {
		await cta.click()
		await page.waitForTimeout(1500)
		ok('settle_with_peanut_clicked fired', (await names(page)).includes('settle_with_peanut_clicked'), 'true')

		// 5. Peanut confirms -> the room should notice on its own poll
		const state = await (await fetch(`${API}/rooms/${slug}`)).json()
		const intent = state.pendingSettleIntents[0]
		if (intent) {
			const body = JSON.stringify({
				paymentId: `pay_funnel_${Date.now()}`,
				reference: intent.reference,
				amountMinor: intent.amountMinor,
				currency: state.baseCurrency,
				status: 'completed',
			})
			await fetch(HOOK, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-peanut-signature': createHmac('sha256', SECRET).update(Buffer.from(body, 'utf8')).digest('hex'),
				},
				body,
			})
			await page.waitForTimeout(10000)
			ok('peanut_settlement_confirmed fired', (await names(page)).includes('peanut_settlement_confirmed'), 'true')
			// The poll runs every 8s; the event must not re-fire on each one.
			await page.waitForTimeout(9000)
			ok(
				'confirmation counted exactly once across polls',
				(await names(page)).filter((n) => n === 'peanut_settlement_confirmed').length,
				1
			)
		} else {
			ok('an intent was created to confirm', 'none', 'one')
		}
	} else {
		ok('Peanut CTA present to click', 'missing', 'present')
	}

	// The whole point of the no-identity rule: nothing personal leaves the device.
	const all = JSON.stringify(await events(page))
	ok('no member names in any event', /Alice|Bob/.test(all), 'false')
	ok('no room slug in any event', all.includes(slug), 'false')

	await browser.close()
	console.log(`\npassed=${pass} failed=${fail}`)
	process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
	console.error('ERR', e)
	process.exit(1)
})
