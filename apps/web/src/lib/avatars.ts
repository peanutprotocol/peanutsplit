/**
 * The member-avatar catalog.
 *
 * Split has no profiles, so an avatar should feel like a table nickname rather
 * than a miniature biometric. Every selectable identity is an animal, snack,
 * monster or object with a joke attached. Nothing asks the person's gender,
 * age, skin colour or appearance, and nothing is inferred from their name.
 *
 * Member rows store only an allowlisted key. Artwork and copy stay code-side so
 * a drawing can be improved everywhere without migrating data.
 */

import type { DoodleName } from '@/components/ui/doodles'

export interface PersonaArt {
    kind: 'persona'
    doodle: DoodleName
    label: string
    vibe: string
    background: string
    accent: string
    ink: string
}

export interface DoodleArt {
    kind: 'doodle'
    doodle: DoodleName
    label: string
    vibe: string
    background: string
    accent: string
    ink: string
}

export type AvatarArt = PersonaArt | DoodleArt

const persona = (
    doodle: DoodleName,
    label: string,
    vibe: string,
    background: string,
    accent: string,
    ink: string
): PersonaArt => ({ kind: 'persona', doodle, label, vibe, background, accent, ink })

const classic = (
    doodle: DoodleName,
    label: string,
    vibe: string,
    background: string,
    accent: string,
    ink = '#282832'
): DoodleArt => ({ kind: 'doodle', doodle, label, vibe, background, accent, ink })

/**
 * The approved colorful cast.
 *
 * These are the exact deterministic paths and palettes reviewed in the doodle
 * canary picker. Sixteen named personas plus twelve classics keep the live
 * picker above the promised twenty-option floor without shipping any of the
 * less charming procedural glyphs.
 */
export const PERSONAS = {
    'vampire-penguin': persona(
        'personavampirepenguin',
        'Vampire Penguin',
        'tiny, dramatic, mostly harmless',
        '#F8D8ED',
        '#C9B8F4',
        '#50355F'
    ),
    'pirate-parrot': persona(
        'personapirateparrot',
        'Pirate Parrot',
        'confidently lost',
        '#CDEDF2',
        '#FFD78A',
        '#185A67'
    ),
    'cozy-ghost': persona(
        'personacozyghost',
        'Cozy Ghost',
        'brought the good blanket',
        '#DDE2FF',
        '#FFDBA6',
        '#4A4D83'
    ),
    'wizard-frog': persona('personawizardfrog', 'Wizard Frog', 'one spell ahead', '#D6F1D4', '#CDBCF5', '#315E42'),
    'astronaut-avocado': persona(
        'personaastronautavocado',
        'Astronaut Avocado',
        'waves at every planet',
        '#CDEBF8',
        '#C8EDB5',
        '#27506B'
    ),
    'disco-octopus': persona(
        'personadiscooctopus',
        'Disco Octopus',
        'has eight good moves',
        '#F8D2E5',
        '#BDEBF2',
        '#713D68'
    ),
    'tea-dragon': persona(
        'personateadragon',
        'Tea Dragon',
        'breathes steam, politely',
        '#FFE4BB',
        '#F5B9B3',
        '#7B4532'
    ),
    'raincoat-duck': persona('personaraincoatduck', 'Raincoat Duck', 'hopes it rains', '#BFE3F2', '#FFE487', '#225D77'),
    'skater-snail': persona(
        'personaskatersnail',
        'Skater Snail',
        'slow, but with flair',
        '#D9F2CF',
        '#F7C5E6',
        '#365D42'
    ),
    'moon-bunny': persona('personamoonbunny', 'Moon Bunny', 'quietly over the moon', '#E6DEFA', '#F9D3DC', '#514875'),
    // Keep the already-shipped storage key while adopting the approved name
    // and drawing. Existing rooms upgrade visually without a data migration.
    'rockstar-strawberry': persona(
        'personarockstarberry',
        'Rockstar Berry',
        'tiny fruit, huge encore',
        '#F9C9D4',
        '#C7E8C1',
        '#7A304A'
    ),
    'baker-moon': persona('personabakermoon', 'Baker Moon', 'proofs dough after dark', '#FFF0B8', '#D6C5F4', '#6D5730'),
    'party-bee': persona('personapartybee', 'Party Bee', 'arrived with confetti', '#FFE69A', '#F6C5E3', '#665020'),
    'garden-yeti': persona(
        'personagardenyeti',
        'Garden Yeti',
        'grows enormous daisies',
        '#D5EDC6',
        '#F9D38D',
        '#3F6040'
    ),
    'pancake-bear': persona(
        'personapancakebear',
        'Pancake Bear',
        'believes in second breakfast',
        '#FFE0B8',
        '#C7E8D0',
        '#714A33'
    ),
    'pocket-robot': persona(
        'personapocketrobot',
        'Pocket Robot',
        'helpful, with one loose screw',
        '#CBE7ED',
        '#FFD28E',
        '#315B64'
    ),
} as const satisfies Record<string, PersonaArt>

export type PersonaKey = keyof typeof PERSONAS
export const PERSONA_KEYS = Object.keys(PERSONAS) as PersonaKey[]

/**
 * Existing non-human doodle picks remain available as classics. Together with
 * the named cast they make twenty-eight visible options.
 */
export const CLASSIC_AVATARS = {
    'doodle-dog': classic('dog', 'Good Dog', 'reliably delighted', '#FFF4CC', '#B8F0C5'),
    'doodle-peanut': classic('peanut', 'Classic Peanut', 'keeps it simple', '#FAE184', '#F6C7EC'),
    'doodle-sun': classic('sun', 'Little Sun', 'morning energy', '#FAE184', '#BDECF5'),
    'doodle-wave': classic('wave', 'Big Wave', 'brings momentum', '#BDECF5', '#FFF4CC'),
    'doodle-leaf': classic('leaf', 'Fresh Leaf', 'touches grass', '#B8F0C5', '#FFF4CC'),
    'doodle-crystal': classic('crystal', 'Lucky Crystal', 'good vibrations', '#F6C7EC', '#C9D3F3'),
    'doodle-guitar': classic('guitar', 'Tiny Guitar', 'has a playlist', '#FFF4CC', '#F6C7EC'),
    'doodle-football': classic('football', 'Match Ball', 'keeps score', '#B8F0C5', '#C9D3F3'),
    'doodle-pizza': classic('pizza', 'Pizza Slice', 'orders for the table', '#F6C7EC', '#FAE184'),
    'doodle-coffee': classic('coffee', 'Coffee Cup', 'first one awake', '#FFF4CC', '#C9D3F3'),
    'doodle-cake': classic('cake', 'Cake Slice', 'celebrates everything', '#F6C7EC', '#FFF4CC'),
    'doodle-boat': classic('boat', 'Little Boat', 'gets everyone home', '#BDECF5', '#FAE184'),
} as const satisfies Record<string, DoodleArt>

/**
 * Keys from the first alter-ego release can already be stored in production.
 * Keep accepting all of them, but redraw each through an approved doodle and
 * omit it from the picker. This is a compatibility shim, not a second catalog.
 */
const RETIRED_PERSONAS = {
    'ninja-pear': PERSONAS['skater-snail'],
    'lucky-alien': PERSONAS['pocket-robot'],
    'trickster-fox': PERSONAS['pirate-parrot'],
    'punk-pineapple': PERSONAS['rockstar-strawberry'],
    'garden-snail': PERSONAS['skater-snail'],
    'sleepy-cloud': PERSONAS['moon-bunny'],
    'explorer-bear': PERSONAS['pancake-bear'],
    'yoga-yeti': PERSONAS['garden-yeti'],
    'detective-raccoon': PERSONAS['pocket-robot'],
    'bookworm-bat': PERSONAS['vampire-penguin'],
    'scientist-owl': PERSONAS['wizard-frog'],
    'mechanic-robot': PERSONAS['pocket-robot'],
    'gamer-cat': PERSONAS['disco-octopus'],
    'dj-dinosaur': PERSONAS['disco-octopus'],
    'painter-panda': PERSONAS['garden-yeti'],
    'karaoke-kiwi': PERSONAS['rockstar-strawberry'],
    'surfer-shark': PERSONAS['raincoat-duck'],
    'skater-cactus': PERSONAS['skater-snail'],
    'chef-dragon': PERSONAS['tea-dragon'],
    'sailor-banana': PERSONAS['pirate-parrot'],
    'cosmic-llama': PERSONAS['astronaut-avocado'],
} as const satisfies Record<string, PersonaArt>

/**
 * The nine older face keys also remain readable forever. They are never
 * reoffered and no longer render a human face.
 */
const LEGACY_FACE_AVATARS = {
    'face-swoop': PERSONAS['vampire-penguin'],
    'face-bob': PERSONAS['cozy-ghost'],
    'face-crop': PERSONAS['pocket-robot'],
    'face-long': PERSONAS['astronaut-avocado'],
    'face-bun': PERSONAS['rockstar-strawberry'],
    'face-curls': PERSONAS['disco-octopus'],
    'face-cap': PERSONAS['skater-snail'],
    'face-beard': PERSONAS['pancake-bear'],
    'face-bald': PERSONAS['wizard-frog'],
} as const satisfies Record<string, PersonaArt>

/** Every key a row may contain, including compatibility keys. */
export const AVATARS = {
    ...PERSONAS,
    ...CLASSIC_AVATARS,
    ...RETIRED_PERSONAS,
    ...LEGACY_FACE_AVATARS,
} as const satisfies Record<string, AvatarArt>

export type AvatarKey = keyof typeof AVATARS

/** The live picker order. Compatibility aliases are deliberately absent. */
export const AVATAR_KEYS = [...PERSONA_KEYS, ...Object.keys(CLASSIC_AVATARS)] as AvatarKey[]

export const isAvatarKey = (value: unknown): value is AvatarKey =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(AVATARS, value)

/**
 * Draw and persist one concrete key. The optional exclusion makes the re-roll
 * button visibly do something; injecting the RNG keeps tests deterministic.
 */
export function randomPersonaKey(exclude: string | null = null, random: () => number = Math.random): PersonaKey {
    const candidates = PERSONA_KEYS.filter((key) => key !== exclude)
    const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1)
    return candidates[Math.max(0, index)]
}

/** A neutral defensive render fallback for null or unknown legacy values. */
export const FALLBACK_AVATAR = CLASSIC_AVATARS['doodle-peanut']

export const avatarArt = (avatar: string | null | undefined, _name?: string): AvatarArt =>
    isAvatarKey(avatar) ? AVATARS[avatar] : FALLBACK_AVATAR

export const avatarFamily = (avatar: string | null): 'default' | 'persona' | 'doodle' => {
    if (!isAvatarKey(avatar)) return 'default'
    return AVATARS[avatar].kind
}
