/**
 * The reviewed two-colour member-avatar palettes.
 *
 * A member stores a palette KEY, never arbitrary colours. That keeps every
 * combination readable, lets a palette be retuned without migrating a room,
 * and prevents a room link-holder from introducing an unreadable value. The
 * avatar is deliberately only these two colours: a flat ground and one dark,
 * readable drawing stroke.
 */

export interface AvatarPalette {
    key: string
    name: string
    background: string
    ink: string
}

/**
 * Twenty-four pop combinations approved in the multicolour cast picker.
 * Inner ink is dark and saturated rather than near-white, and every pair meets
 * the WCAG 4.5:1 text-contrast threshold even though these marks are artwork.
 */
export const AVATAR_PALETTES = [
    { key: 'lagoon-grape', name: 'Lagoon grape', background: '#16D6C7', ink: '#4C2BCD' },
    { key: 'bubble-navy', name: 'Bubble navy', background: '#FF77B7', ink: '#173B63' },
    { key: 'acid-violet', name: 'Acid violet', background: '#C8FF28', ink: '#5A2DFF' },
    { key: 'tomato-navy', name: 'Tomato navy', background: '#FF6B5B', ink: '#172B63' },
    { key: 'sun-berry', name: 'Sun berry', background: '#FFD400', ink: '#7A2455' },
    { key: 'lilac-forest', name: 'Lilac forest', background: '#C9B8FF', ink: '#0D4933' },
    { key: 'coral-teal', name: 'Coral teal', background: '#FF9A8B', ink: '#03494D' },
    { key: 'sky-cherry', name: 'Sky cherry', background: '#68D9FF', ink: '#A60F4C' },
    { key: 'orange-cobalt', name: 'Orange cobalt', background: '#FF9A3C', ink: '#1E2E89' },
    { key: 'mint-rust', name: 'Mint rust', background: '#92F0CD', ink: '#8A2828' },
    { key: 'banana-cobalt', name: 'Banana cobalt', background: '#FFE36E', ink: '#2941A3' },
    { key: 'powder-brown', name: 'Powder brown', background: '#A8D8FF', ink: '#6B351F' },
    { key: 'rose-forest', name: 'Rose forest', background: '#FF9DC7', ink: '#174D35' },
    { key: 'lime-burgundy', name: 'Lime burgundy', background: '#B7F34A', ink: '#6F2345' },
    { key: 'peach-navy', name: 'Peach navy', background: '#FFB06E', ink: '#183C67' },
    { key: 'aqua-maroon', name: 'Aqua maroon', background: '#67E2D1', ink: '#7A2447' },
    { key: 'lavender-teal', name: 'Lavender teal', background: '#BBA8FF', ink: '#03494D' },
    { key: 'guava-slate', name: 'Guava slate', background: '#FF7B8A', ink: '#26364F' },
    { key: 'cerulean-brown', name: 'Cerulean brown', background: '#4FC3F7', ink: '#65351F' },
    { key: 'leaf-violet', name: 'Leaf violet', background: '#A8E88B', ink: '#5A2D8C' },
    { key: 'candy-cobalt', name: 'Candy cobalt', background: '#FF8DA1', ink: '#223A93' },
    { key: 'gold-forest', name: 'Gold forest', background: '#F8C64E', ink: '#174F3A' },
    { key: 'periwinkle-plum', name: 'Periwinkle plum', background: '#91A7FF', ink: '#5B254F' },
    { key: 'watermelon-green', name: 'Watermelon green', background: '#FF6E91', ink: '#0D322A' },
] as const satisfies readonly AvatarPalette[]

export type AvatarPaletteKey = (typeof AVATAR_PALETTES)[number]['key']

export const AVATAR_PALETTE_KEYS = AVATAR_PALETTES.map((palette) => palette.key) as AvatarPaletteKey[]

const BY_KEY = new Map<AvatarPaletteKey, (typeof AVATAR_PALETTES)[number]>(
    AVATAR_PALETTES.map((palette) => [palette.key, palette])
)

export const DEFAULT_AVATAR_PALETTE_KEY = 'lagoon-grape' satisfies AvatarPaletteKey

export function isAvatarPaletteKey(value: unknown): value is AvatarPaletteKey {
    return typeof value === 'string' && BY_KEY.has(value as AvatarPaletteKey)
}

/** Never throws; unknown values can safely arrive during a rollback. */
export function avatarPalette(value: unknown): (typeof AVATAR_PALETTES)[number] {
    return (isAvatarPaletteKey(value) && BY_KEY.get(value)) || BY_KEY.get(DEFAULT_AVATAR_PALETTE_KEY)!
}

/** FNV-1a: deterministic in the browser and on the server, with no boot seed. */
function hash(value: string): number {
    let result = 0x811c9dc5
    for (let index = 0; index < value.length; index++) {
        result ^= value.charCodeAt(index)
        result = Math.imul(result, 0x01000193) >>> 0
    }
    return result
}

/**
 * Compatibility colour for members written before palette persistence exists.
 * A character looks the same on every phone, while the optional stored key can
 * override this assignment once the API carries it.
 */
export function avatarPaletteForIdentity(identity: string): (typeof AVATAR_PALETTES)[number] {
    return AVATAR_PALETTES[hash(identity) % AVATAR_PALETTES.length]
}

/** The stored colour, or the exact compatibility colour MemberAvatar renders. */
export function effectiveAvatarPaletteKey(value: unknown, identity: string): AvatarPaletteKey {
    return isAvatarPaletteKey(value) ? value : avatarPaletteForIdentity(identity).key
}

const pick = (random: () => number, count: number): number =>
    count <= 1 ? 0 : Math.min(Math.max(Math.floor(random() * count), 0), count - 1)

/** Draw one concrete palette key, excluding the current key when it is known. */
export function randomAvatarPaletteKey(
    exclude: string | readonly string[] | null = null,
    random: () => number = Math.random
): AvatarPaletteKey {
    const excluded = new Set(typeof exclude === 'string' ? [exclude] : (exclude ?? []))
    const available = AVATAR_PALETTE_KEYS.filter((key) => !excluded.has(key))
    // Once a caller excludes the whole reviewed pool, reuse is better than an
    // undefined colour. Room-aware callers use the perceptual allocator below.
    const candidates = available.length > 0 ? available : AVATAR_PALETTE_KEYS
    return candidates[pick(random, candidates.length)]
}

/**
 * Deal distinct palette keys for a picker hand. Asking for more than the
 * reviewed pool is an error rather than silently breaking the uniqueness rule.
 */
export function dealAvatarPaletteKeys(count: number, random: () => number = Math.random): AvatarPaletteKey[] {
    if (!Number.isInteger(count) || count < 0 || count > AVATAR_PALETTE_KEYS.length) {
        throw new RangeError(`palette deal must be an integer from 0 to ${AVATAR_PALETTE_KEYS.length}`)
    }

    const pool = [...AVATAR_PALETTE_KEYS]
    for (let index = pool.length - 1; index > 0; index--) {
        const swap = pick(random, index + 1)
        const held = pool[index]
        pool[index] = pool[swap]
        pool[swap] = held
    }
    return pool.slice(0, count)
}

interface OklabColor {
    l: number
    a: number
    b: number
}

/** Convert a catalogued sRGB hex colour to perceptually uniform OKLab. */
function avatarColorOklab(hex: string): OklabColor {
    const red = channel(Number.parseInt(hex.slice(1, 3), 16))
    const green = channel(Number.parseInt(hex.slice(3, 5), 16))
    const blue = channel(Number.parseInt(hex.slice(5, 7), 16))
    const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
    const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
    const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
    return {
        l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    }
}

const OKLAB_BY_KEY = new Map(
    AVATAR_PALETTES.map((palette) => [
        palette.key,
        { background: avatarColorOklab(palette.background), ink: avatarColorOklab(palette.ink) },
    ])
)

const colorDistanceSquared = (left: OklabColor, right: OklabColor): number =>
    (left.l - right.l) ** 2 + (left.a - right.a) ** 2 + (left.b - right.b) ** 2

/** OKLab distance across the dominant ground and the smaller drawing stroke. */
export function avatarPaletteDistance(left: AvatarPaletteKey, right: AvatarPaletteKey): number {
    const first = OKLAB_BY_KEY.get(left)!
    const second = OKLAB_BY_KEY.get(right)!
    return Math.sqrt(
        0.8 * colorDistanceSquared(first.background, second.background) +
            0.2 * colorDistanceSquared(first.ink, second.ink)
    )
}

const greedySeparated = (
    candidates: readonly AvatarPaletteKey[],
    anchors: readonly AvatarPaletteKey[]
): AvatarPaletteKey[] => {
    const remaining = [...candidates]
    const chosen: AvatarPaletteKey[] = []
    while (remaining.length > 0) {
        const references = [...anchors, ...chosen]
        let bestIndex = 0
        let bestDistance = -1
        for (let index = 0; index < remaining.length; index++) {
            const candidate = remaining[index]
            const otherReferences = references.filter((key) => key !== candidate)
            const distance =
                otherReferences.length === 0
                    ? Number.POSITIVE_INFINITY
                    : Math.min(...otherReferences.map((key) => avatarPaletteDistance(candidate, key)))
            if (distance > bestDistance) {
                bestDistance = distance
                bestIndex = index
            }
        }
        chosen.push(remaining.splice(bestIndex, 1)[0])
    }
    return chosen
}

/**
 * Room-aware offer colours, in deterministic greedy maximin order.
 *
 * Exact room matches are excluded while at least one catalog colour remains.
 * If fewer colours remain than requested, those safe colours repeat. When a
 * very large room occupies the whole catalog, exact reuse is unavoidable; the
 * fallback still chooses the least visually crowded pairs first.
 */
export function separatedAvatarPaletteKeys(
    count: number,
    occupied: readonly string[] = [],
    reserved: readonly string[] = []
): AvatarPaletteKey[] {
    if (!Number.isInteger(count) || count < 0) throw new RangeError('palette count must be a non-negative integer')
    if (count === 0) return []

    const occupiedKeys = occupied.filter(isAvatarPaletteKey)
    const occupiedSet = new Set(occupiedKeys)
    const reservedSet = new Set(reserved.filter(isAvatarPaletteKey))
    const free = AVATAR_PALETTE_KEYS.filter((key) => !occupiedSet.has(key))

    if (free.length === 0) {
        const reusable = greedySeparated(AVATAR_PALETTE_KEYS, occupiedKeys)
        return Array.from({ length: count }, (_, index) => reusable[index % reusable.length])
    }

    const anchors = [...occupiedKeys, ...reservedSet]
    const firstPass = greedySeparated(
        free.filter((key) => !reservedSet.has(key)),
        anchors
    )
    const result = firstPass.slice(0, count)
    if (result.length === count) return result

    const repeatable = greedySeparated(free, occupiedKeys)
    while (result.length < count) result.push(repeatable[(result.length - firstPass.length) % repeatable.length])
    return result
}

function channel(value: number): number {
    const normalized = value / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

/** Relative luminance for one catalogued six-digit hex colour. */
export function avatarColorLuminance(hex: string): number {
    const red = Number.parseInt(hex.slice(1, 3), 16)
    const green = Number.parseInt(hex.slice(3, 5), 16)
    const blue = Number.parseInt(hex.slice(5, 7), 16)
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

export function avatarPaletteContrast(palette: AvatarPalette): number {
    const background = avatarColorLuminance(palette.background)
    const ink = avatarColorLuminance(palette.ink)
    return (Math.max(background, ink) + 0.05) / (Math.min(background, ink) + 0.05)
}

// Fail at development/build time if a later catalog edit violates the reviewed
// legibility boundary. Tests pin the same rule with useful per-key messages.
for (const palette of AVATAR_PALETTES) {
    if (avatarPaletteContrast(palette) < 4.5 || avatarColorLuminance(palette.ink) >= 0.18) {
        throw new Error(`unsafe avatar palette: ${palette.key}`)
    }
}
