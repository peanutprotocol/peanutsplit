// Full-e2e: drive the real UI (Playwright) and assert backend truth via the API.
import { chromium } from '@playwright/test'
import http from 'http'

const UI = 'http://localhost:3051'
const vp = { width: 390, height: 844 }
function api(path) {
	return new Promise((res, rej) => {
		http.get({ host: '127.0.0.1', port: 5051, path }, (r) => {
			let b = ''
			r.on('data', (c) => (b += c))
			r.on('end', () => res(JSON.parse(b)))
		}).on('error', rej)
	})
}
let fails = 0
const check = (name, cond, extra = '') => {
	console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + extra))
	if (!cond) fails++
}
const bal = (st, name) => {
	const m = st.members.find((x) => x.displayName === name)
	return st.balances.find((b) => b.memberId === m.id).netMinor
}

const b = await chromium.launch({ args: ['--no-sandbox'] })
const dev = async () => (await b.newContext({ viewport: vp })).newPage()
try {
	// Konrad creates
	const A = await dev()
	await A.goto(`${UI}/room`, { waitUntil: 'load' })
	await A.waitForFunction(() => document.querySelectorAll('select option').length > 1, { timeout: 20000 })
	await A.getByPlaceholder('Sailing trip').fill('Trip')
	await A.locator('select').selectOption('EUR')
	await A.getByRole('button', { name: 'Create room' }).click()
	await A.waitForURL(/\/room\/.+/, { timeout: 20000 })
	const slug = A.url().split('/room/')[1]
	await A.getByPlaceholder('Your name').fill('Konrad')
	await A.getByRole('button', { name: 'Start splitting' }).click()
	await A.getByRole('button', { name: 'Add expense' }).waitFor({ timeout: 15000 })

	// Bea + Cara join via the same link
	for (const name of ['Bea', 'Cara']) {
		const P = await dev()
		await P.goto(`${UI}/room/${slug}`, { waitUntil: 'load' })
		await P.getByPlaceholder('Your name').fill(name)
		await P.getByRole('button', { name: 'Join' }).click()
		await P.getByRole('button', { name: 'Add expense' }).waitFor({ timeout: 15000 })
	}
	let st = await api(`/split/rooms/${slug}`)
	check('3 members joined via link', st.members.length === 3, `got ${st.members.length}`)

	// Konrad: Dinner €120 equal
	await A.reload({ waitUntil: 'load' })
	const addEqual = async (page, desc, amount) => {
		await page.getByRole('button', { name: 'Add expense' }).click()
		await page.getByPlaceholder('What was it for?').waitFor({ timeout: 8000 })
		await page.getByPlaceholder('What was it for?').fill(desc)
		await page.getByPlaceholder('0.00').first().fill(amount)
		await page.getByRole('button', { name: 'Add expense' }).last().click()
		await page.waitForTimeout(1200)
	}
	await addEqual(A, 'Dinner', '120')

	// Konrad: Taxi €30 exact (Bea 20, Cara 10)
	await A.getByRole('button', { name: 'Add expense' }).click()
	await A.getByPlaceholder('What was it for?').fill('Taxi')
	await A.getByPlaceholder('0.00').first().fill('30')
	await A.getByRole('button', { name: 'Exact amounts' }).click()
	await A.waitForTimeout(300)
	const ins = A.getByPlaceholder('0.00')
	await ins.nth(2).fill('20') // Bea (index 0 = amount, 1 = Konrad, 2 = Bea, 3 = Cara)
	await ins.nth(3).fill('10') // Cara
	await A.getByRole('button', { name: 'Add expense' }).last().click()
	await A.waitForTimeout(1200)

	st = await api(`/split/rooms/${slug}`)
	check('after dinner+taxi: sum zero', st.balances.reduce((a, x) => a + BigInt(x.netMinor), 0n) === 0n)
	// Konrad paid 120 (share 40) + 30 (share 0) => +110; Bea -40-20=-60; Cara -40-10=-50
	check('Konrad +110.00', bal(st, 'Konrad') === '11000', bal(st, 'Konrad'))
	check('Bea -60.00', bal(st, 'Bea') === '-6000', bal(st, 'Bea'))
	check('Cara -50.00', bal(st, 'Cara') === '-5000', bal(st, 'Cara'))

	// Settle up via the UI: mark all suggested transfers paid
	await A.reload({ waitUntil: 'load' })
	await A.getByRole('button', { name: 'Settle up' }).click()
	await A.waitForTimeout(600)
	let guard = 0
	while ((await A.getByRole('button', { name: 'Mark as paid' }).count()) > 0 && guard++ < 6) {
		await A.getByRole('button', { name: 'Mark as paid' }).first().click()
		await A.waitForTimeout(1000)
	}
	st = await api(`/split/rooms/${slug}`)
	check(
		'after settle: everyone zero',
		st.balances.every((x) => x.netMinor === '0'),
		JSON.stringify(st.balances)
	)
	check('after settle: no suggested transfers', st.suggestedTransfers.length === 0)
	check('settlements recorded', st.settlements.length >= 1, `${st.settlements.length}`)

	// --- regression: re-saving a foreign EXACT expense must not drift balances ---
	const req = (method, path, body) =>
		new Promise((res, rej) => {
			const data = body ? JSON.stringify(body) : null
			const r = http.request(
				{
					host: '127.0.0.1',
					port: 5051,
					path,
					method,
					headers: data ? { 'Content-Type': 'application/json' } : {},
				},
				(x) => {
					let b = ''
					x.on('data', (c) => (b += c))
					x.on('end', () => res(JSON.parse(b)))
				}
			)
			r.on('error', rej)
			if (data) r.write(data)
			r.end()
		})
	const dr = await req('POST', '/split/rooms', { baseCurrency: 'EUR', title: 'drift' })
	const dal = (await req('POST', `/split/rooms/${dr.slug}/members`, { displayName: 'Al' })).createdMemberId
	const dbo = (await req('POST', `/split/rooms/${dr.slug}/members`, { displayName: 'Bo' })).createdMemberId
	const made = await req('POST', `/split/rooms/${dr.slug}/expenses`, {
		description: 'Fuel',
		amountMinor: '300000',
		currency: 'THB',
		paidByMemberId: dal,
		splitKind: 'EXACT',
		exactShares: [
			{ memberId: dal, amountMinor: '200000' },
			{ memberId: dbo, amountMinor: '100000' },
		],
	})
	const eid = made.expenses[0].id
	const balBefore = JSON.stringify(made.balances)
	const entered = Object.fromEntries(made.expenses[0].shares.map((s) => [s.memberId, s.enteredAmountMinor]))
	check(
		'foreign EXACT entered amounts round-trip',
		entered[dal] === '200000' && entered[dbo] === '100000',
		JSON.stringify(entered)
	)
	// edit the title only, re-sending the round-tripped entered amounts (what the UI does)
	const edited = await req('PATCH', `/split/rooms/${dr.slug}/expenses/${eid}`, {
		description: 'Fuel v2',
		amountMinor: '300000',
		currency: 'THB',
		paidByMemberId: dal,
		splitKind: 'EXACT',
		exactShares: [
			{ memberId: dal, amountMinor: entered[dal] },
			{ memberId: dbo, amountMinor: entered[dbo] },
		],
	})
	check('foreign EXACT re-save: no balance drift', JSON.stringify(edited.balances) === balBefore)

	console.log(`\nRESULT: ${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
} catch (e) {
	console.log('E2E ERROR:', e.message)
	fails++
} finally {
	await b.close()
}
process.exit(fails === 0 ? 0 : 1)
