/**
 * The data behind the room unfurl: everything the OG renderer needs, already
 * reduced to strings the shipped fonts can actually draw.
 *
 * Kept separate from the JSX so the interesting parts — name sanitization, the
 * `+N` overflow, the unknown-slug fallback — are unit-testable without booting
 * a rasterizer.
 */
import { interpolate, getTranslator } from '@/i18n/t'
import { prisma } from '@/server/db'
import { formatMinor } from '@/server/money'
import { BODY_CHARS, DISPLAY_CHARS } from '@/server/og/fonts'
import { themeFor, type RoomTheme } from '@/lib/themes'

/** Shown instead of a name we cannot draw. Better than a row of blank boxes. */
export const NAME_FALLBACK = 'A split'
/** Two lines of the smallest display size. Beyond this it stops being a title. */
export const MAX_NAME_CHARS = 40
/** Shown instead of a member name we cannot draw. */
export const MEMBER_FALLBACK = 'Someone'
/** A member name is one line inside a sentence, not a headline. */
export const MAX_MEMBER_CHARS = 22
/** Faces in the avatar row before it collapses into a `+N` chip. */
export const MAX_AVATARS = 6

/**
 * Six design-system fills, all legible with warm dark ink on a white card, and all
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

/**
 * Every sentence on the card that is not somebody's name, in the room's own
 * language.
 *
 * A room link's unfurl is the ONE screen a suspicious invitee reads before
 * deciding whether to tap something a friend dropped in a group chat, and it was
 * hard English regardless of the language the room was started in. The crawler
 * that renders it carries no cookie and no useful `Accept-Language`, so the room
 * has to remember — see `Room.locale`.
 *
 * Written as templates rather than resolved through ICU because the translator
 * this file reaches for (`i18n/t.ts`) deliberately is not an ICU implementation:
 * it substitutes `{param}` and nothing else, so a plural has to be two keys and
 * a branch rather than one message. Two keys is the cheaper of the two costs.
 */
export interface CardCopy {
    statNone: string
    /** `{amount}`. */
    statOne: string
    /** `{count}`, `{amount}`. */
    statMany: string
    peopleOne: string
    /** `{count}`. */
    peopleMany: string
    emptyRoster: string
    tagline: string
}

/**
 * The literals this file shipped with. They are the default for every pure
 * function below, so the unit tests stay about the arithmetic, and they are what
 * the brand card and an unknown slug get — neither has a room to have a language.
 */
export const ENGLISH_CARD_COPY: CardCopy = {
    statNone: 'No expenses yet',
    statOne: '1 expense · {amount} so far',
    statMany: '{count} expenses · {amount} so far',
    peopleOne: '1 person',
    peopleMany: '{count} people',
    emptyRoster: 'Nobody has joined yet',
    tagline: 'no signup · free forever',
}

/** The card's copy in a room's own language. Null (and anything unrecognised)
 *  falls back to English through `getTranslator` itself. */
export async function cardCopy(locale: string | null | undefined): Promise<CardCopy> {
    const t = await getTranslator(locale ?? 'en')
    const [statNone, statOne, statMany, peopleOne, peopleMany, emptyRoster, tagline] = await Promise.all([
        t('preview.statNone'),
        t('preview.statOne'),
        t('preview.statMany'),
        t('preview.peopleOne'),
        t('preview.peopleMany'),
        t('preview.emptyRoster'),
        t('preview.tagline'),
    ])
    return { statNone, statOne, statMany, peopleOne, peopleMany, emptyRoster, tagline }
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
    /** "3 expenses · $128.50 so far" — localized and font-safe. */
    stat: string
    /** "6 people", or `emptyRoster` when nobody has joined. */
    people: string
    /** The strip under the card. Localized and font-safe like the rest. */
    tagline: string
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
 * Reduce a name to something ONE of the shipped OG fonts can draw.
 *
 * Dropping unmappable characters is fine for the odd emoji or stray symbol, but
 * a wholly non-Latin name ("Кипр 2026") would survive as a meaningless "2026".
 * So: keep the stripped name only when it still reads as the same name — at
 * least one alphanumeric left, and at least 70% of the meaningful characters
 * retained. Otherwise fall back rather than ship something half-eaten.
 *
 * One function, two bindings below. A room name is a headline in the display
 * font; a member name is one line inside a sentence in the body font. The
 * charset, the fallback and the ceiling are the only differences — and these
 * were two hand-copied implementations until they drifted: only one of them
 * dropped the trailing comma before the dots.
 */
export function sanitizeForFont(
    raw: string,
    options: { charset: ReadonlySet<string>; fallback: string; max: number }
): string {
    const kept = [...raw]
        .filter((ch) => options.charset.has(ch))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()

    if (!/[A-Za-z0-9]/.test(kept)) return options.fallback

    const meaningful = countMeaningful(raw)
    if (meaningful > 0 && countMeaningful(kept) / meaningful < 0.7) return options.fallback

    return truncate(kept, options.max)
}

/** The room's own name, as the unfurl's headline. */
export const sanitizeDisplayName = (raw: string): string =>
    sanitizeForFont(raw, { charset: DISPLAY_CHARS, fallback: NAME_FALLBACK, max: MAX_NAME_CHARS })

/** A member's name, as it appears inside a recap sentence. */
export const sanitizeMemberName = (raw: string): string =>
    sanitizeForFont(raw, { charset: BODY_CHARS, fallback: MEMBER_FALLBACK, max: MAX_MEMBER_CHARS })

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

/**
 * Anything the body font cannot draw, dropped.
 *
 * `safeAmount` already does this for the amount, where the failure is a known one
 * (`฿` is outside Sniglet). A translated sentence is the other half: the shipped
 * copy is Latin-1 and draws fine, but a catalog is edited by people rather than
 * by this file, and one pasted typographic character nobody thought about would
 * put a blank rectangle in the middle of the product's storefront. The filter
 * costs nothing and removes the class.
 */
const bodySafe = (value: string): string =>
    [...value]
        .filter((ch) => BODY_CHARS.has(ch))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()

export function statLine(
    expenseCount: number,
    totalMinor: bigint,
    code: string,
    copy: CardCopy = ENGLISH_CARD_COPY
): string {
    if (expenseCount === 0) return bodySafe(copy.statNone)
    const amount = safeAmount(totalMinor, code)
    const template = expenseCount === 1 ? copy.statOne : copy.statMany
    return bodySafe(interpolate(template, { count: expenseCount, amount }))
}

/** "1 person" / "6 people", or the empty-roster line. Same font discipline. */
export function peopleLine(memberCount: number, copy: CardCopy = ENGLISH_CARD_COPY): string {
    if (memberCount === 0) return bodySafe(copy.emptyRoster)
    return bodySafe(memberCount === 1 ? copy.peopleOne : interpolate(copy.peopleMany, { count: memberCount }))
}

/** Shape the raw room row into card data. Exported for tests; no I/O. */
export function toRoomCard(
    room: {
        name: string
        emoji: string | null
        currency: string
        theme?: string | null
        members: { name: string }[]
        expenses: { baseAmountMinor: bigint }[]
    },
    copy: CardCopy = ENGLISH_CARD_COPY
): RoomCardData {
    const total = room.expenses.reduce((sum, e) => sum + e.baseAmountMinor, 0n)
    const { avatars, overflow } = avatarsFor(room.members.map((m) => m.name))
    return {
        name: sanitizeDisplayName(room.name),
        emoji: room.emoji,
        avatars,
        overflow,
        memberCount: room.members.length,
        stat: statLine(room.expenses.length, total, room.currency, copy),
        people: peopleLine(room.members.length, copy),
        tagline: bodySafe(copy.tagline),
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
            locale: true,
            members: { orderBy: { createdAt: 'asc' }, select: { name: true } },
            expenses: { where: { deletedAt: null }, select: { baseAmountMinor: true } },
        },
    })
    return room ? toRoomCard(room, await cardCopy(room.locale)) : null
}
