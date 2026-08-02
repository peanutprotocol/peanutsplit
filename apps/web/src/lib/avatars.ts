/**
 * The member-avatar catalog.
 *
 * Split has no profiles, so an avatar should feel like a table nickname rather
 * than a miniature biometric. Every selectable identity is an animal, snack,
 * monster or object with a joke attached. Nothing asks the person's gender,
 * age, skin colour or appearance, and nothing is inferred from their name.
 *
 * The joke is always a lovable flaw or a group role — the friend who is ready
 * "in five minutes", the one with the spreadsheet — told in third person and
 * kept charming. A person picks their own character, so wearing it is a proud
 * self-own, never an accusation.
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
 * Thirty-six named personas plus twelve classics. The first sixteen keep the
 * exact deterministic paths and palettes reviewed in the doodle canary picker;
 * the twenty that follow are the cast-36 expansion (design/doodles/parts/07–10).
 */
export const PERSONAS = {
    'vampire-penguin': persona(
        'personavampirepenguin',
        'Vampire Penguin',
        'Avoids mornings',
        '#F8D8ED',
        '#C9B8F4',
        '#50355F'
    ),
    'pirate-parrot': persona(
        'personapirateparrot',
        'Pirate Parrot',
        'Confidently lost',
        '#CDEDF2',
        '#FFD78A',
        '#185A67'
    ),
    'cozy-ghost': persona('personacozyghost', 'Cozy Ghost', 'Ghosts the goodbye', '#DDE2FF', '#FFDBA6', '#4A4D83'),
    'wizard-frog': persona('personawizardfrog', 'Wizard Frog', 'Has a trick for it', '#D6F1D4', '#CDBCF5', '#315E42'),
    'astronaut-avocado': persona(
        'personaastronautavocado',
        'Astronaut Avocado',
        'In another orbit',
        '#CDEBF8',
        '#C8EDB5',
        '#27506B'
    ),
    'disco-octopus': persona(
        'personadiscooctopus',
        'Disco Octopus',
        'Everywhere at once',
        '#F8D2E5',
        '#BDEBF2',
        '#713D68'
    ),
    'tea-dragon': persona('personateadragon', 'Tea Dragon', 'Kettle always on', '#FFE4BB', '#F5B9B3', '#7B4532'),
    'raincoat-duck': persona('personaraincoatduck', 'Raincoat Duck', 'Hopes it rains', '#BFE3F2', '#FFE487', '#225D77'),
    'skater-snail': persona('personaskatersnail', 'Skater Snail', 'Ready in five', '#D9F2CF', '#F7C5E6', '#365D42'),
    'moon-bunny': persona('personamoonbunny', 'Moon Bunny', 'Quietly thrilled', '#E6DEFA', '#F9D3DC', '#514875'),
    // Keep the already-shipped storage key while adopting the approved name
    // and drawing. Existing rooms upgrade visually without a data migration.
    'rockstar-strawberry': persona(
        'personarockstarberry',
        'Rockstar Berry',
        'Toast earns encore',
        '#F9C9D4',
        '#C7E8C1',
        '#7A304A'
    ),
    'baker-moon': persona('personabakermoon', 'Baker Moon', 'Midnight snacks', '#FFF0B8', '#D6C5F4', '#6D5730'),
    'party-bee': persona('personapartybee', 'Party Bee', 'Tuesday? Party.', '#FFE69A', '#F6C5E3', '#665020'),
    'garden-yeti': persona('personagardenyeti', 'Garden Yeti', 'Waters the plants', '#D5EDC6', '#F9D38D', '#3F6040'),
    'pancake-bear': persona('personapancakebear', 'Pancake Bear', 'Dinner scout', '#FFE0B8', '#C7E8D0', '#714A33'),
    'pocket-robot': persona('personapocketrobot', 'Pocket Robot', 'Backup ready', '#CBE7ED', '#FFD28E', '#315B64'),
    'snooze-sloth': persona('personasnoozesloth', 'Snooze Sloth', 'Five more minutes', '#E8E4F8', '#F9D3A8', '#4E4468'),
    'hangry-goblin': persona(
        'personahangrygoblin',
        'Hangry Goblin',
        'Nice after a snack',
        '#D9F2CF',
        '#FFD78A',
        '#3A5E35'
    ),
    'chaos-gremlin': persona(
        'personachaosgremlin',
        'Chaos Gremlin',
        'No plan, all luck',
        '#FFD9C9',
        '#C9B8F4',
        '#6B4226'
    ),
    'drama-prawn': persona('personadramaprawn', 'Drama Prawn', 'Makes issues epic', '#F8D2E5', '#BDEBF2', '#7A3055'),
    'fomo-firefly': persona(
        'personafomofirefly',
        'FOMO Firefly',
        'Cannot leave early',
        '#FFF0B8',
        '#C8EDB5',
        '#665020'
    ),
    'overpacker-hamster': persona(
        'personaoverpackerhamster',
        'Overpacker Hamster',
        'Packs every season',
        '#FFDFD0',
        '#BDECF5',
        '#71462B'
    ),
    'spreadsheet-owl': persona(
        'personaspreadsheetowl',
        'Spreadsheet Owl',
        'Has a tab for that',
        '#DDE2FF',
        '#FAE184',
        '#41487E'
    ),
    'snack-alpaca': persona('personasnackalpaca', 'Snack Alpaca', 'Bag is 80% snacks', '#FFEBC9', '#F7C5E6', '#6B4A2E'),
    'group-chat-magpie': persona(
        'personagroupchatmagpie',
        'Group-Chat Magpie',
        'Sends every link',
        '#CDEDF2',
        '#F6C7EC',
        '#1F5561'
    ),
    'paparazzi-puffin': persona(
        'personapaparazzipuffin',
        'Paparazzi Puffin',
        'Takes 300 photos',
        '#CDEBF8',
        '#FFD78A',
        '#27506B'
    ),
    'lost-duckling': persona(
        'personalostduckling',
        'Lost Duckling',
        'Right behind you',
        '#FFF4CC',
        '#BDECF5',
        '#6B5720'
    ),
    'karaoke-newt': persona('personakaraokenewt', 'Karaoke Newt', 'First on the mic', '#F8D8ED', '#CDBCF5', '#6B3560'),
    'tupperware-turtle': persona(
        'personatupperwareturtle',
        'Tupperware Turtle',
        'Saves leftovers',
        '#C9EFE3',
        '#FFDBA6',
        '#2F5E45'
    ),
    'thermostat-gremlin': persona(
        'personathermostatgremlin',
        'Thermostat Gremlin',
        'Always two degrees',
        '#CBE7ED',
        '#F5B9B3',
        '#35566B'
    ),
    'detective-raccoon': persona(
        'personadetectiveraccoon',
        'Detective Raccoon',
        'Knows who took it',
        '#E6DEFA',
        '#FFE487',
        '#4A3F78'
    ),
    'dj-dinosaur': persona('personadjdinosaur', 'DJ Dinosaur', 'Ignores requests', '#D5EDC6', '#F6C7EC', '#3C6033'),
    'gamer-cat': persona('personagamercat', 'Gamer Cat', 'One more round', '#FFE69A', '#C9D3F3', '#66501C'),
    'bookworm-bat': persona('personabookwormbat', 'Bookworm Bat', 'One more chapter', '#EDE3FA', '#FFE487', '#52407A'),
    'trickster-fox': persona(
        'personatricksterfox',
        'Trickster Fox',
        'Renamed the chat',
        '#FFDCC2',
        '#BDEBF2',
        '#7A4526'
    ),
    'punk-pineapple': persona(
        'personapunkpineapple',
        'Punk Pineapple',
        'Spikes, no bite',
        '#FDF0A6',
        '#F7C5E6',
        '#6E5A1B'
    ),
} as const satisfies Record<string, PersonaArt>

export type PersonaKey = keyof typeof PERSONAS
export const PERSONA_KEYS = Object.keys(PERSONAS) as PersonaKey[]

/**
 * Existing non-human doodle picks remain available as classics. Together with
 * the named cast they make forty-eight visible options.
 */
export const CLASSIC_AVATARS = {
    'doodle-dog': classic('dog', 'Good Dog', 'Reliably delighted', '#FFF4CC', '#B8F0C5'),
    'doodle-peanut': classic('peanut', 'Classic Peanut', 'Keeps it simple', '#FAE184', '#F6C7EC'),
    'doodle-sun': classic('sun', 'Little Sun', 'Aggressively awake', '#FAE184', '#BDECF5'),
    'doodle-wave': classic('wave', 'Big Wave', 'Swims any weather', '#BDECF5', '#FFF4CC'),
    'doodle-leaf': classic('leaf', 'Fresh Leaf', 'Touches grass', '#B8F0C5', '#FFF4CC'),
    'doodle-crystal': classic('crystal', 'Lucky Crystal', 'Trusts the vibes', '#F6C7EC', '#C9D3F3'),
    'doodle-guitar': classic('guitar', 'Tiny Guitar', 'Will play it', '#FFF4CC', '#F6C7EC'),
    'doodle-football': classic('football', 'Match Ball', 'Keeps score', '#B8F0C5', '#C9D3F3'),
    'doodle-pizza': classic('pizza', 'Pizza Slice', 'Table order boss', '#F6C7EC', '#FAE184'),
    'doodle-coffee': classic('coffee', 'Coffee Cup', 'First one awake', '#FFF4CC', '#C9D3F3'),
    'doodle-cake': classic('cake', 'Cake Slice', 'Celebrates it all', '#F6C7EC', '#FFF4CC'),
    'doodle-boat': classic('boat', 'Little Boat', 'Gets everyone home', '#BDECF5', '#FAE184'),
} as const satisfies Record<string, DoodleArt>

/**
 * Keys from the first alter-ego release can already be stored in production.
 * Keep accepting all of them, but redraw each through an approved doodle and
 * omit it from the picker. This is a compatibility shim, not a second catalog.
 *
 * Six first-release keys (detective-raccoon, dj-dinosaur, gamer-cat,
 * bookworm-bat, trickster-fox, punk-pineapple) graduated into the real cast in
 * the cast-36 expansion, so they live in PERSONAS above, not here.
 */
const RETIRED_PERSONAS = {
    'ninja-pear': PERSONAS['skater-snail'],
    'lucky-alien': PERSONAS['pocket-robot'],
    'garden-snail': PERSONAS['skater-snail'],
    'sleepy-cloud': PERSONAS['snooze-sloth'],
    'explorer-bear': PERSONAS['pancake-bear'],
    'yoga-yeti': PERSONAS['garden-yeti'],
    'mechanic-robot': PERSONAS['pocket-robot'],
    'karaoke-kiwi': PERSONAS['karaoke-newt'],
    'scientist-owl': PERSONAS['spreadsheet-owl'],
    'chef-dragon': PERSONAS['tea-dragon'],
    'sailor-banana': PERSONAS['pirate-parrot'],
    'cosmic-llama': PERSONAS['snack-alpaca'],
    'surfer-shark': PERSONAS['raincoat-duck'],
    'skater-cactus': PERSONAS['skater-snail'],
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

/** The same fallback as a key, for the callers that pass a persona across a boundary rather than
 *  render it — `avatar` is null on legacy rows, and the card route 404s on a null. */
export const FALLBACK_AVATAR_KEY = 'doodle-peanut' satisfies AvatarKey

export const avatarArt = (avatar: string | null | undefined, _name?: string): AvatarArt =>
    isAvatarKey(avatar) ? AVATARS[avatar] : FALLBACK_AVATAR

export const avatarFamily = (avatar: string | null): 'default' | 'persona' | 'doodle' => {
    if (!isAvatarKey(avatar)) return 'default'
    return AVATARS[avatar].kind
}
