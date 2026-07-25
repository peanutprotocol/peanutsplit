// Currency metadata for expense-splitting rooms.
//
// `usdPerUnit` is an INDICATIVE reference value (USD per 1 major unit) used
// only to net mixed-currency balances for display — see getReferenceRate in
// ./fx. It is NOT a settlement rate; real money movement (paying via Peanut)
// uses a live quote at settle time.

export type CurrencyMeta = {
	/** Fraction digits in the smallest unit (2 = cents, 0 = whole units). */
	decimals: number
	/** Indicative USD value of one major unit. Reference only. */
	usdPerUnit: number
	symbol: string
	name: string
}

export const CURRENCIES: Record<string, CurrencyMeta> = {
	USD: { decimals: 2, usdPerUnit: 1, symbol: '$', name: 'US Dollar' },
	EUR: { decimals: 2, usdPerUnit: 1.08, symbol: '€', name: 'Euro' },
	GBP: { decimals: 2, usdPerUnit: 1.27, symbol: '£', name: 'British Pound' },
	CHF: { decimals: 2, usdPerUnit: 1.12, symbol: 'CHF', name: 'Swiss Franc' },
	CAD: { decimals: 2, usdPerUnit: 0.73, symbol: 'CA$', name: 'Canadian Dollar' },
	AUD: { decimals: 2, usdPerUnit: 0.66, symbol: 'AU$', name: 'Australian Dollar' },
	JPY: { decimals: 0, usdPerUnit: 0.0067, symbol: '¥', name: 'Japanese Yen' },
	THB: { decimals: 2, usdPerUnit: 0.028, symbol: '฿', name: 'Thai Baht' },
	SGD: { decimals: 2, usdPerUnit: 0.74, symbol: 'S$', name: 'Singapore Dollar' },
	MYR: { decimals: 2, usdPerUnit: 0.21, symbol: 'RM', name: 'Malaysian Ringgit' },
	IDR: { decimals: 0, usdPerUnit: 0.000063, symbol: 'Rp', name: 'Indonesian Rupiah' },
	VND: { decimals: 0, usdPerUnit: 0.00004, symbol: '₫', name: 'Vietnamese Dong' },
	INR: { decimals: 2, usdPerUnit: 0.012, symbol: '₹', name: 'Indian Rupee' },
	MXN: { decimals: 2, usdPerUnit: 0.058, symbol: 'MX$', name: 'Mexican Peso' },
	BRL: { decimals: 2, usdPerUnit: 0.2, symbol: 'R$', name: 'Brazilian Real' },
	ARS: { decimals: 2, usdPerUnit: 0.0011, symbol: 'AR$', name: 'Argentine Peso' },
	COP: { decimals: 2, usdPerUnit: 0.00025, symbol: 'CO$', name: 'Colombian Peso' },
	CLP: { decimals: 0, usdPerUnit: 0.00105, symbol: 'CL$', name: 'Chilean Peso' },
	PHP: { decimals: 2, usdPerUnit: 0.017, symbol: '₱', name: 'Philippine Peso' },
	ZAR: { decimals: 2, usdPerUnit: 0.054, symbol: 'R', name: 'South African Rand' },
	AED: { decimals: 2, usdPerUnit: 0.27, symbol: 'AED', name: 'UAE Dirham' },
	TRY: { decimals: 2, usdPerUnit: 0.031, symbol: '₺', name: 'Turkish Lira' },
}

export function isSupportedCurrency(code: string): boolean {
	return code in CURRENCIES
}

/** Fraction digits for a currency (defaults to 2 for unknown codes). */
export function currencyDecimals(code: string): number {
	return CURRENCIES[code]?.decimals ?? 2
}
