/**
 * Peanut's payment-completed callback — the thing that turns a settle-up into
 * a verified receipt in the room.
 *
 * Mounted at `/webhooks/peanut`, deliberately OUTSIDE the `/split/*` prefix:
 * the UI proxies `/_split/*` straight through to `/split/*`, so anything under
 * that prefix is reachable from a browser on the app's own origin. A route
 * that writes confirmed payments should not be.
 *
 * Status codes here are about the SENDER, not about us. Peanut retries on a
 * non-2xx, so only "we can't trust or read this" is an error:
 *   401/400 — bad signature, unparseable body
 *   200     — everything else, including problems on our side
 * A room that vanished, an amount that doesn't match, a member since removed:
 * all get logged loudly and answered 200, because making Peanut redeliver
 * forever won't fix any of them.
 */

import { Type } from '@sinclair/typebox'

import { app } from '../../app'
import { logger } from '../../utils'
import { confirmPeanutSettlement } from '../../db/split'
import { idempotencyKeyFor, isCompleted, parseWebhook, verifyWebhookSignature, WebhookError } from '../../peanut'

// Registered as a plugin so the raw-body parser below is ENCAPSULATED. Adding
// it to the root instance replaces JSON parsing for every route in the app, and
// every other endpoint starts receiving a Buffer where it expects an object.
export default app.register(async (webhooks) => {
	// The signature is over the exact bytes Peanut sent. Re-serializing the
	// parsed object would not reproduce them (key order, unicode escaping,
	// number formatting), so the raw buffer is kept and parsed by hand.
	webhooks.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
		done(null, body)
	})

	webhooks.post(
		'/webhooks/peanut',
		{
			// 64KB is generous for a payment callback and keeps an unauthenticated
			// endpoint from being a memory-pressure lever.
			bodyLimit: 64 * 1024,
			schema: {
				response: {
					200: Type.Object({ ok: Type.Boolean() }),
					400: Type.Object({ message: Type.String() }),
					401: Type.Object({ message: Type.String() }),
					503: Type.Object({ message: Type.String() }),
				},
			},
		},
		async (request, reply) => {
			const raw = request.body as Buffer

			try {
				verifyWebhookSignature(raw, request.headers['x-peanut-signature'] as string | undefined)
			} catch (err) {
				if (err instanceof WebhookError) {
					logger.warn({ status: err.status, msg: err.message }, 'rejected peanut webhook')
					return reply.status(err.status).send({ message: err.message })
				}
				throw err
			}

			let payment
			try {
				payment = parseWebhook(JSON.parse(raw.toString('utf8')))
			} catch (err) {
				logger.warn({ err }, 'unreadable peanut webhook body')
				return reply.status(400).send({ message: 'malformed payload' })
			}

			if (!isCompleted(payment.status)) {
				// Pending, failed, refunded — nothing to record, nothing wrong.
				logger.info({ paymentId: payment.paymentId, status: payment.status }, 'peanut webhook ignored')
				return reply.send({ ok: true })
			}

			const result = await confirmPeanutSettlement({
				reference: payment.reference,
				paymentId: payment.paymentId,
				idempotencyKey: idempotencyKeyFor(payment.paymentId),
				amountMinor: payment.amountMinor,
				currency: payment.currency,
			})

			switch (result.outcome) {
				case 'recorded':
					logger.info(
						{ paymentId: payment.paymentId, overpaidBy: result.overpaidBy.toString() },
						'peanut settlement recorded'
					)
					break
				case 'already-recorded':
					logger.info({ paymentId: payment.paymentId }, 'peanut settlement already recorded')
					break
				// The three below mean real money moved and we did NOT record it.
				// They need a human, which is why they are logged at error level
				// even though the response is a 200.
				case 'unknown-reference':
					logger.error(
						{ paymentId: payment.paymentId, reference: payment.reference },
						'peanut webhook: no matching intent'
					)
					break
				case 'amount-mismatch':
					logger.error(
						{
							paymentId: payment.paymentId,
							expected: result.expected.toString(),
							got: result.got.toString(),
						},
						'peanut webhook: amount does not match the intent'
					)
					break
				case 'currency-mismatch':
					logger.error(
						{ paymentId: payment.paymentId, expected: result.expected, got: result.got },
						'peanut webhook: currency does not match the room'
					)
					break
			}

			return reply.send({ ok: true })
		}
	)
})
