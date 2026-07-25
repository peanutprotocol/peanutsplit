/**
 * Pretend to be Peanut confirming a payment.
 *
 * This signs a payload with the local PEANUT_WEBHOOK_SECRET and POSTs it at the
 * real webhook route, so it exercises signature verification, raw-body
 * handling and the real handler. There is deliberately no "simulate" endpoint
 * in the app: an endpoint that skips signature checks is a ledger-write
 * primitive one missing env var away from production, and it would leave the
 * code most likely to be wrong permanently untested.
 *
 *   pnpm --filter @peanut-split/api simulate:webhook <reference> <amountMinor> <currency> [paymentId] [status]
 *
 * Get a reference by tapping "Settle with Peanut" in the UI, or:
 *   curl -X POST localhost:5051/split/rooms/<slug>/settle-intent \
 *     -H 'content-type: application/json' \
 *     -d '{"fromMemberId":"...","toMemberId":"...","amountMinor":"2000"}'
 */

import 'dotenv/config'
import { signWebhook } from '../src/peanut/index'

const [reference, amountMinor, currency, paymentId, status] = process.argv.slice(2)

if (!reference || !amountMinor || !currency) {
	console.error('usage: simulate-peanut-webhook <reference> <amountMinor> <currency> [paymentId] [status]')
	process.exit(1)
}

const secret = process.env.PEANUT_WEBHOOK_SECRET
if (!secret) {
	console.error('PEANUT_WEBHOOK_SECRET is not set — the webhook fails closed without it, as it should')
	process.exit(1)
}

const body = JSON.stringify({
	paymentId: paymentId || `sim_${Date.now().toString(36)}`,
	reference,
	amountMinor,
	currency,
	status: status || 'completed',
})

const url = `${process.env.SPLIT_API_ORIGIN || 'http://localhost:5051'}/webhooks/peanut`
const res = await fetch(url, {
	method: 'POST',
	headers: {
		'content-type': 'application/json',
		'x-peanut-signature': signWebhook(Buffer.from(body, 'utf8'), secret),
	},
	body,
})

console.log(res.status, await res.text())
process.exit(res.ok ? 0 : 1)
