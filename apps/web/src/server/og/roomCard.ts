/**
 * The data behind the room unfurl: everything the OG renderer needs, already
 * reduced to strings the shipped fonts can actually draw.
 *
 * Kept separate from the JSX so the interesting parts — name sanitization, the
 * `+N` overflow, the unknown-slug fallback — are unit-testable without booting
 * a rasterizer.
 */
import { prisma } from '@/server/db'
import { formatMinor } from '@/server/money'
import { BODY_CHARS, DISPLAY_CHARS } from '@/server/og/fonts'
import { themeFor, type RoomTheme } from '@/lib/themes'

/** Shown instead of a name we cannot draw. Better than a row of blank boxes. */
export const NAME_FALLBACK = 'A split'
/** Two lines of the smallest display size. Beyond this it stops being a title. */
export const MAX_NAME_CHARS = 40
/** Faces in the avatar row before it collapses into a `+N` chip. */
export const MAX_AVATARS = 6

/**
 * Six design-system fills, all legible with black ink on a white card, and all
 * distinct in hue — the app's avatar palette has two yellows and a near-white
 * lavender, which turn a row of overlapping discs into one smear at thumbnail
 * size. Widely-spaced hues are the whole point here.
 */
export const AVATAR_COLORS = ['#FFC900', '#98E9AB', '#90A8ED', '#FF90E8', '#AE7AFF', '#E99898'] as const

export interface OgAvatar {
    /** A single body-font-safe character. */
    letter: string
    color: string
}

export interface RoomCardData {
    /** Display-font-safe, already truncated. */
    name: string
    /** Raw emoji as stored — the renderer resolves it to an image, not a glyph. */
    emoji: string | null
    avatars: OgAvatar[]
    /** Members not shown in the row; 0 when everyone fits. */
    overflow: number
    memberCount: number
    /** "3 expenses · $128.50 so far" */
    stat: string
    /** Resolved, never a raw key — the renderer must not have to know what a
     *  missing or unknown theme means. This is the whole point of the feature:
     *  re-theme a room and the unfurl in the group chat follows within the
     *  300s cache window. */
    theme: RoomTheme
}

/** Emoji, variation selectors and ZWJ — present in names, never renderable. */
const DECORATIVE = new RegExp('[\\p{Extended_Pictographic}\\u200D\\uFE00-\\uFE0F]', 'u')

const isDecorative = (ch: string) => DECORATIVE.test(ch)

const countMeaningful = (value: string) => [...value].filter((ch) => !/\s/.test(ch) && !isDecorative(ch)).length

function truncate(value: string, max: number): string {
    const chars = [...value]
    if (chars.length <= max) return value
    // `…` is not in the display font's cmap — three dots always are.
    return `${chars
        .slice(0, max)
        .join('')
        .trimEnd()
        .replace(/[.,;:\-–—]+$/, '')}...`
}

/**
 * Reduce a room name to something the display font can draw.
 *
 * Dropping unmappable characters is fine for the odd emoji or stray symbol, but
 * a wholly non-Latin name ("Кипр 2026") would survive as a meaningless "2026".
 * So: keep the stripped name only when it still reads as the same name — at
 * least one alphanumeric left, and at least 70% of the meaningful characters
 * retained. Otherwise fall back rather than ship something half-eaten.
 */
export function sanitizeDisplayName(raw: string): string {
    const kept = [...raw]
        .filter((ch) => DISPLAY_CHARS.has(ch))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()

    if (!/[A-Za-z0-9]/.test(kept)) return NAME_FALLBACK

    const meaningful = countMeaningful(raw)
    if (meaningful > 0 && countMeaningful(kept) / meaningful < 0.7) return NAME_FALLBACK

    return truncate(kept, MAX_NAME_CHARS)
}

/** First drawable letter of a member's name, diacritics folded away. Checked
 *  against the display font because that is what the avatar discs render in. */
export function avatarLetter(name: string): string {
    const folded = name.normalize('NFD').replace(/\p{M}/gu, '')
    const ascii = folded.match(/[A-Za-z0-9]/)
    if (ascii) return ascii[0].toUpperCase()
    const drawable = [...name].find((ch) => DISPLAY_CHARS.has(ch) && /\S/.test(ch))
    return drawable ? drawable.toUpperCase() : '?'
}

/** FNV-1a — stable across processes, unlike anything seeded at boot. */
function hash(value: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h
}

export const avatarColor = (name: string): string => AVATAR_COLORS[hash(name) % AVATAR_COLORS.length]

export function avatarsFor(
    names: readonly string[],
    max: number = MAX_AVATARS
): { avatars: OgAvatar[]; overflow: number } {
    const shown = names.slice(0, max)
    const avatars: OgAvatar[] = []
    for (const name of shown) {
        // The discs overlap, so two identical neighbours read as one blob. Nudge
        // the collision along the palette rather than re-seeding the hash.
        let color = avatarColor(name)
        const previous = avatars[avatars.length - 1]?.color
        if (color === previous) {
            color =
                AVATAR_COLORS[
                    (AVATAR_COLORS.indexOf(color as (typeof AVATAR_COLORS)[number]) + 1) % AVATAR_COLORS.length
                ]
        }
        avatars.push({ letter: avatarLetter(name), color })
    }
    return { avatars, overflow: Math.max(0, names.length - shown.length) }
}

/**
 * `formatMinor` output, guaranteed drawable. Thai baht is the live example: `฿`
 * is outside Sniglet, so the symbol gives way to the ISO code rather than a gap.
 */
export function safeAmount(totalMinor: bigint, code: string): string {
    let formatted: string
    try {
        formatted = formatMinor(totalMinor, code)
    } catch {
        return `${totalMinor.toString()} ${code}`
    }
    if ([...formatted].every((ch) => BODY_CHARS.has(ch))) return formatted
    const stripped = [...formatted]
        .filter((ch) => BODY_CHARS.has(ch))
        .join('')
        .trim()
    return stripped ? `${stripped} ${code}` : `${totalMinor.toString()} ${code}`
}

export function statLine(expenseCount: number, totalMinor: bigint, code: string): string {
    if (expenseCount === 0) return 'No expenses yet'
    const noun = expenseCount === 1 ? 'expense' : 'expenses'
    return `${expenseCount} ${noun} · ${safeAmount(totalMinor, code)} so far`
}

/** Shape the raw room row into card data. Exported for tests; no I/O. */
export function toRoomCard(room: {
    name: string
    emoji: string | null
    currency: string
    theme?: string | null
    members: { name: string }[]
    expenses: { baseAmountMinor: bigint }[]
}): RoomCardData {
    const total = room.expenses.reduce((sum, e) => sum + e.baseAmountMinor, 0n)
    const { avatars, overflow } = avatarsFor(room.members.map((m) => m.name))
    return {
        name: sanitizeDisplayName(room.name),
        emoji: room.emoji,
        avatars,
        overflow,
        memberCount: room.members.length,
        stat: statLine(room.expenses.length, total, room.currency),
        theme: themeFor(room.theme),
    }
}

/**
 * One query, no relations loaded that the card does not draw. Returns null for
 * an unknown slug — the caller renders the generic brand image, never a 500,
 * because a broken unfurl is what a stale link looks like to a whole group chat.
 */
export async function loadRoomCard(slug: string): Promise<RoomCardData | null> {
    const room = await prisma.room.findUnique({
        where: { slug },
        select: {
            name: true,
            emoji: true,
            currency: true,
            theme: true,
            members: { orderBy: { createdAt: 'asc' }, select: { name: true } },
            expenses: { where: { deletedAt: null }, select: { baseAmountMinor: true } },
        },
    })
    return room ? toRoomCard(room) : null
}
