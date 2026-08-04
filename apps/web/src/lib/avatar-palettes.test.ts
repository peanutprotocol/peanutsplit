import { describe, expect, it } from 'vitest'
import {
    AVATAR_PALETTES,
    AVATAR_PALETTE_KEYS,
    DEFAULT_AVATAR_PALETTE_KEY,
    avatarColorLuminance,
    avatarPalette,
    avatarPaletteContrast,
    avatarPaletteDistance,
    avatarPaletteForIdentity,
    dealAvatarPaletteKeys,
    effectiveAvatarPaletteKey,
    isAvatarPaletteKey,
    randomAvatarPaletteKey,
    separatedAvatarPaletteKeys,
    type AvatarPaletteKey,
} from './avatar-palettes'

/** A seeded generator so repeat deals remain repeatable. */
function seeded(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let drawn = Math.imul(state ^ (state >>> 15), 1 | state)
        drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn
        return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296
    }
}

describe('the reviewed avatar palette', () => {
    it('keeps all twenty-four approved combinations under stable slug keys', () => {
        expect(AVATAR_PALETTES).toHaveLength(24)
        expect(AVATAR_PALETTE_KEYS).toEqual([
            'lagoon-grape',
            'bubble-navy',
            'acid-violet',
            'tomato-navy',
            'sun-berry',
            'lilac-forest',
            'coral-teal',
            'sky-cherry',
            'orange-cobalt',
            'mint-rust',
            'banana-cobalt',
            'powder-brown',
            'rose-forest',
            'lime-burgundy',
            'peach-navy',
            'aqua-maroon',
            'lavender-teal',
            'guava-slate',
            'cerulean-brown',
            'leaf-violet',
            'candy-cobalt',
            'gold-forest',
            'periwinkle-plum',
            'watermelon-green',
        ])
        expect(new Set(AVATAR_PALETTE_KEYS).size).toBe(AVATAR_PALETTE_KEYS.length)
        expect(new Set(AVATAR_PALETTES.map(({ background, ink }) => `${background}:${ink}`)).size).toBe(
            AVATAR_PALETTES.length
        )
    })

    it('keeps dark inner ink at 4.5:1 or better against every background', () => {
        for (const palette of AVATAR_PALETTES) {
            expect(avatarPaletteContrast(palette), palette.key).toBeGreaterThanOrEqual(4.5)
            expect(avatarColorLuminance(palette.ink), palette.key).toBeLessThan(0.18)
        }
    })

    it('validates exact keys and resolves unknown values defensively', () => {
        for (const key of AVATAR_PALETTE_KEYS) {
            expect(isAvatarPaletteKey(key)).toBe(true)
            expect(avatarPalette(key).key).toBe(key)
        }
        for (const value of ['Lagoon-grape', 'lagoon-grape ', '__proto__', '', null, undefined, 4]) {
            expect(isAvatarPaletteKey(value), String(value)).toBe(false)
            expect(avatarPalette(value).key).toBe(DEFAULT_AVATAR_PALETTE_KEY)
        }
    })

    it('gives an unpersisted identity one stable reviewed palette', () => {
        const first = avatarPaletteForIdentity('vampire-penguin')
        expect(avatarPaletteForIdentity('vampire-penguin')).toBe(first)
        expect(AVATAR_PALETTES).toContain(first)
        expect(
            new Set(['vampire-penguin', 'pirate-parrot', 'cozy-ghost', 'wizard-frog'].map(avatarPaletteForIdentity))
                .size
        ).toBeGreaterThan(1)
    })

    it('resolves the same effective fallback key that member avatars render', () => {
        expect(effectiveAvatarPaletteKey('sun-berry', 'tea-dragon')).toBe('sun-berry')
        expect(effectiveAvatarPaletteKey(null, 'tea-dragon')).toBe(avatarPaletteForIdentity('tea-dragon').key)
        expect(effectiveAvatarPaletteKey('unknown', 'Ana')).toBe(avatarPaletteForIdentity('Ana').key)
    })
})

describe('palette dealing', () => {
    it('draws across the whole pool and excludes the current palette', () => {
        expect(randomAvatarPaletteKey(null, () => 0)).toBe(AVATAR_PALETTE_KEYS[0])
        expect(randomAvatarPaletteKey(null, () => 0.999999)).toBe(AVATAR_PALETTE_KEYS.at(-1))
        expect(randomAvatarPaletteKey(AVATAR_PALETTE_KEYS[0], () => 0)).toBe(AVATAR_PALETTE_KEYS[1])
        expect(randomAvatarPaletteKey(AVATAR_PALETTE_KEYS.at(-1), () => 0.999999)).toBe(AVATAR_PALETTE_KEYS.at(-2))
        expect(randomAvatarPaletteKey(AVATAR_PALETTE_KEYS.slice(0, 3), () => 0)).toBe(AVATAR_PALETTE_KEYS[3])
        expect(randomAvatarPaletteKey(AVATAR_PALETTE_KEYS, () => 0)).toBe(AVATAR_PALETTE_KEYS[0])
    })

    it('deals a requested number of unique reviewed palettes', () => {
        const random = seeded(17)
        for (const count of [0, 1, 8, AVATAR_PALETTE_KEYS.length]) {
            const dealt = dealAvatarPaletteKeys(count, random)
            expect(dealt).toHaveLength(count)
            expect(new Set(dealt).size).toBe(count)
            expect(dealt.every(isAvatarPaletteKey)).toBe(true)
        }
    })

    it('rejects a deal that cannot preserve uniqueness', () => {
        for (const count of [-1, 1.5, AVATAR_PALETTE_KEYS.length + 1]) {
            expect(() => dealAvatarPaletteKeys(count)).toThrow(RangeError)
        }
    })
})

describe('perceptually separated room offers', () => {
    it('measures both halves of a palette symmetrically in OKLab', () => {
        expect(avatarPaletteDistance('lagoon-grape', 'lagoon-grape')).toBe(0)
        expect(avatarPaletteDistance('lagoon-grape', 'bubble-navy')).toBeCloseTo(
            avatarPaletteDistance('bubble-navy', 'lagoon-grape')
        )
        expect(avatarPaletteDistance('lagoon-grape', 'bubble-navy')).toBeGreaterThan(0)
    })

    it('takes the maximin candidate against occupied room colours', () => {
        const occupied = ['lagoon-grape'] as const
        const expected = AVATAR_PALETTE_KEYS.filter(
            (key) => !occupied.includes(key as (typeof occupied)[number])
        ).reduce((best, key) =>
            avatarPaletteDistance(key, occupied[0]) > avatarPaletteDistance(best, occupied[0]) ? key : best
        )
        expect(separatedAvatarPaletteKeys(1, occupied)).toEqual([expected])
    })

    it('never offers an occupied key and repeats only the few room-free keys', () => {
        const occupied = AVATAR_PALETTE_KEYS.slice(0, 20)
        const free = AVATAR_PALETTE_KEYS.slice(20)
        const freeSet = new Set<AvatarPaletteKey>(free)
        const offers = separatedAvatarPaletteKeys(8, occupied)
        expect(offers).toHaveLength(8)
        expect(offers.every((key) => freeSet.has(key))).toBe(true)
        expect(new Set(offers)).toEqual(new Set(free))
        expect(offers).toEqual(separatedAvatarPaletteKeys(8, occupied))
    })

    it('degrades gracefully once every catalog key is already occupied', () => {
        const offers = separatedAvatarPaletteKeys(AVATAR_PALETTE_KEYS.length + 5, AVATAR_PALETTE_KEYS)
        expect(offers).toHaveLength(AVATAR_PALETTE_KEYS.length + 5)
        expect(new Set(offers).size).toBe(AVATAR_PALETTE_KEYS.length)
        expect(offers.every(isAvatarPaletteKey)).toBe(true)
    })
})
