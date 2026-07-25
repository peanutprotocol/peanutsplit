/**
 * Every room gets its own artwork, derived from its name.
 *
 * A room link is shared into a group chat, and the unfurl is the only thing
 * most people see before deciding whether to tap. Generic previews all look
 * alike; a picture that is visibly *about this trip* is what makes the link
 * worth opening — which is the whole distribution mechanic.
 *
 * ─── PROCEDURAL NOW, GENERATED LATER ──────────────────────────────────────
 * This picks a palette and a motif from the room name, deterministically and
 * with no network call: the same name always gets the same art, and rendering
 * costs nothing. The intended V2 is a generated illustration (the Nano Banana
 * pipeline in mono/skills/badges-recraft), where a "sailing trip" room gets an
 * actual illustration of the mascot sailing.
 *
 * To swap it in, keep `roomArt()`'s signature and return an `imageUrl` from the
 * generated asset; `motif` and `palette` stay as the fallback for when
 * generation hasn't finished or has failed. Nothing else needs to change —
 * both the room header and the link preview read this one function.
 */

export type RoomArt = {
	/** Background wash and ink, chosen so text on top always has contrast. */
	palette: { from: string; to: string; ink: string }
	/** The emoji standing in for a generated illustration. */
	motif: string
	/** Seeded 0..1 values for placing decorative elements without a PRNG import. */
	scatter: number[]
}

/** Deterministic 32-bit hash. Same name in, same art out, on server and client. */
function hash(input: string): number {
	let h = 2166136261
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return h >>> 0
}

// Keyword → motif. Deliberately small and literal: a room called "Sailing
// trip" should get a boat, and anything unrecognised falls through to the
// hash-picked motif rather than to a shrug.
const KEYWORDS: [RegExp, string][] = [
	[/sail|boat|yacht|marina|cruise/i, '⛵'],
	[/ski|snow|alps|chalet|winter/i, '🎿'],
	[/beach|surf|island|bali|coast/i, '🏝️'],
	[/flat|house|home|rent|apartment|roomie|roommate/i, '🏠'],
	[/dinner|lunch|food|restaurant|pizza|sushi|bbq|brunch/i, '🍝'],
	[/bar|beer|pub|wine|drinks|cocktail/i, '🍻'],
	[/road|car|drive|van|camp/i, '🚐'],
	[/festival|party|birthday|wedding|stag|hen/i, '🎉'],
	[/hike|mountain|trek|climb|trail/i, '⛰️'],
	[/city|weekend|trip|holiday|vacation|travel/i, '✈️'],
	[/coffee|cafe/i, '☕'],
	[/gym|padel|tennis|football|match/i, '🏓'],
]

const FALLBACK_MOTIFS = ['🥜', '🌴', '🗺️', '🎒', '🧭', '🛎️', '🍹', '🚀']

const PALETTES: RoomArt['palette'][] = [
	{ from: '#9D7EFE', to: '#EFE4FF', ink: '#2A1A5E' },
	{ from: '#FFC900', to: '#FFF4CC', ink: '#5C4600' },
	{ from: '#98E9AB', to: '#EAFBEE', ink: '#12492A' },
	{ from: '#5883FF', to: '#E9EEFB', ink: '#10265E' },
	{ from: '#E99898', to: '#FBEAEA', ink: '#5E1A1A' },
	{ from: '#23A094', to: '#D6F2EF', ink: '#0B3E39' },
]

export function roomArt(roomName: string | null): RoomArt {
	const name = (roomName ?? '').trim() || 'Peanut Split'
	const h = hash(name)

	const keyword = KEYWORDS.find(([re]) => re.test(name))
	const motif = keyword ? keyword[1] : FALLBACK_MOTIFS[h % FALLBACK_MOTIFS.length]
	const palette = PALETTES[(h >>> 8) % PALETTES.length]

	// Six stable pseudo-random values, derived by walking the hash rather than
	// seeding a generator — enough to scatter decoration without a dependency.
	const scatter = Array.from({ length: 6 }, (_, i) => ((h >>> (i * 3)) % 1000) / 1000)

	return { palette, motif, scatter }
}
