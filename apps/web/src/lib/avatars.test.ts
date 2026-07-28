/**
 * The avatar catalog.
 *
 * Two claims are load-bearing and neither is obvious from reading the file: a
 * member who never opens the picker must render exactly the portrait they
 * rendered before it existed, and the key allowlist has to be an allowlist —
 * `'toString' in AVATARS` is true for every object in JavaScript.
 */
import { describe, expect, it } from 'vitest'
import { DOODLE } from '@/components/ui/doodles'
import { AVATARS, AVATAR_KEYS, avatarArt, avatarFamily, defaultAvatarArt, isAvatarKey } from './avatars'

describe('the default portrait', () => {
    /** The exact arithmetic the shipped component used, restated here so a
     *  refactor of `defaultAvatarArt` that changes anybody's face fails loudly. */
    const HAIR = [
        'M8 13C8.2 8.1 11.1 5.1 16.2 5.3C21.7 5.4 24 9 24 13C21.6 11.7 19.4 9.8 17.9 7.6C15.6 10.2 12.4 11.9 8 13Z',
        'M8.4 13.2C8.6 8 11.2 5.4 16.1 5.4C20.6 5.4 23.5 7.9 23.8 12.7C21.8 10.4 19.4 9.2 16.7 9.1C13.8 9.1 11.5 10.4 8.4 13.2Z',
        'M8.2 12.9C8.7 8 11.1 5.5 15.9 5.4C20.8 5.3 23.5 8.2 23.8 12.8C21.4 11.5 19.9 9 19.4 7.2C17.4 9.9 14.1 11.3 8.2 12.9Z',
    ]
    const BACKGROUNDS = ['#FAE184', '#FFF4CC', '#B8F0C5', '#C9D3F3', '#F6C7EC']
    const seedOf = (name: string) => [...name].reduce((total, ch) => total + (ch.codePointAt(0) ?? 0), 0)

    it.each(['Ana', 'Bruno', 'María', 'Kwame', '', '한', '👩‍🚀'])('is unchanged for %j', (name) => {
        const seed = seedOf(name)
        const art = defaultAvatarArt(name)
        expect(art.hair).toBe(HAIR[seed % 3])
        expect(art.background).toBe(BACKGROUNDS[seed % 5])
        expect(art.smile).toBe(
            seed % 2 === 0 ? 'M12.5 21.2C14.4 22.7 17.5 22.8 19.6 21' : 'M12.7 21C14.6 22 17.1 22.1 19.3 20.8'
        )
    })

    it('is stable — the same name always draws the same face', () => {
        expect(defaultAvatarArt('Ana')).toEqual(defaultAvatarArt('Ana'))
    })
})

describe('isAvatarKey', () => {
    it('accepts every key in the catalog', () => {
        for (const key of AVATAR_KEYS) expect(isAvatarKey(key)).toBe(true)
    })

    it('rejects inherited properties, near-misses and non-strings', () => {
        for (const value of [
            'constructor',
            'toString',
            '__proto__',
            'hasOwnProperty',
            'FACE-BUN',
            'face-bun ',
            'mountain',
            '',
            null,
            undefined,
            42,
            {},
        ]) {
            expect(isAvatarKey(value), String(value)).toBe(false)
        }
    })
})

describe('avatarArt', () => {
    it('draws the picked avatar when the key is known', () => {
        expect(avatarArt('doodle-dog', 'Ana')).toEqual(AVATARS['doodle-dog'])
    })

    /** A key retired in a future commit must degrade to a face, never to a hole
     *  in the roster. */
    it('falls back to the name-derived portrait for null and for junk', () => {
        expect(avatarArt(null, 'Ana')).toEqual(defaultAvatarArt('Ana'))
        expect(avatarArt(undefined, 'Ana')).toEqual(defaultAvatarArt('Ana'))
        expect(avatarArt('face-retired-in-2027', 'Ana')).toEqual(defaultAvatarArt('Ana'))
    })
})

describe('the catalog itself', () => {
    it('offers both families, with enough of each to find yourself in', () => {
        const faces = AVATAR_KEYS.filter((key) => AVATARS[key].kind === 'face')
        const doodles = AVATAR_KEYS.filter((key) => AVATARS[key].kind === 'doodle')
        expect(faces.length).toBeGreaterThanOrEqual(8)
        expect(doodles.length).toBeGreaterThanOrEqual(8)
    })

    it('names only drawings that exist', () => {
        for (const key of AVATAR_KEYS) {
            const art = AVATARS[key]
            if (art.kind === 'doodle') expect(DOODLE[art.doodle], key).toBeTruthy()
        }
    })

    it('has no duplicate artwork — twenty tiles that render as twelve is a worse grid than twelve', () => {
        const drawn = AVATAR_KEYS.map((key) => JSON.stringify(AVATARS[key]))
        expect(new Set(drawn).size).toBe(drawn.length)
    })
})

describe('avatarFamily — what analytics is allowed to know', () => {
    it('reports the family and never the key', () => {
        expect(avatarFamily('face-bun')).toBe('face')
        expect(avatarFamily('doodle-dog')).toBe('doodle')
        expect(avatarFamily(null)).toBe('default')
        expect(avatarFamily('something-else')).toBe('default')
    })
})
