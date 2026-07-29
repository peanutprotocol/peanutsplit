/**
 * The alter-ego catalog. These tests pin the product rule, not SVG pixels:
 * defaults are stable and non-human, the picker offers real breadth, old stored
 * keys remain readable, and the database allowlist stays an allowlist.
 */
import { describe, expect, it } from 'vitest'
import { DOODLE } from '@/components/ui/doodles'
import {
    AVATARS,
    AVATAR_CATEGORIES,
    AVATAR_KEYS,
    CLASSIC_AVATARS,
    PERSONAS,
    PERSONA_KEYS,
    avatarArt,
    avatarFamily,
    defaultAvatarArt,
    defaultAvatarKey,
    isAvatarKey,
} from './avatars'

describe('the default alter ego', () => {
    it.each(['Ana', 'Bruno', 'María', 'Kwame', '', '한', '👩‍🚀'])('is a stable, non-human persona for %j', (name) => {
        const key = defaultAvatarKey(name)
        expect(PERSONA_KEYS).toContain(key)
        expect(defaultAvatarKey(name)).toBe(key)
        expect(defaultAvatarArt(name)).toEqual(PERSONAS[key])
        expect(defaultAvatarArt(name).kind).toBe('persona')
    })

    it('spreads ordinary names across the cast instead of making one mascot the default', () => {
        const defaults = new Set(
            ['Ana', 'Bruno', 'Cleo', 'Davi', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivo', 'Jules'].map(defaultAvatarKey)
        )
        expect(defaults.size).toBeGreaterThanOrEqual(6)
    })
})

describe('the catalog', () => {
    it('offers thirty named personas across five social vibes', () => {
        expect(PERSONA_KEYS).toHaveLength(30)
        expect(AVATAR_CATEGORIES).toHaveLength(5)
        for (const category of AVATAR_CATEGORIES) {
            expect(
                PERSONA_KEYS.filter((key) => PERSONAS[key].category === category),
                category
            ).toHaveLength(6)
        }
    })

    it('includes the strange combinations promised by the interaction', () => {
        expect(PERSONAS['vampire-penguin'].label).toBe('Vampire Penguin')
        expect(PERSONAS['pirate-parrot'].label).toBe('Pirate Parrot')
        expect(PERSONAS['astronaut-avocado'].label).toBe('Astronaut Avocado')
        expect(PERSONAS['rockstar-strawberry'].creature).toBe('strawberry')
        expect(PERSONAS['ninja-pear'].creature).toBe('pear')
    })

    it('has unique names, vibes and creature/costume combinations', () => {
        expect(new Set(PERSONA_KEYS.map((key) => PERSONAS[key].label)).size).toBe(PERSONA_KEYS.length)
        expect(new Set(PERSONA_KEYS.map((key) => PERSONAS[key].vibe)).size).toBe(PERSONA_KEYS.length)
        expect(new Set(PERSONA_KEYS.map((key) => `${PERSONAS[key].creature}/${PERSONAS[key].costume}`)).size).toBe(
            PERSONA_KEYS.length
        )
    })

    it('keeps classic non-human doodles valid and points only at real drawings', () => {
        for (const art of Object.values(CLASSIC_AVATARS)) expect(DOODLE[art.doodle]).toBeTruthy()
    })

    it('does not show the old human face keys in the picker', () => {
        expect(AVATAR_KEYS.some((key) => key.startsWith('face-'))).toBe(false)
    })
})

describe('compatibility and validation', () => {
    it('accepts every picker key and rejects prototype keys and near misses', () => {
        for (const key of AVATAR_KEYS) expect(isAvatarKey(key)).toBe(true)
        for (const value of [
            'constructor',
            'toString',
            '__proto__',
            'hasOwnProperty',
            'vampire-penguin ',
            'VAMPIRE-PENGUIN',
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

    it('redraws every legacy human-face key as a persona without reoffering it', () => {
        for (const key of [
            'face-swoop',
            'face-bob',
            'face-crop',
            'face-long',
            'face-bun',
            'face-curls',
            'face-cap',
            'face-beard',
            'face-bald',
        ]) {
            expect(isAvatarKey(key)).toBe(true)
            expect(avatarArt(key, 'Ana').kind).toBe('persona')
            expect(AVATAR_KEYS).not.toContain(key)
        }
    })

    it('draws a known pick and safely defaults null, undefined and retired junk', () => {
        expect(avatarArt('vampire-penguin', 'Ana')).toEqual(PERSONAS['vampire-penguin'])
        expect(avatarArt('doodle-dog', 'Ana')).toEqual(AVATARS['doodle-dog'])
        expect(avatarArt(null, 'Ana')).toEqual(defaultAvatarArt('Ana'))
        expect(avatarArt(undefined, 'Ana')).toEqual(defaultAvatarArt('Ana'))
        expect(avatarArt('retired-in-2027', 'Ana')).toEqual(defaultAvatarArt('Ana'))
    })
})

describe('avatarFamily — what analytics is allowed to know', () => {
    it('reports only the broad family and never a key or target member', () => {
        expect(avatarFamily('vampire-penguin')).toBe('persona')
        expect(avatarFamily('face-bun')).toBe('persona')
        expect(avatarFamily('doodle-dog')).toBe('doodle')
        expect(avatarFamily(null)).toBe('default')
        expect(avatarFamily('something-else')).toBe('default')
    })
})
