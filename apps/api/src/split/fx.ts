import { CURRENCIES } from './currencies'

export type ReferenceRate = {
	/** How many units of `to` per 1 unit of `from` (major units). */
	rate: number
	/** Provenance, stored on the expense row (e.g. 'reference-usd', 'peanut'). */
	source: string
}

/**
 * Indicative FX for netting mixed-currency balances — THE PEANUT-FX SEAM.
 *
 * Today it derives a cross-rate from a static USD-anchored reference table so
 * every currency pair works in the spike (Peanut's own FX only covers
 * USD-anchored fiat via Bridge + LatAm via Manteca — it can't price e.g.
 * THB→EUR). When productionizing: try a live Peanut FX quote first here and
 * fall back to this table for pairs Peanut doesn't cover — callers don't change
 * because the return shape already carries `source`.
 *
 * This is display-only. Settling a debt by actually paying via Peanut is a
 * separate real-quote path (locked at settle time), not this function.
 */
export async function getReferenceRate(from: string, to: string): Promise<ReferenceRate> {
	if (from === to) return { rate: 1, source: 'identity' }
	const f = CURRENCIES[from]
	const t = CURRENCIES[to]
	if (!f || !t) {
		throw new Error(`unsupported currency pair for reference FX: ${from}->${to}`)
	}
	// Cross via USD: (USD per `from`) / (USD per `to`) = `to` per `from`.
	return { rate: f.usdPerUnit / t.usdPerUnit, source: 'reference-usd' }
}
