/**
 * The entire Peanut integration. One file on purpose: when the real API
 * details arrive, this is the only thing that changes.
 *
 * ─── WHAT IS REAL AND WHAT IS ASSUMED ────────────────────────────────────
 *
 * Real (locked product decisions):
 *   - Split hands off to an EXISTING Peanut payment-request link. It never
 *     calls a bespoke Peanut endpoint and holds no funds.
 *   - Peanut calls back when the payment completes, and that callback is what
 *     turns a settle-up into a verified receipt in the room.
 *
 * Assumed, because we do not have Peanut's API docs yet — every one of these
 * is a guess, isolated here so it can be corrected without touching anything
 * else:
 *   - The pay URL shape. Driven by PEANUT_PAY_URL_TEMPLATE, default below.
 *   - The webhook payload field names. See `parseWebhook`.
 *   - The signature scheme: HMAC-SHA256 over the raw body, hex, in the
 *     `x-peanut-signature` header. This is the common shape (Stripe, GitHub,
 *     Shopify all do a variant of it) but it is still a guess.
 *
 * When the real docs land: keep the exported surface, rewrite the bodies, and
 * the rest of the codebase is unaffected.
 */

import { createHmac, timingSafeEqual } from 'crypto'

/** Where the payer is sent to actually pay. */
export type PayIntent = {
	/** Opaque handle that must survive the round trip and come back on the webhook. */
	reference: string
	amountMinor: bigint
	currency: string
	/**
	 * Human label for the payment, so the payer recognises what they're paying
	 * for. This is the room title — user-authored text that WILL reach Peanut
	 * and may appear in a memo, a receipt or a support console. Room titles are
	 * not supposed to contain personal details, but nothing stops one; it is
	 * truncated, and it is the only room-authored string that crosses over.
	 * The slug never does.
	 */
	note: string
}

/**
 * Placeholders: {amount} major units, {currency}, {reference}, {note}.
 *
 * `{reference}` is the load-bearing one — whatever Peanut echoes back to us
 * has to contain it, or a completed payment can't be matched to a room.
 */
const DEFAULT_PAY_URL_TEMPLATE =
	'https://peanut.me/request?amount={amount}&currency={currency}&ref={reference}&note={note}'

const DECIMALS: Record<string, number> = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0 }

function toMajor(amountMinor: bigint, currency: string): string {
	const decimals = DECIMALS[currency.toUpperCase()] ?? 2
	if (decimals === 0) return amountMinor.toString()
	const s = amountMinor.toString().padStart(decimals + 1, '0')
	return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`
}

export function buildPayUrl(intent: PayIntent): string {
	const template = process.env.PEANUT_PAY_URL_TEMPLATE || DEFAULT_PAY_URL_TEMPLATE
	return template
		.replace('{amount}', encodeURIComponent(toMajor(intent.amountMinor, intent.currency)))
		.replace('{currency}', encodeURIComponent(intent.currency))
		.replace('{reference}', encodeURIComponent(intent.reference))
		.replace('{note}', encodeURIComponent(intent.note.slice(0, 60)))
}

export type WebhookPayment = {
	/** Peanut's id for the payment. Our idempotency anchor. */
	paymentId: string
	/** The reference we handed out at intent time. */
	reference: string
	amountMinor: bigint
	currency: string
	status: string
}

export class WebhookError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message)
	}
}

/**
 * Verify the callback really came from Peanut.
 *
 * Over the RAW BYTES, never a re-serialized object: JSON.stringify will not
 * reproduce the sender's exact bytes (key order, unicode escaping, number
 * formatting all differ) and the signature would fail for correct payloads.
 */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): void {
	const secret = process.env.PEANUT_WEBHOOK_SECRET
	// Fail closed. An unsigned webhook endpoint is a ledger-write primitive for
	// anyone who finds the URL.
	if (!secret) throw new WebhookError(503, 'webhook not configured')
	if (!signatureHeader) throw new WebhookError(401, 'missing signature')

	const expected = createHmac('sha256', secret).update(rawBody).digest()
	const given = Buffer.from(signatureHeader.trim().replace(/^sha256=/, ''), 'hex')
	// timingSafeEqual throws on a length mismatch, so check length first.
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		throw new WebhookError(401, 'bad signature')
	}
}

/** Sign a payload the way we expect Peanut to. Used by the simulate script and the tests. */
export function signWebhook(rawBody: Buffer, secret: string): string {
	return createHmac('sha256', secret).update(rawBody).digest('hex')
}

/**
 * Pull the fields we need out of Peanut's payload.
 *
 * Amount, currency and status are read from HERE and not from our own intent,
 * deliberately: the receipt claims a payment of this size completed, so that
 * claim has to rest on what the payment processor said, not on what a caller
 * asked us to sign earlier.
 */
export function parseWebhook(payload: unknown): WebhookPayment {
	if (typeof payload !== 'object' || payload === null) throw new WebhookError(400, 'malformed payload')
	const p = payload as Record<string, unknown>

	const paymentId = str(p.paymentId ?? p.id)
	const reference = str(p.reference ?? p.ref)
	const status = str(p.status)
	const currency = str(p.currency)
	const rawAmount = p.amountMinor ?? p.amount_minor
	if (!paymentId || !reference || !status || !currency || rawAmount === undefined) {
		throw new WebhookError(400, 'payload missing required fields')
	}
	let amountMinor: bigint
	try {
		amountMinor = BigInt(String(rawAmount))
	} catch {
		throw new WebhookError(400, 'amountMinor is not an integer')
	}
	return { paymentId, reference, amountMinor, currency, status }
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

/** Explicit allowlist — never `!== 'failed'`, which treats an unknown status as success. */
export function isCompleted(status: string): boolean {
	return status.toLowerCase() === 'completed'
}

/**
 * Peanut payment ids are opaque and could be long (a URL, a chain-prefixed tx
 * hash); the idempotency column is VARCHAR(64). Hash into a fixed-width key,
 * namespaced so a client can never pre-claim a key that a real webhook will
 * later need.
 */
export function idempotencyKeyFor(paymentId: string): string {
	const digest = createHmac('sha256', 'peanut-split-idempotency').update(paymentId).digest('hex')
	return `peanut:${digest.slice(0, 48)}`
}
