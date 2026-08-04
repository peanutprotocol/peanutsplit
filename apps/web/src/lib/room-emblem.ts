import { isDoodleName, type DoodleName } from '@/components/ui/doodles'
import { isRoomDrawing } from '@/lib/room-drawing'
import { FALLBACK_DOODLE, roomDoodleFor } from '@/lib/room-doodle'

/** The old sixteen-option room picker, translated at render time. The stored
 * value stays untouched while every visual room surface uses Split's own drawing;
 * text-only surfaces omit the emblem. */
const LEGACY_EMBLEM_DOODLES: Record<string, DoodleName> = {
    '🥜': 'peanut',
    '🏔️': 'mountain',
    '🏝️': 'island',
    '🍕': 'pizza',
    '🍻': 'beer',
    '🏠': 'house',
    '🚐': 'van',
    '🎿': 'ski',
    '⛷️': 'ski',
    '🎉': 'party',
    '🛒': 'cart',
    '✈️': 'plane',
    '🎸': 'guitar',
    '🏕️': 'tent',
    '🍜': 'noodles',
    '⛵': 'boat',
    '🎂': 'cake',
    '🧾': 'iconreceipt',
}

/**
 * What the `emoji` column holds, now that rooms are drawn rather than typed.
 *
 * THE COLUMN DID NOT CHANGE AND THERE IS NO MIGRATION. It stores a short string; it now stores
 * a doodle name (`"mountain"`) for new rooms and still stores an emoji character (`"🏔️"`) for
 * every room made before this. Both are valid forever — a room's emblem is not worth a
 * migration that can only half-succeed, and a rewrite would have to guess which drawing somebody
 * meant by 🎿 anyway.
 *
 * The rule that tells them apart is the whole design: a value is a doodle if the generated set
 * has that name, and an emoji otherwise. There is no ambiguity to manage, because emoji
 * characters are pictographic and doodle names are lowercase ASCII words — no string is both.
 *
 * `emoji` is also the wrong name for the column now, and renaming it would touch the schema, the
 * API types, the import path and the OG loader for no behavioural gain. It is called an emblem
 * everywhere above the database instead.
 */
export function emblemDoodle(value: string | null | undefined): DoodleName | null {
    if (!value) return null
    if (isDoodleName(value)) return value
    return LEGACY_EMBLEM_DOODLES[value] ?? null
}

/**
 * The drawing a room actually shows.
 *
 * NOTHING STORED MEANS "FOLLOW THE ROOM NAME". That is the reason the name and the drawing are
 * one control instead of two: the create form has always resolved `emblem ?? roomDoodleFor(name)`
 * while somebody types, and this is the same rule applied at render, so a room that never picked
 * a drawing keeps tracking its name after a rename too.
 *
 * A value that IS stored but cannot be read — a room whose emoji is not in the legacy table —
 * stays on the peanut rather than falling through to the name. It is still a pin; we just cannot
 * draw it, and quietly re-deriving it from the name would change a picture somebody chose.
 */
export function roomEmblemDoodle(stored: string | null | undefined, name: string): DoodleName {
    if (!stored) return roomDoodleFor(name)
    return emblemDoodle(stored) ?? FALLBACK_DOODLE
}

/**
 * The exact emblem value an interactive surface should render and select.
 *
 * Presets still resolve through the legacy/name-following chain above. A custom
 * drawing is already a complete, validated emblem, so it must survive that
 * resolution instead of being reduced to the peanut fallback used by
 * doodle-only decoration such as confetti.
 */
export function roomEmblemValue(stored: string | null | undefined, name: string): string {
    return isRoomDrawing(stored) ? stored : roomEmblemDoodle(stored, name)
}

/**
 * What a tap in the drawing picker must store, or `null` when it must store nothing.
 *
 * Two things the picker got wrong, both fixed here. It compared the tapped drawing against the
 * STORED value, so tapping the drawing already on screen was not a no-op: a room following its
 * name got that name's drawing written in, which froze it. And it only ever wrote a drawing name,
 * so once a drawing was pinned there was no way back to following the name.
 *
 * The rule needs no second control: the drawing the NAME produces is the "follow the name" option,
 * because picking it is indistinguishable from following — the room shows exactly that drawing
 * either way. So it is stored as nothing, and a later rename moves the drawing again.
 *
 * A write is skipped only when it would change neither the drawing on screen nor whether the room
 * is pinned — which is what makes tapping what you can already see do nothing at all.
 */
export function emblemChoice(
    tapped: string,
    stored: string | null | undefined,
    name: string
): { emblem: string | null } | null {
    if (isRoomDrawing(tapped)) return tapped === stored ? null : { emblem: tapped }
    if (!isDoodleName(tapped)) return null
    const emblem = tapped === roomDoodleFor(name) ? null : tapped
    const pinned = Boolean(stored)
    const pinChanged = (emblem === null) === pinned
    if (!pinChanged && roomEmblemDoodle(stored, name) === tapped) return null
    return { emblem }
}
