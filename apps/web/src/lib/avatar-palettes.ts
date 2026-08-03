/**
 * The reviewed two-colour member-avatar palettes.
 *
 * A member stores a palette KEY, never arbitrary colours. That keeps every
 * combination readable, lets a palette be retuned without migrating a room,
 * and prevents a room link-holder from introducing an unreadable value. The
 * white sticker keyline is deliberately not part of this catalog: it is the
 * common drawing treatment applied by `MemberAvatar`.
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

const pick = (random: () => number, count: number): number =>
    count <= 1 ? 0 : Math.min(Math.max(Math.floor(random() * count), 0), count - 1)

/** Draw one concrete palette key, excluding the current key when it is known. */
export function randomAvatarPaletteKey(
    exclude: string | readonly string[] | null = null,
    random: () => number = Math.random
): AvatarPaletteKey {
    const excluded = new Set(typeof exclude === 'string' ? [exclude] : (exclude ?? []))
    const available = AVATAR_PALETTE_KEYS.filter((key) => !excluded.has(key))
    // Once a room is larger than the reviewed pool, reuse is better than an
    // undefined colour. The ordinary cap is twenty, so this is defensive.
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
