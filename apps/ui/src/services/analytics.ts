/**
 * The measurement layer for Split's one question: does anyone who starts here
 * end up with a Peanut account?
 *
 * Split gets one month to move that number or it gets shut off, so the
 * instrumentation has to be trustworthy before launch — not bolted on after.
 *
 * ─── NO-OP UNTIL A PROVIDER IS CONFIGURED ────────────────────────────────
 * There is no analytics vendor wired up yet. Events are buffered to
 * localStorage and, in development, logged. That means the funnel is fully
 * instrumented at the call sites now, and turning it on later is one function
 * body — `deliver()` — plus a key in the environment.
 *
 * PostHog is the intended destination, in its OWN project rather than Peanut's:
 * Split's numbers must not contaminate the main product's, and a growth
 * experiment that gets killed should take its data namespace with it.
 * When wiring it up:
 *   1. add posthog-js, init with NEXT_PUBLIC_SPLIT_POSTHOG_KEY
 *   2. replace the body of `deliver()` with posthog.capture(name, props)
 *   3. flush anything already buffered (see `flushBuffered`)
 * Nothing at the call sites changes.
 *
 * ─── WHY NO IDENTITY ─────────────────────────────────────────────────────
 * Split has no accounts, and it must not grow one through the back door. Events
 * carry a per-device random id and never a room slug, a member name, or an
 * amount: a slug is the room's access control, and a name is what someone chose
 * to show their friends, not something to ship to a vendor.
 */

const DEVICE_KEY = 'peanut-split:device'
const BUFFER_KEY = 'peanut-split:events'
const BUFFER_LIMIT = 200

/** The funnel, in order. These five names are the contract with the dashboard. */
export type SplitEvent =
	| 'room_created'
	| 'room_opened' // someone followed a shared link
	| 'member_joined' // ...and claimed a name, so they're in
	| 'expense_added'
	| 'settle_opened'
	| 'settle_with_peanut_clicked' // the moment that matters: heading to Peanut
	| 'settle_marked_manually'
	| 'peanut_settlement_confirmed' // came back verified

type Props = Record<string, string | number | boolean>

/** Stable per browser, random, meaningless outside analytics. */
function deviceId(): string {
	if (typeof window === 'undefined') return 'server'
	try {
		let id = localStorage.getItem(DEVICE_KEY)
		if (!id) {
			id = crypto.randomUUID()
			localStorage.setItem(DEVICE_KEY, id)
		}
		return id
	} catch {
		return 'no-storage' // private mode, or storage disabled
	}
}

type BufferedEvent = { name: SplitEvent; props: Props; at: string; device: string }

function buffer(event: BufferedEvent): void {
	try {
		const raw = localStorage.getItem(BUFFER_KEY)
		const events: BufferedEvent[] = raw ? JSON.parse(raw) : []
		events.push(event)
		// Keep the newest. An unbounded buffer in localStorage eventually throws
		// a quota error inside a click handler, which would break the button
		// rather than the analytics.
		localStorage.setItem(BUFFER_KEY, JSON.stringify(events.slice(-BUFFER_LIMIT)))
	} catch {
		// Analytics must never be the reason an action fails.
	}
}

/** The one function to replace when a provider is wired up. */
function deliver(event: BufferedEvent): void {
	if (process.env.NODE_ENV === 'development') {
		console.debug('[split-analytics]', event.name, event.props)
	}
	buffer(event)
}

export function track(name: SplitEvent, props: Props = {}): void {
	if (typeof window === 'undefined') return
	deliver({ name, props, at: new Date().toISOString(), device: deviceId() })
}

/** Everything captured before a provider existed, for backfill. */
export function flushBuffered(): BufferedEvent[] {
	try {
		const raw = localStorage.getItem(BUFFER_KEY)
		return raw ? JSON.parse(raw) : []
	} catch {
		return []
	}
}

/**
 * Where a room came from, so the funnel can tell an organic share in a group
 * chat apart from a seeded one. Read from the URL and kept per device.
 */
export function captureAttribution(): void {
	if (typeof window === 'undefined') return
	try {
		const params = new URLSearchParams(window.location.search)
		const source = params.get('utm_source') ?? params.get('ref')
		if (source) localStorage.setItem('peanut-split:source', source.slice(0, 64))
	} catch {
		// no-op
	}
}

export function attribution(): string {
	if (typeof window === 'undefined') return ''
	try {
		return localStorage.getItem('peanut-split:source') ?? 'organic'
	} catch {
		return 'organic'
	}
}
