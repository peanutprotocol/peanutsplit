import { describe, expect, test, beforeEach, afterEach } from '@jest/globals'
import {
	buildPayUrl,
	idempotencyKeyFor,
	isCompleted,
	parseWebhook,
	signWebhook,
	verifyWebhookSignature,
	WebhookError,
} from './index'

const SECRET = 'test-secret'
const original = process.env.PEANUT_WEBHOOK_SECRET

beforeEach(() => {
	process.env.PEANUT_WEBHOOK_SECRET = SECRET
})
afterEach(() => {
	if (original === undefined) delete process.env.PEANUT_WEBHOOK_SECRET
	else process.env.PEANUT_WEBHOOK_SECRET = original
	delete process.env.PEANUT_PAY_URL_TEMPLATE
})

const body = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8')

describe('webhook signature', () => {
	const raw = body({
		paymentId: 'pay_1',
		reference: 'ref_1',
		amountMinor: '2000',
		currency: 'EUR',
		status: 'completed',
	})

	test('accepts a correctly signed body', () => {
		expect(() => verifyWebhookSignature(raw, signWebhook(raw, SECRET))).not.toThrow()
	})

	test('accepts the sha256= prefixed form', () => {
		expect(() => verifyWebhookSignature(raw, `sha256=${signWebhook(raw, SECRET)}`)).not.toThrow()
	})

	test('rejects a body tampered with after signing', () => {
		const sig = signWebhook(raw, SECRET)
		const tampered = body({
			paymentId: 'pay_1',
			reference: 'ref_1',
			amountMinor: '999999',
			currency: 'EUR',
			status: 'completed',
		})
		expect(() => verifyWebhookSignature(tampered, sig)).toThrow(WebhookError)
	})

	test('rejects a signature made with a different secret', () => {
		expect(() => verifyWebhookSignature(raw, signWebhook(raw, 'other-secret'))).toThrow(/bad signature/)
	})

	test('rejects a missing signature', () => {
		expect(() => verifyWebhookSignature(raw, undefined)).toThrow(/missing signature/)
	})

	test('rejects a truncated signature rather than crashing on length', () => {
		expect(() => verifyWebhookSignature(raw, signWebhook(raw, SECRET).slice(0, 20))).toThrow(WebhookError)
	})

	test('rejects a non-hex signature', () => {
		expect(() => verifyWebhookSignature(raw, 'zzzz')).toThrow(WebhookError)
	})

	test('fails closed when no secret is configured', () => {
		delete process.env.PEANUT_WEBHOOK_SECRET
		expect(() => verifyWebhookSignature(raw, signWebhook(raw, SECRET))).toThrow(/not configured/)
	})

	test('signs over exact bytes, so re-serialization does not verify', () => {
		// Same data, different byte order on the wire. Signing a re-serialized
		// object instead of the raw bytes is the classic webhook bug.
		const asSent = Buffer.from('{"reference":"ref_1","paymentId":"pay_1"}', 'utf8')
		const reserialized = Buffer.from(JSON.stringify(JSON.parse(asSent.toString())), 'utf8')
		const reordered = Buffer.from('{"paymentId":"pay_1","reference":"ref_1"}', 'utf8')
		expect(reserialized.equals(reordered)).toBe(false)
		expect(() => verifyWebhookSignature(reordered, signWebhook(asSent, SECRET))).toThrow()
	})
})

describe('parseWebhook', () => {
	test('reads the fields we need', () => {
		const p = parseWebhook({
			paymentId: 'pay_1',
			reference: 'ref_1',
			amountMinor: '2000',
			currency: 'EUR',
			status: 'completed',
		})
		expect(p).toEqual({
			paymentId: 'pay_1',
			reference: 'ref_1',
			amountMinor: 2000n,
			currency: 'EUR',
			status: 'completed',
		})
	})

	test('accepts the id/ref/amount_minor aliases', () => {
		const p = parseWebhook({ id: 'pay_2', ref: 'ref_2', amount_minor: 500, currency: 'USD', status: 'completed' })
		expect(p.paymentId).toBe('pay_2')
		expect(p.reference).toBe('ref_2')
		expect(p.amountMinor).toBe(500n)
	})

	test('rejects a payload missing required fields', () => {
		expect(() => parseWebhook({ paymentId: 'pay_1' })).toThrow(WebhookError)
	})

	test('rejects a non-integer amount', () => {
		expect(() =>
			parseWebhook({ paymentId: 'p', reference: 'r', amountMinor: '12.34', currency: 'EUR', status: 'completed' })
		).toThrow(WebhookError)
	})

	test('rejects a non-object payload', () => {
		expect(() => parseWebhook('nope')).toThrow(WebhookError)
		expect(() => parseWebhook(null)).toThrow(WebhookError)
	})
})

describe('isCompleted', () => {
	test('only completed counts', () => {
		expect(isCompleted('completed')).toBe(true)
		expect(isCompleted('COMPLETED')).toBe(true)
	})

	test('an unknown status is not success', () => {
		// The bug this guards: `status !== 'failed'` would treat every one of
		// these as money received.
		for (const s of ['pending', 'processing', 'failed', 'refunded', 'disputed', 'weird_new_state', '']) {
			expect(isCompleted(s)).toBe(false)
		}
	})
})

describe('buildPayUrl', () => {
	test('renders minor units as major and escapes the note', () => {
		const url = buildPayUrl({ reference: 'r e f', amountMinor: 7778n, currency: 'EUR', note: 'Sailing trip & co' })
		expect(url).toContain('amount=77.78')
		expect(url).toContain('currency=EUR')
		expect(url).toContain('ref=r%20e%20f')
		expect(url).toContain('note=Sailing%20trip%20%26%20co')
	})

	test('respects zero-decimal currencies', () => {
		expect(buildPayUrl({ reference: 'r', amountMinor: 3000n, currency: 'JPY', note: 'n' })).toContain('amount=3000')
	})

	test('pads amounts below one major unit', () => {
		expect(buildPayUrl({ reference: 'r', amountMinor: 5n, currency: 'EUR', note: 'n' })).toContain('amount=0.05')
	})

	test('is driven by the env template', () => {
		process.env.PEANUT_PAY_URL_TEMPLATE = 'https://example.test/pay/{reference}?a={amount}'
		expect(buildPayUrl({ reference: 'abc', amountMinor: 100n, currency: 'EUR', note: 'n' })).toBe(
			'https://example.test/pay/abc?a=1.00'
		)
	})
})

describe('idempotencyKeyFor', () => {
	test('fits the column and is namespaced', () => {
		const key = idempotencyKeyFor('a'.repeat(400))
		expect(key.length).toBeLessThanOrEqual(64)
		expect(key.startsWith('peanut:')).toBe(true)
	})

	test('is stable per payment and distinct across payments', () => {
		expect(idempotencyKeyFor('pay_1')).toBe(idempotencyKeyFor('pay_1'))
		expect(idempotencyKeyFor('pay_1')).not.toBe(idempotencyKeyFor('pay_2'))
	})
})
