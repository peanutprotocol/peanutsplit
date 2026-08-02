/**
 * The alter-ego catalog. These tests pin the product rule, not SVG pixels:
 * defaults are persisted and non-human, the picker offers real breadth, old
 * stored keys remain readable, and the database allowlist stays an allowlist.
 */
import { describe, expect, it } from 'vitest'
import { DOODLE } from '@/components/ui/doodles'
import {
    AVATARS,
    AVATAR_KEYS,
    CLASSIC_AVATARS,
    FALLBACK_AVATAR,
    PERSONAS,
    PERSONA_KEYS,
    avatarArt,
    avatarFamily,
    isAvatarKey,
    randomPersonaKey,
} from './avatars'

describe('the default alter ego', () => {
    it('draws from the full non-human cast', () => {
        expect(randomPersonaKey(null, () => 0)).toBe(PERSONA_KEYS[0])
        expect(randomPersonaKey(null, () => 0.999999)).toBe(PERSONA_KEYS[PERSONA_KEYS.length - 1])
    })

    it('excludes the current persona when somebody rolls again', () => {
        const last = PERSONA_KEYS[PERSONA_KEYS.length - 1]
        expect(randomPersonaKey(PERSONA_KEYS[0], () => 0)).toBe(PERSONA_KEYS[1])
        expect(randomPersonaKey(last, () => 0.999999)).toBe(PERSONA_KEYS[PERSONA_KEYS.length - 2])
    })
})

describe('the catalog', () => {
    it('offers the thirty-six approved personas and the twelve classics', () => {
        expect(PERSONA_KEYS).toHaveLength(36)
        expect(AVATAR_KEYS).toHaveLength(48)
    })

    it('includes the strange combinations promised by the interaction', () => {
        expect(PERSONAS['vampire-penguin'].label).toBe('Vampire Penguin')
        expect(PERSONAS['pirate-parrot'].label).toBe('Pirate Parrot')
        expect(PERSONAS['astronaut-avocado'].label).toBe('Astronaut Avocado')
        expect(PERSONAS['rockstar-strawberry'].label).toBe('Rockstar Berry')
        expect(PERSONAS['tea-dragon'].label).toBe('Tea Dragon')
        expect(PERSONAS['pocket-robot'].label).toBe('Pocket Robot')
        expect(PERSONAS['snooze-sloth'].label).toBe('Snooze Sloth')
        expect(PERSONAS['drama-prawn'].label).toBe('Drama Prawn')
        expect(PERSONAS['thermostat-gremlin'].label).toBe('Thermostat Gremlin')
        expect(PERSONAS['punk-pineapple'].label).toBe('Punk Pineapple')
    })

    it('has unique names, vibes and production drawings', () => {
        expect(new Set(PERSONA_KEYS.map((key) => PERSONAS[key].label)).size).toBe(PERSONA_KEYS.length)
        expect(new Set(PERSONA_KEYS.map((key) => PERSONAS[key].vibe)).size).toBe(PERSONA_KEYS.length)
        expect(new Set(PERSONA_KEYS.map((key) => PERSONAS[key].doodle)).size).toBe(PERSONA_KEYS.length)
    })

    it('keeps every card description short enough for one line', () => {
        for (const key of AVATAR_KEYS) {
            expect(AVATARS[key].vibe.length, `${key}: ${AVATARS[key].vibe}`).toBeLessThanOrEqual(18)
        }
    })

    it('points every visible option at a real drawing and a complete color palette', () => {
        for (const key of AVATAR_KEYS) {
            const art = AVATARS[key]
            expect(DOODLE[art.doodle], key).toBeTruthy()
            for (const color of [art.background, art.accent, art.ink]) {
                expect(color, `${key}: ${color}`).toMatch(/^#[0-9A-F]{6}$/i)
            }
        }
        expect(Object.keys(CLASSIC_AVATARS)).toHaveLength(12)
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

    it('redraws first-release persona keys without reoffering the less charming glyphs', () => {
        for (const key of ['ninja-pear', 'sleepy-cloud', 'karaoke-kiwi', 'cosmic-llama']) {
            expect(isAvatarKey(key)).toBe(true)
            expect(avatarArt(key, 'Ana').kind).toBe('persona')
            expect(AVATAR_KEYS).not.toContain(key)
        }
    })

    it('graduates the six resurrected first-release keys into the visible cast', () => {
        for (const key of [
            'detective-raccoon',
            'dj-dinosaur',
            'gamer-cat',
            'bookworm-bat',
            'trickster-fox',
            'punk-pineapple',
        ]) {
            expect(AVATAR_KEYS).toContain(key)
        }
    })

    it('draws a known pick and safely defaults null, undefined and retired junk', () => {
        expect(avatarArt('vampire-penguin', 'Ana')).toEqual(PERSONAS['vampire-penguin'])
        expect(avatarArt('doodle-dog', 'Ana')).toEqual(AVATARS['doodle-dog'])
        expect(avatarArt(null, 'Ana')).toEqual(FALLBACK_AVATAR)
        expect(avatarArt(undefined, 'Bruno')).toEqual(FALLBACK_AVATAR)
        expect(avatarArt('retired-in-2027', 'Cleo')).toEqual(FALLBACK_AVATAR)
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
