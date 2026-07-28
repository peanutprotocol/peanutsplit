import { isDoodleName, type DoodleName } from '@/components/ui/doodles'

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
    return value && isDoodleName(value) ? value : null
}

/**
 * True when the stored value is a literal emoji character — a legacy room, or one imported from
 * Splitwise before the swap.
 *
 * This exists so the places that put the emblem into TEXT can ask. A push notification titled
 * "🏔️ Ski trip" reads correctly; the same line built from a doodle room says "mountain Ski trip",
 * which is the failure mode this whole file is here to prevent.
 */
export function isEmojiEmblem(value: string | null | undefined): boolean {
    return !!value && !isDoodleName(value)
}
