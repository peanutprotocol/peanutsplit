/**
 * The seam between the card renderer and the surfaces that show cards.
 *
 * Pinned: both halves of the achievements wave import from here and NEITHER edits it after it
 * lands. Same role `share-package-contract.ts` plays for the invite variant — a shared constant
 * that would otherwise drag a client module into the OG renderer, or the renderer into a bundle.
 *
 * No React, no Node, no Prisma. This file is imported by client components and by the Satori
 * pipeline alike.
 */

/**
 * What a card can be.
 *
 * `recap` is deliberately absent: it already has its own route
 * (`/r/<slug>/recap/opengraph-image`) and its own art, and this wave does not move it. The WRAPPED
 * deck references it by name (`WRAPPED_DECK`) and links to the route it already has.
 */
export const CARD_KINDS = ['invite', 'crew', 'passport', 'alterego', 'stats', 'landing'] as const
export type CardKind = (typeof CARD_KINDS)[number]

/**
 * The analytics vocabulary. Deliberately coarser than `CardKind`: `stats` and `landing` are cards
 * inside the WRAPPED deck, not achievements in their own right, and `invite` is the room handoff,
 * which is measured by the share-package contract instead.
 */
export const ACHIEVEMENT_TYPES = ['crew', 'passport', 'alterego', 'wrapped'] as const
export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number]

/** The six positive roles. Contribution and coordination only — never debt, spending power or
 *  payment speed. `lib/achievements.ts` owns the rules; this is only the closed set. */
export const AWARD_IDS = [
    'tripStarter',
    'firstMover',
    'ledgerLegend',
    'currencyHopper',
    'theCloser',
    'hypeCrew',
] as const
export type AwardId = (typeof AWARD_IDS)[number]

/** Roster sizes worth a moment. Not every join — see `crewUnlock`. */
export const CREW_THRESHOLDS = [3, 5, 8, 12] as const
/** Distinct expense currencies worth a stamp. */
export const PASSPORT_THRESHOLDS = [2, 3, 5] as const

/**
 * The alter-ego card's whole input, and deliberately not a member id.
 *
 * Both fields are closed sets — six awards, and every avatar key `isAvatarKey` accepts — so the
 * query string carries no identifier and nothing a Sentry breadcrumb could tie to a person. The
 * server validates both against their catalogs and 404s otherwise.
 */
export interface AlterEgoCardParams {
    award: AwardId
    /** A key from `lib/avatars.ts`. A member row may hold `null`, so the caller passes
     *  `member.avatar ?? FALLBACK_AVATAR_KEY` — a null would 404 the card of the one legacy
     *  member who earned it. */
    persona: string
}

/**
 * Where the PNG lives. The slug is in the PATH for exactly the reason it is in the recap image
 * path — a member fetching their own room's card — and it is never in what leaves the device.
 *
 * The query string is stripped from Sentry breadcrumbs by `redact.ts`: an award is a description
 * of a person, which is the same reason `analytics.ts` refuses to send one.
 */
export function achievementCardPath(slug: string, kind: CardKind, params?: AlterEgoCardParams): string {
    const base = `/r/${slug}/card/${kind}`
    if (kind !== 'alterego' || !params) return base
    return `${base}?a=${encodeURIComponent(params.award)}&p=${encodeURIComponent(params.persona)}`
}

/** No slug in a filename — it would put the credential in a Downloads folder, a screenshot of a
 *  file picker, and every "recently shared" list. `lib/recap.ts` makes the same call. */
export const CARD_FILE_NAME: Record<CardKind, string> = {
    invite: 'peanut-split-invite.png',
    crew: 'peanut-split-crew.png',
    passport: 'peanut-split-passport.png',
    alterego: 'peanut-split-alter-ego.png',
    stats: 'peanut-split-trip.png',
    landing: 'peanut-split-all-square.png',
}

/** The order the WRAPPED deck is presented in. `recap` leads: it is the strongest moment and the
 *  one already shipped. Which of the five actually render is conditional — see `WrappedDeck`. */
export const WRAPPED_DECK = ['recap', 'stats', 'passport', 'alterego', 'landing'] as const
export type WrappedCard = (typeof WRAPPED_DECK)[number]

/**
 * Which achievement a shared card counts as.
 *
 * `recap` is absent on purpose: it already has `recap_shared` and its own funnel, so a deck tile
 * that fires an achievement event would undercount one measure and pollute the other. `invite` is
 * absent for the same reason — it is measured by the share-package contract.
 */
export const CARD_TYPE: Partial<Record<CardKind, AchievementType>> = {
    crew: 'crew',
    passport: 'passport',
    alterego: 'alterego',
    stats: 'wrapped',
    landing: 'wrapped',
}
