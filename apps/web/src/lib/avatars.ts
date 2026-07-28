/**
 * The avatar catalog — what a member can choose to look like.
 *
 * A member row stores an avatar KEY from the frozen list below, or null. Null is
 * the default and is what every row written before this file existed holds: the
 * little portrait drawn deterministically from the person's name, unchanged.
 * Picking overrides it; there is no third state.
 *
 * THREE decisions are worth the words.
 *
 * 1. **A key, never artwork.** Same argument as `lib/themes.ts` and
 *    `lib/reactions.ts`: an arbitrary string on a link-credential surface is a
 *    defacement vector and an unfixable stored value, while a key can be
 *    re-drawn for the whole estate in one commit. It also means the server
 *    validates with an `includes` instead of trying to bound free text.
 *
 * 2. **No photo upload.** An image field is a moderation surface, a storage
 *    bill and a privacy question, on a product whose entire identity model is
 *    "a name in localStorage". A curated set is one tap and can never carry a
 *    payload.
 *
 * 3. **Nothing here is inferred from the name.** The default portrait varies by
 *    name (so the roster is legible at a glance), but it varies on a hash — it
 *    does not read the name and guess anything about the person. The set below
 *    is offered as a plain grid so anyone can pick what feels like them; the
 *    variants are not labelled or grouped by who they are "for", and the code
 *    has no notion of that.
 *
 * No 'use client': the route handler validates against this list, `MemberAvatar`
 * renders from it, and there must be exactly one list. Keep it free of React and
 * of anything Node-only.
 */

import type { DoodleName } from '@/components/ui/doodles'

/**
 * The five fields the portrait has always been drawn on. Every one carries black
 * ink and a black 1px border, which is the whole design system — the same
 * contrast rule the theme catalog states.
 */
export const AVATAR_BACKGROUNDS = ['#FAE184', '#FFF4CC', '#B8F0C5', '#C9D3F3', '#F6C7EC'] as const

/**
 * Hair, drawn as one filled path over the top of the head.
 *
 * The first three are the shapes the deterministic portrait has always rolled
 * between, kept byte-identical so a room full of default avatars renders exactly
 * as it did before the picker existed. The rest exist only in the picker.
 */
const HAIR = {
    swoop: 'M8 13C8.2 8.1 11.1 5.1 16.2 5.3C21.7 5.4 24 9 24 13C21.6 11.7 19.4 9.8 17.9 7.6C15.6 10.2 12.4 11.9 8 13Z',
    bob: 'M8.4 13.2C8.6 8 11.2 5.4 16.1 5.4C20.6 5.4 23.5 7.9 23.8 12.7C21.8 10.4 19.4 9.2 16.7 9.1C13.8 9.1 11.5 10.4 8.4 13.2Z',
    crop: 'M8.2 12.9C8.7 8 11.1 5.5 15.9 5.4C20.8 5.3 23.5 8.2 23.8 12.8C21.4 11.5 19.9 9 19.4 7.2C17.4 9.9 14.1 11.3 8.2 12.9Z',
    /** A cap with two panels running past the jaw. */
    long: 'M8.4 13C8.5 8 11.3 5.4 16 5.4C20.7 5.4 23.5 8 23.6 13C23.7 16.3 23.9 19.5 24.2 22.6C23.2 22.8 22.4 22.5 21.8 21.7C21.9 18.4 21.8 15.4 21.4 12.6C19.1 10.9 17.3 10.1 16 10.1C14.7 10.1 12.9 10.9 10.6 12.6C10.2 15.4 10.1 18.4 10.2 21.7C9.6 22.5 8.8 22.8 7.8 22.6C8.1 19.5 8.3 16.3 8.4 13Z',
    /** Gathered up, with the knot sitting proud of the crown. */
    bun: 'M8.5 13C8.8 8.7 11 6.2 14.3 5.5C13.9 4.3 14.7 3.1 16 3.1C17.3 3.1 18.1 4.3 17.7 5.5C21 6.2 23.2 8.7 23.5 13C21.4 10.5 19 9.3 16 9.3C13 9.3 10.6 10.5 8.5 13Z',
    /** A scalloped edge — the pen's answer to curls. */
    curls: 'M8.4 13.6C7.4 13 7.3 11.6 8.2 10.9C8 9.5 9.1 8.4 10.5 8.6C10.8 7.2 12.3 6.5 13.5 7.2C14.2 6 15.9 5.7 17 6.6C18.1 5.8 19.7 6.2 20.4 7.4C21.7 7.3 22.8 8.4 22.7 9.7C23.8 10.3 24 11.8 23.1 12.6C23.4 13 23.5 13.4 23.4 13.8C21.4 11.4 19 10.2 16 10.2C13 10.2 10.5 11.4 8.4 13.6Z',
    /** A cap: dome, then a brim swept out to the left. Two subpaths in one `d`,
     *  because a face is one filled shape as far as this component is concerned. */
    cap: 'M8.3 13.9C8.3 8.8 11.3 5.6 16 5.6C20.7 5.6 23.7 8.8 23.7 13.9Z M9.4 13.9H3.7C2.8 13.9 2.6 14.7 3.3 15.4C4.8 16.9 6.9 17.6 9.6 17.5Z',
    /** A crop with a jaw. Same two-subpath trick; the lower shape stops clear of
     *  the mouth so the smile still reads. */
    beard: 'M8.4 12.9C8.9 8.1 11.3 5.6 16 5.5C20.9 5.4 23.6 8.3 23.9 12.9C21.5 11.6 20 9.1 19.5 7.3C17.5 10 14.3 11.4 8.4 12.9Z M9.3 20.8C10.1 24.4 12.8 26.4 16 26.4C19.2 26.4 21.9 24.4 22.7 20.8C21.9 23.1 19.4 24.1 16 24.1C12.6 24.1 10.1 23.1 9.3 20.8Z',
    /** No hair at all — the shortest way to look like a lot of people. */
    bald: null,
} as const satisfies Record<string, string | null>

/** The two mouths the portrait has always rolled between. */
const SMILE = {
    wide: 'M12.5 21.2C14.4 22.7 17.5 22.8 19.6 21',
    soft: 'M12.7 21C14.6 22 17.1 22.1 19.3 20.8',
} as const

export interface FaceArt {
    kind: 'face'
    /** Null draws no hair. */
    hair: string | null
    smile: string
    background: string
}

export interface DoodleArt {
    kind: 'doodle'
    doodle: DoodleName
    background: string
}

export type AvatarArt = FaceArt | DoodleArt

const face = (hair: keyof typeof HAIR, smile: keyof typeof SMILE, background: number): FaceArt => ({
    kind: 'face',
    hair: HAIR[hair],
    smile: SMILE[smile],
    background: AVATAR_BACKGROUNDS[background],
})

const doodle = (name: DoodleName, background: number): DoodleArt => ({
    kind: 'doodle',
    doodle: name,
    background: AVATAR_BACKGROUNDS[background],
})

/**
 * The set, in the order the picker shows it.
 *
 * Portraits first, because that is what an avatar is for and what the roster is
 * already full of; the drawings after, because "I am the dog" is a real answer
 * and the product would be poorer without it. Adding to this list is additive
 * and safe — removing a key is not, because rows already point at it.
 */
export const AVATARS = {
    'face-swoop': face('swoop', 'wide', 0),
    'face-bob': face('bob', 'soft', 4),
    'face-crop': face('crop', 'wide', 3),
    'face-long': face('long', 'soft', 2),
    'face-bun': face('bun', 'wide', 1),
    'face-curls': face('curls', 'soft', 0),
    'face-cap': face('cap', 'wide', 3),
    'face-beard': face('beard', 'wide', 1),
    'face-bald': face('bald', 'soft', 2),
    'doodle-dog': doodle('dog', 1),
    'doodle-peanut': doodle('peanut', 0),
    'doodle-sun': doodle('sun', 0),
    'doodle-wave': doodle('wave', 3),
    'doodle-leaf': doodle('leaf', 2),
    'doodle-crystal': doodle('crystal', 4),
    'doodle-guitar': doodle('guitar', 1),
    'doodle-football': doodle('football', 2),
    'doodle-pizza': doodle('pizza', 4),
    'doodle-coffee': doodle('coffee', 1),
    'doodle-cake': doodle('cake', 4),
    'doodle-boat': doodle('boat', 3),
} as const satisfies Record<string, AvatarArt>

export type AvatarKey = keyof typeof AVATARS

/** Picker order. Insertion order of an object literal is specified, so this is
 *  the list above and not a re-statement of it that can drift. */
export const AVATAR_KEYS = Object.keys(AVATARS) as AvatarKey[]

export const isAvatarKey = (value: unknown): value is AvatarKey =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(AVATARS, value)

/**
 * The name-derived portrait: same name, same little face, every device.
 *
 * The arithmetic is exactly what it was before the picker existed — sum of code
 * points, modulo the first three hair shapes, the five fields and the two
 * mouths — so a room that has never touched the picker renders unchanged.
 */
export function defaultAvatarArt(name: string): FaceArt {
    const seed = [...name].reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0)
    const hair = (['swoop', 'bob', 'crop'] as const)[seed % 3]
    return {
        kind: 'face',
        hair: HAIR[hair],
        smile: seed % 2 === 0 ? SMILE.wide : SMILE.soft,
        background: AVATAR_BACKGROUNDS[seed % AVATAR_BACKGROUNDS.length],
    }
}

/**
 * What to draw for a member. An unknown key falls back to the name-derived
 * portrait rather than rendering nothing — a key retired in a future commit
 * must degrade to a face, not to a hole in the roster.
 */
export const avatarArt = (avatar: string | null | undefined, name: string): AvatarArt =>
    isAvatarKey(avatar) ? AVATARS[avatar] : defaultAvatarArt(name)

/** What analytics is allowed to know about a pick: which FAMILY it came from.
 *  Which avatar a particular person chose is the kind of social detail this
 *  product keeps out of funnels — see the note at the top of `lib/analytics.ts`. */
export const avatarFamily = (avatar: string | null): 'default' | 'face' | 'doodle' => {
    if (!isAvatarKey(avatar)) return 'default'
    return AVATARS[avatar].kind
}
