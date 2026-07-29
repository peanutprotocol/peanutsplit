/**
 * The member-avatar catalog.
 *
 * Split has no profiles, so an avatar should feel like a table nickname rather
 * than a miniature biometric. The selectable set is deliberately made of
 * animals, snacks, monsters and objects in costume. Nothing asks the person's
 * gender, age, skin colour or appearance, and nothing tries to infer those
 * things from their name.
 *
 * Member rows store only a key. Artwork and copy stay code-side so a drawing can
 * be improved everywhere without migrating data, and the server can reject
 * arbitrary strings instead of accepting an unmoderated profile surface.
 */

import type { DoodleName } from '@/components/ui/doodles'

export const AVATAR_BACKGROUNDS = ['#FAE184', '#FFF4CC', '#B8F0C5', '#C9D3F3', '#F6C7EC', '#BDECF5'] as const

export const AVATAR_CATEGORIES = ['mischief', 'cozy', 'brainy', 'party', 'adventure'] as const
export type AvatarCategory = (typeof AVATAR_CATEGORIES)[number]

export type PersonaCreature =
    | 'penguin'
    | 'parrot'
    | 'octopus'
    | 'frog'
    | 'avocado'
    | 'raccoon'
    | 'strawberry'
    | 'ghost'
    | 'cactus'
    | 'bat'
    | 'shark'
    | 'pear'
    | 'snail'
    | 'bee'
    | 'cloud'
    | 'peanut'
    | 'fox'
    | 'mushroom'
    | 'cat'
    | 'bear'
    | 'robot'
    | 'alien'
    | 'banana'
    | 'panda'
    | 'dinosaur'
    | 'owl'
    | 'moon'
    | 'kiwi'
    | 'llama'
    | 'pineapple'
    | 'yeti'

export type PersonaCostume =
    | 'vampire'
    | 'pirate'
    | 'disco'
    | 'wizard'
    | 'astronaut'
    | 'detective'
    | 'rockstar'
    | 'cozy'
    | 'skater'
    | 'bookworm'
    | 'surfer'
    | 'ninja'
    | 'gardener'
    | 'party'
    | 'sleepy'
    | 'royal'
    | 'scientist'
    | 'cowboy'
    | 'gamer'
    | 'explorer'
    | 'mechanic'
    | 'lucky'
    | 'sailor'
    | 'painter'
    | 'dj'
    | 'baker'
    | 'karaoke'
    | 'cosmic'
    | 'punk'
    | 'yoga'

export interface PersonaArt {
    kind: 'persona'
    creature: PersonaCreature
    costume: PersonaCostume
    /** The nickname is part of the joke and is shown in the picker. */
    label: string
    /** A short social cue, never a demographic. */
    vibe: string
    category: AvatarCategory
    primary: string
    secondary: string
    background: string
}

export interface DoodleArt {
    kind: 'doodle'
    doodle: DoodleName
    label: string
    vibe: string
    background: string
}

export type AvatarArt = PersonaArt | DoodleArt

const persona = (
    creature: PersonaCreature,
    costume: PersonaCostume,
    label: string,
    vibe: string,
    category: AvatarCategory,
    primary: string,
    secondary: string,
    background: number
): PersonaArt => ({
    kind: 'persona',
    creature,
    costume,
    label,
    vibe,
    category,
    primary,
    secondary,
    background: AVATAR_BACKGROUNDS[background],
})

const doodle = (name: DoodleName, label: string, vibe: string, background: number): DoodleArt => ({
    kind: 'doodle',
    doodle: name,
    label,
    vibe,
    background: AVATAR_BACKGROUNDS[background],
})

/**
 * Thirty alter egos, six per vibe. The labels are intentionally vivid enough
 * to become table talk: "the Vampire Penguin owes the Cosmic Llama" is the
 * product moment, not a settings chore.
 */
export const PERSONAS = {
    'vampire-penguin': persona(
        'penguin',
        'vampire',
        'Vampire Penguin',
        'dramatic after dark',
        'mischief',
        '#202027',
        '#F04F4F',
        4
    ),
    'pirate-parrot': persona(
        'parrot',
        'pirate',
        'Pirate Parrot',
        'finds the snacks',
        'mischief',
        '#53B96F',
        '#FFC900',
        3
    ),
    'ninja-pear': persona('pear', 'ninja', 'Ninja Pear', 'quietly competitive', 'mischief', '#9ED66F', '#282832', 1),
    'lucky-alien': persona('alien', 'lucky', 'Lucky Alien', 'weirdly fortunate', 'mischief', '#8EDB9C', '#6D5BD0', 0),
    'trickster-fox': persona(
        'fox',
        'detective',
        'Trickster Fox',
        'has a side quest',
        'mischief',
        '#F08A4B',
        '#FFF4CC',
        2
    ),
    'punk-pineapple': persona(
        'pineapple',
        'punk',
        'Punk Pineapple',
        'sweet with spikes',
        'mischief',
        '#F4C84C',
        '#4EAF67',
        4
    ),

    'cozy-ghost': persona('ghost', 'cozy', 'Cozy Ghost', 'here for the blankets', 'cozy', '#FFFDF8', '#E95A84', 3),
    'garden-snail': persona(
        'snail',
        'gardener',
        'Garden Snail',
        'takes the scenic route',
        'cozy',
        '#E39B63',
        '#7FCB76',
        2
    ),
    'sleepy-cloud': persona('cloud', 'sleepy', 'Sleepy Cloud', 'five more minutes', 'cozy', '#FFFDF8', '#7589CB', 3),
    'explorer-bear': persona(
        'bear',
        'explorer',
        'Explorer Bear',
        'packs extra biscuits',
        'cozy',
        '#B8784E',
        '#E8B86B',
        0
    ),
    'baker-moon': persona('moon', 'baker', 'Baker Moon', 'midnight cinnamon rolls', 'cozy', '#FFE27A', '#FFFDF8', 4),
    'yoga-yeti': persona('yeti', 'yoga', 'Yoga Yeti', 'unbothered, mostly', 'cozy', '#DDF4F6', '#77B8C8', 1),

    'wizard-frog': persona('frog', 'wizard', 'Wizard Frog', 'knows a shortcut', 'brainy', '#78C96B', '#725AC1', 4),
    'detective-raccoon': persona(
        'raccoon',
        'detective',
        'Detective Raccoon',
        'kept the receipt',
        'brainy',
        '#9FA4AF',
        '#30313A',
        0
    ),
    'bookworm-bat': persona(
        'bat',
        'bookworm',
        'Bookworm Bat',
        'read the fine print',
        'brainy',
        '#57506E',
        '#FFC900',
        3
    ),
    'scientist-owl': persona(
        'owl',
        'scientist',
        'Scientist Owl',
        'has a spreadsheet',
        'brainy',
        '#8B674A',
        '#BDECF5',
        2
    ),
    'mechanic-robot': persona(
        'robot',
        'mechanic',
        'Mechanic Robot',
        'can probably fix it',
        'brainy',
        '#AAB4C2',
        '#F38B5B',
        0
    ),
    'gamer-cat': persona('cat', 'gamer', 'Gamer Cat', 'one more round', 'brainy', '#8C8FC7', '#98E9AB', 1),

    'disco-octopus': persona(
        'octopus',
        'disco',
        'Disco Octopus',
        'eight dance moves',
        'party',
        '#9A6BC7',
        '#FFC900',
        2
    ),
    'rockstar-strawberry': persona(
        'strawberry',
        'rockstar',
        'Rockstar Strawberry',
        'headlines the kitchen',
        'party',
        '#EB5B65',
        '#4BAE69',
        3
    ),
    'party-bee': persona('bee', 'party', 'Party Bee', 'knows everyone', 'party', '#FFC900', '#292832', 4),
    'dj-dinosaur': persona('dinosaur', 'dj', 'DJ Dinosaur', 'prehistoric bangers', 'party', '#70C989', '#6B5BC0', 0),
    'painter-panda': persona(
        'panda',
        'painter',
        'Painter Panda',
        'makes a beautiful mess',
        'party',
        '#FFFDF8',
        '#F0648D',
        2
    ),
    'karaoke-kiwi': persona(
        'kiwi',
        'karaoke',
        'Karaoke Kiwi',
        'already chose the duet',
        'party',
        '#8CBE58',
        '#7A5535',
        0
    ),

    'astronaut-avocado': persona(
        'avocado',
        'astronaut',
        'Astronaut Avocado',
        'dreams in zero gravity',
        'adventure',
        '#8FCB5A',
        '#7B5538',
        3
    ),
    'surfer-shark': persona(
        'shark',
        'surfer',
        'Surfer Shark',
        'goes with the flow',
        'adventure',
        '#68B7D8',
        '#F07068',
        0
    ),
    'skater-cactus': persona(
        'cactus',
        'skater',
        'Skater Cactus',
        'lands it eventually',
        'adventure',
        '#62B96C',
        '#E95A84',
        4
    ),
    'chef-dragon': persona(
        'dinosaur',
        'baker',
        'Chef Dragon',
        'adds a little fire',
        'adventure',
        '#70C989',
        '#F06D4F',
        1
    ),
    'sailor-banana': persona(
        'banana',
        'sailor',
        'Sailor Banana',
        'peels out at dawn',
        'adventure',
        '#F6D257',
        '#5B78B7',
        2
    ),
    'cosmic-llama': persona(
        'llama',
        'cosmic',
        'Cosmic Llama',
        'emotionally in orbit',
        'adventure',
        '#E9CBAE',
        '#765AC8',
        4
    ),
} as const satisfies Record<string, PersonaArt>

export type PersonaKey = keyof typeof PERSONAS
export const PERSONA_KEYS = Object.keys(PERSONAS) as PersonaKey[]

/**
 * Existing non-human doodle picks remain valid and available under "Classics".
 * They are intentionally secondary to the named personas, which carry more
 * banter and make the picker feel like choosing an alter ego.
 */
export const CLASSIC_AVATARS = {
    'doodle-dog': doodle('dog', 'Good Dog', 'reliably delighted', 1),
    'doodle-peanut': doodle('peanut', 'Classic Peanut', 'keeps it simple', 0),
    'doodle-sun': doodle('sun', 'Little Sun', 'morning energy', 0),
    'doodle-wave': doodle('wave', 'Big Wave', 'brings momentum', 3),
    'doodle-leaf': doodle('leaf', 'Fresh Leaf', 'touches grass', 2),
    'doodle-crystal': doodle('crystal', 'Lucky Crystal', 'good vibrations', 4),
    'doodle-guitar': doodle('guitar', 'Tiny Guitar', 'has a playlist', 1),
    'doodle-football': doodle('football', 'Match Ball', 'keeps score', 2),
    'doodle-pizza': doodle('pizza', 'Pizza Slice', 'orders for the table', 4),
    'doodle-coffee': doodle('coffee', 'Coffee Cup', 'first one awake', 1),
    'doodle-cake': doodle('cake', 'Cake Slice', 'celebrates everything', 4),
    'doodle-boat': doodle('boat', 'Little Boat', 'gets everyone home', 3),
} as const satisfies Record<string, DoodleArt>

/**
 * The nine face keys may already exist in production rows. Keep accepting them
 * forever, but redraw them as non-human personas and do not offer them in the
 * picker. This is a visual compatibility shim, not a second catalog.
 */
const LEGACY_FACE_AVATARS = {
    'face-swoop': PERSONAS['vampire-penguin'],
    'face-bob': PERSONAS['cozy-ghost'],
    'face-crop': PERSONAS['detective-raccoon'],
    'face-long': PERSONAS['astronaut-avocado'],
    'face-bun': PERSONAS['rockstar-strawberry'],
    'face-curls': PERSONAS['disco-octopus'],
    'face-cap': PERSONAS['skater-cactus'],
    'face-beard': PERSONAS['explorer-bear'],
    'face-bald': PERSONAS['wizard-frog'],
} as const satisfies Record<string, PersonaArt>

/** Every key a row may contain, including compatibility keys. */
export const AVATARS = {
    ...PERSONAS,
    ...CLASSIC_AVATARS,
    ...LEGACY_FACE_AVATARS,
} as const satisfies Record<string, AvatarArt>

export type AvatarKey = keyof typeof AVATARS

/** The actual picker order; legacy face aliases are deliberately absent. */
export const AVATAR_KEYS = [...PERSONA_KEYS, ...Object.keys(CLASSIC_AVATARS)] as AvatarKey[]

export const isAvatarKey = (value: unknown): value is AvatarKey =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(AVATARS, value)

/**
 * Draw one concrete key. New members store the result immediately, so "random"
 * means random once — never a different character on each phone or render.
 *
 * The optional exclusion makes the picker's re-roll button visibly do
 * something. Supplying the RNG keeps the boundary deterministic in tests.
 */
export function randomPersonaKey(exclude: string | null = null, random: () => number = Math.random): PersonaKey {
    const candidates = PERSONA_KEYS.filter((key) => key !== exclude)
    const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1)
    return candidates[Math.max(0, index)]
}

/**
 * Null and retired values should be rare after the backfill. Their render
 * fallback is deliberately fixed: choosing random during render would make two
 * phones disagree. New randomness belongs at the write boundary above.
 */
export const FALLBACK_AVATAR = CLASSIC_AVATARS['doodle-peanut']

export const avatarArt = (avatar: string | null | undefined, _name?: string): AvatarArt =>
    isAvatarKey(avatar) ? AVATARS[avatar] : FALLBACK_AVATAR

export const avatarFamily = (avatar: string | null): 'default' | 'persona' | 'doodle' => {
    if (!isAvatarKey(avatar)) return 'default'
    return AVATARS[avatar].kind
}
