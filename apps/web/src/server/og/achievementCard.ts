/**
 * The data behind the six achievement cards.
 *
 * Same split as `roomCard.ts` and `recapCard.ts`: the shaping is pure and here,
 * the JSX is in `achievementCardArt.tsx`, and only strings the two shipped fonts
 * can draw ever cross between them. `fonts.ts` explains why that matters — there
 * is no fallback glyph, so an unmapped codepoint is a blank box in a group chat.
 *
 * The property that makes these cards shareable is structural, not a flag: NO
 * card shape below has a money field, and only `invite` has a name field — the
 * ROOM's, which is strictly less than the `/r/[slug]` unfurl already prints into
 * the same group chat. There is nothing to redact at render time because there
 * is nothing to redact. `achievementCard.test.ts` asserts that over the whole
 * union, so a seventh kind added without thought fails there.
 *
 * The slug is likewise absent. `crew` needs a per-room-stable scatter and takes
 * a NUMBER for it (`hash(slug)`), not the slug: the card data is serialized in
 * tests and could be logged, and the slug is the room's credential.
 */
import { type DoodleName } from '@/components/ui/doodles'
import { AWARD_IDS, type AlterEgoCardParams, type AwardId, type CardKind } from '@/lib/achievements-contract'
import { isAvatarKey } from '@/lib/avatars'
import { currencyDoodle } from '@/lib/currency-doodle'
import { roomEmblemDoodle } from '@/lib/room-emblem'
import { daySpan } from '@/lib/story'
import { themeFor, type RoomTheme } from '@/lib/themes'
import { getTranslator } from '@/i18n/t'
import { prisma } from '@/server/db'
import { bodySafe, displaySafe, hash, sanitizeDisplayName } from '@/server/og/roomCard'

/** Faces in the crew lineup. Higher than the unfurl's six on purpose: the crew
 *  card's whole subject is how many people are in the room, and it has the whole
 *  sheet rather than one row beside a headline. */
export const MAX_LINEUP = 8
/** Stamps on the passport. Beyond six they stop being stamps and become a grid. */
export const MAX_STAMPS = 6

/** One currency's stamp. `doodle` is null when the sign has no drawing — see
 *  `lib/currency-doodle.ts` on why a near-miss drawing is worse than the code. */
export interface CurrencyStamp {
    code: string
    doodle: DoodleName | null
}

interface CardFrame {
    theme: RoomTheme
}

export type AchievementCardData =
    | (CardFrame & {
          kind: 'invite'
          /** The ROOM's name, display-font-safe and already truncated. */
          name: string
          emblem: DoodleName
          tagline: string
      })
    | (CardFrame & {
          kind: 'crew'
          title: string
          line: string
          count: number
          /** Avatar KEYS, never names. Null is a legacy row and draws the fallback. */
          personas: (string | null)[]
          overflow: number
          /** `hash(slug)`, so the confetti is the same on every render and every box. */
          seed: number
      })
    | (CardFrame & { kind: 'passport'; title: string; line: string; stamps: CurrencyStamp[] })
    | (CardFrame & { kind: 'alterego'; title: string; line: string; award: string; persona: string })
    | (CardFrame & { kind: 'stats'; title: string; days: number; expenses: number; people: number })
    | (CardFrame & { kind: 'landing'; title: string; people: number; settlements: number })

/**
 * The card's own copy, in the room's language.
 *
 * Resolved through `getTranslator` for the reason `roomCard.ts` gives: this is
 * not a component, and `i18n/t.ts` is deliberately not an ICU implementation. So
 * `card.*` holds no plural syntax — the WRAPPED cards draw numerals beside
 * drawings instead of writing counts, which is what makes them free of plurals
 * in three languages.
 */
type Copy = (key: string, params?: Record<string, string | number>) => Promise<string>

// ---------------------------------------------------------------- pure shaping

export async function toInviteCard(
    room: { name: string; emoji: string | null; theme: string | null },
    t: Copy
): Promise<AchievementCardData> {
    return {
        kind: 'invite',
        theme: themeFor(room.theme),
        name: sanitizeDisplayName(room.name),
        // Resolved from the RAW name, like every other emblem surface: an unset
        // emblem follows what the room is actually called.
        emblem: roomEmblemDoodle(room.emoji, room.name),
        tagline: bodySafe(await t('preview.tagline')),
    }
}

export async function toCrewCard(
    room: { theme: string | null; members: { avatar: string | null }[] },
    seed: number,
    t: Copy
): Promise<AchievementCardData> {
    const shown = room.members.slice(0, MAX_LINEUP)
    return {
        kind: 'crew',
        theme: themeFor(room.theme),
        title: displaySafe(await t('card.crew.title')),
        line: bodySafe(await t('card.crew.line')),
        count: room.members.length,
        personas: shown.map((m) => m.avatar),
        overflow: Math.max(0, room.members.length - shown.length),
        seed,
    }
}

/** The award ids the route will accept, as a type guard — the closed set that
 *  keeps a query string from carrying anything but a catalog key. */
export const isAwardId = (value: unknown): value is AwardId =>
    typeof value === 'string' && (AWARD_IDS as readonly string[]).includes(value)

/** Distinct EXPENSE currencies, normalised and sorted, uncapped. Not the room
 *  currency: a room that settles in EUR with EUR-only expenses has one currency,
 *  correctly. The art caps; the COUNT must not — see `toPassportCard`. */
export function distinctCurrencies(currencies: readonly string[]): string[] {
    return [...new Set(currencies.map((code) => code.toUpperCase()))].sort()
}

/** The stamps drawn on the passport, capped. Beyond `MAX_STAMPS` they stop being
 *  stamps and become a grid. */
export function currencyStamps(currencies: readonly string[]): CurrencyStamp[] {
    return distinctCurrencies(currencies)
        .slice(0, MAX_STAMPS)
        .map((code) => ({ code, doodle: currencyDoodle(code) }))
}

export async function toPassportCard(
    room: { theme: string | null; expenses: { currency: string }[] },
    t: Copy
): Promise<AchievementCardData> {
    const codes = room.expenses.map((e) => e.currency)
    // The line counts the trip, the stamps draw it. Reading the count off the capped
    // stamp list made an eight-currency room say "6 currencies" — the art has a
    // reason to stop at six and the sentence does not.
    const stamps = currencyStamps(codes)
    return {
        kind: 'passport',
        theme: themeFor(room.theme),
        title: displaySafe(await t('card.passport.title')),
        line: bodySafe(await t('card.passport.line', { count: distinctCurrencies(codes).length })),
        stamps,
    }
}

/**
 * The alter-ego card, or null for an input outside its closed sets.
 *
 * `isAvatarKey` rather than `AVATAR_KEYS`: stored rows hold retired and legacy
 * keys that the picker no longer offers, and the member who earned an award is
 * exactly as likely to be an old row as a new one.
 */
export async function toAlterEgoCard(
    room: { theme: string | null },
    params: AlterEgoCardParams,
    t: Copy
): Promise<AchievementCardData | null> {
    if (!isAwardId(params.award)) return null
    if (!isAvatarKey(params.persona)) return null
    return {
        kind: 'alterego',
        theme: themeFor(room.theme),
        title: displaySafe(await t('card.alterego.title')),
        line: bodySafe(await t('card.alterego.line')),
        // Set in Sniglet by the art, not in Knerd: `Leyenda de la cuenta` is four
        // words, and the display face stops being a headline past two.
        award: bodySafe(await t(`card.award.${params.award}`)),
        persona: params.persona,
    }
}

export async function toStatsCard(
    room: { theme: string | null; members: unknown[]; expenses: { date: Date }[] },
    t: Copy
): Promise<AchievementCardData> {
    return {
        kind: 'stats',
        theme: themeFor(room.theme),
        title: displaySafe(await t('card.stats.title')),
        days: daySpan(room.expenses.map((e) => e.date)),
        expenses: room.expenses.length,
        people: room.members.length,
    }
}

export async function toLandingCard(
    room: { theme: string | null; members: unknown[]; settlements: unknown[] },
    t: Copy
): Promise<AchievementCardData> {
    return {
        kind: 'landing',
        theme: themeFor(room.theme),
        title: displaySafe(await t('card.landing.title')),
        people: room.members.length,
        // Settlements RECORDED. Nothing here claims a transfer was saved or that
        // money moved — the settle path is unverified by design.
        settlements: room.settlements.length,
    }
}

// ---------------------------------------------------------------- loading

/** What each kind draws, and nothing else. Six shapes rather than one wide
 *  select: the crew card has no business loading every expense date. */
const SELECT: Record<CardKind, object> = {
    invite: { name: true, emoji: true, theme: true, locale: true },
    crew: { theme: true, locale: true, members: { orderBy: { createdAt: 'asc' }, select: { avatar: true } } },
    passport: { theme: true, locale: true, expenses: { where: { deletedAt: null }, select: { currency: true } } },
    alterego: { theme: true, locale: true },
    stats: {
        theme: true,
        locale: true,
        members: { select: { id: true } },
        expenses: { where: { deletedAt: null }, select: { date: true } },
    },
    landing: {
        theme: true,
        locale: true,
        members: { select: { id: true } },
        settlements: { where: { deletedAt: null }, select: { id: true } },
    },
}

/** The row shapes above, as one type the shapers can read out of. */
interface LoadedRoom {
    name?: string
    emoji?: string | null
    theme: string | null
    locale: string | null
    members?: { avatar?: string | null }[]
    expenses?: { currency?: string; date?: Date }[]
    settlements?: unknown[]
}

/**
 * One query, then one pure shaper. Returns null for an unknown slug and for an
 * `alterego` whose award or persona is not in its catalog — the route turns both
 * into the outcome the caller can survive, and never into a 500.
 */
export async function loadAchievementCard(
    slug: string,
    kind: CardKind,
    params?: AlterEgoCardParams
): Promise<AchievementCardData | null> {
    const room = (await prisma.room.findUnique({ where: { slug }, select: SELECT[kind] })) as LoadedRoom | null
    if (!room) return null

    const t = (await getTranslator(room.locale ?? 'en')) as Copy
    const theme = { theme: room.theme }

    switch (kind) {
        case 'invite':
            return toInviteCard({ name: room.name ?? '', emoji: room.emoji ?? null, theme: room.theme }, t)
        case 'crew':
            return toCrewCard(
                { theme: room.theme, members: (room.members ?? []).map((m) => ({ avatar: m.avatar ?? null })) },
                hash(slug),
                t
            )
        case 'passport':
            return toPassportCard(
                { theme: room.theme, expenses: (room.expenses ?? []).map((e) => ({ currency: e.currency ?? '' })) },
                t
            )
        case 'alterego':
            return params ? toAlterEgoCard(theme, params, t) : null
        case 'stats':
            return toStatsCard(
                {
                    theme: room.theme,
                    members: room.members ?? [],
                    expenses: (room.expenses ?? []).map((e) => ({ date: e.date ?? new Date(0) })),
                },
                t
            )
        case 'landing':
            return toLandingCard(
                { theme: room.theme, members: room.members ?? [], settlements: room.settlements ?? [] },
                t
            )
    }
}
