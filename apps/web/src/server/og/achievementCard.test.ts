/**
 * What the six achievement cards are made of, and — the load-bearing part — what
 * they are NOT made of.
 *
 * The design's claim is that these cards are redacted by construction rather
 * than by a flag: there is no money field and no member-name field to forget to
 * blank. A claim like that is worth nothing as prose, so the leak test below
 * walks every kind in `CARD_KINDS` and asserts it structurally. A seventh kind
 * added without thought fails here.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { CARD_KINDS, type AlterEgoCardParams, type CardKind } from '@/lib/achievements-contract'
import { prisma, truncateAll } from '@/server/test/db'
import {
    currencyStamps,
    loadAchievementCard,
    toPassportCard,
    type AchievementCardData,
} from '@/server/og/achievementCard'
import { ART_BY_KIND } from '@/server/og/achievementCardArt'
import { nameFontSize } from '@/server/og/card'
import { MAX_NAME_CHARS } from '@/server/og/roomCard'
// The real list, not a copy: a private locale array in a test is how a fourth locale
// ships with no card coverage and nothing red to say so.
import { LOCALES } from '@/i18n/locales'

const FIXTURE_ROOM_NAME = 'Kraken cabin weekender'
const FIXTURE_MEMBER_NAMES = ['Anastasiya', 'Bartholomew', 'Clementina', 'Dorotheus', 'Eusebio']
const ALTER_EGO: AlterEgoCardParams = { award: 'theCloser', persona: 'wizard-frog' }

const slugOf = (locale: string) => `card-fixture-${locale.toLowerCase()}`

const buildFixtureCard = (kind: CardKind, locale: string = 'en') => loadAchievementCard(slugOf(locale), kind, ALTER_EGO)

/** Every string a card carries, wherever it sits in the shape. */
function stringsOf(value: unknown): string[] {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.flatMap(stringsOf)
    if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf)
    return []
}

describe('achievement cards', () => {
    beforeAll(async () => {
        await truncateAll()
        for (const locale of LOCALES) {
            const room = await prisma.room.create({
                data: {
                    slug: slugOf(locale),
                    name: FIXTURE_ROOM_NAME,
                    emoji: 'ski',
                    currency: 'EUR',
                    theme: 'coral',
                    locale,
                    members: {
                        create: FIXTURE_MEMBER_NAMES.map((name, i) => ({
                            name,
                            token: `tok-${locale}-${i}`,
                            // The middle member is a legacy row with no avatar —
                            // `avatars.ts` says null exists only for pre-migration
                            // rows, and the lineup has to draw one.
                            avatar:
                                i === 2 ? null : ['wizard-frog', 'disco-octopus', null, 'tea-dragon', 'cozy-ghost'][i],
                        })),
                    },
                },
                include: { members: { orderBy: { createdAt: 'asc' } } },
            })
            const [first, second] = room.members
            for (const [i, currency] of ['EUR', 'JPY', 'THB', 'EUR'].entries()) {
                await prisma.expense.create({
                    data: {
                        roomId: room.id,
                        description: `Row ${i}`,
                        amountMinor: 123_450n,
                        currency,
                        baseAmountMinor: 123_450n,
                        fxRate: 1,
                        paidById: first.id,
                        splitMode: 'EQUAL',
                        date: new Date(`2026-02-0${i + 1}T10:00:00Z`),
                        shares: { create: [{ memberId: first.id, amountMinor: 123_450n }] },
                    },
                })
            }
            await prisma.settlement.create({
                data: { roomId: room.id, fromId: second.id, toId: first.id, amountMinor: 61_725n },
            })
        }
    })

    // ------------------------------------------------------------ shaping

    it('draws the crew as characters, never as names', async () => {
        const card = (await buildFixtureCard('crew')) as Extract<AchievementCardData, { kind: 'crew' }>
        expect(card.count).toBe(5)
        expect(card.personas).toHaveLength(5)
        expect(card.overflow).toBe(0)
        for (const name of FIXTURE_MEMBER_NAMES) expect(JSON.stringify(card)).not.toContain(name)
    })

    it('caps the lineup and reports the rest as a chip', async () => {
        const room = await prisma.room.findUniqueOrThrow({ where: { slug: slugOf('en') } })
        await prisma.member.createMany({
            data: Array.from({ length: 6 }, (_, i) => ({
                roomId: room.id,
                name: `Extra ${i}`,
                token: `tok-extra-${i}`,
            })),
        })
        const card = (await buildFixtureCard('crew')) as Extract<AchievementCardData, { kind: 'crew' }>
        expect(card.count).toBe(11)
        expect(card.personas).toHaveLength(8)
        expect(card.overflow).toBe(3)
        await prisma.member.deleteMany({ where: { roomId: room.id, name: { startsWith: 'Extra ' } } })
    })

    it('stamps distinct expense currencies, sorted and capped', () => {
        expect(currencyStamps(['eur', 'JPY', 'EUR'])).toEqual([
            { code: 'EUR', doodle: 'euro' },
            { code: 'JPY', doodle: 'yen' },
        ])
        // A currency with no drawn sign keeps its code and gets no near-miss
        // drawing — the rule `lib/currency-doodle.ts` states.
        expect(currencyStamps(['XOF'])).toEqual([{ code: 'XOF', doodle: null }])
        expect(currencyStamps(['AUD', 'BRL', 'CHF', 'EUR', 'GBP', 'INR', 'JPY'])).toHaveLength(6)
    })

    it('counts every currency in the line, even past the six the art draws', async () => {
        // An eight-currency trip read "6 currencies" while the cap was doing double duty
        // as a count. The stamps still stop at six; the sentence tells the truth.
        const eight = ['AUD', 'BRL', 'CHF', 'EUR', 'GBP', 'INR', 'JPY', 'THB']
        const card = (await toPassportCard(
            { theme: null, expenses: eight.map((currency) => ({ currency })) },
            async (_key, params) => String(params?.count ?? '')
        )) as Extract<AchievementCardData, { kind: 'passport' }>
        expect(card.line).toBe('8')
        expect(card.stamps).toHaveLength(6)
    })

    it('reads the passport off expense currencies, not the room currency', async () => {
        const card = (await buildFixtureCard('passport')) as Extract<AchievementCardData, { kind: 'passport' }>
        expect(card.stamps.map((s) => s.code)).toEqual(['EUR', 'JPY', 'THB'])
        expect(card.line).toContain('3')
    })

    it('refuses an alter ego outside its two closed sets', async () => {
        await expect(loadAchievementCard(slugOf('en'), 'alterego', ALTER_EGO)).resolves.not.toBeNull()
        await expect(
            loadAchievementCard(slugOf('en'), 'alterego', { award: 'theCloser', persona: 'not-a-persona' })
        ).resolves.toBeNull()
        await expect(
            loadAchievementCard(slugOf('en'), 'alterego', {
                award: 'bestPayer' as AlterEgoCardParams['award'],
                persona: 'wizard-frog',
            })
        ).resolves.toBeNull()
    })

    it('draws a card for a member whose avatar row is null', async () => {
        // `ApiMember.avatar` is nullable for pre-migration rows, and the one
        // legacy member who earns an award must not get a dead share button.
        const card = await loadAchievementCard(slugOf('en'), 'alterego', {
            award: 'hypeCrew',
            persona: 'doodle-peanut',
        })
        expect(card).not.toBeNull()
    })

    it('keeps an adversarial room name inside its box', async () => {
        const long = 'W'.repeat(80)
        await prisma.room.update({ where: { slug: slugOf('en') }, data: { name: long } })
        const card = (await buildFixtureCard('invite')) as Extract<AchievementCardData, { kind: 'invite' }>
        expect(card.name.length).toBeLessThanOrEqual(MAX_NAME_CHARS + 3)
        expect(nameFontSize(card.name)).toBe(48)
        await prisma.room.update({ where: { slug: slugOf('en') }, data: { name: FIXTURE_ROOM_NAME } })
    })

    it('counts the trip in numerals only', async () => {
        const stats = (await buildFixtureCard('stats')) as Extract<AchievementCardData, { kind: 'stats' }>
        expect(stats).toMatchObject({ days: 4, expenses: 4, people: 5 })
        const landing = (await buildFixtureCard('landing')) as Extract<AchievementCardData, { kind: 'landing' }>
        expect(landing).toMatchObject({ people: 5, settlements: 1 })
    })

    // ------------------------------------------------------------ the leak test

    /** A formatted amount, not a count: a decimal group, or a currency mark next
     *  to digits. A bare `\d` would fire on the cards that are MADE of numerals. */
    const MONEY = /(\d[\d.,]*[.,]\d{2})|([$€£¥₹]\s?\d)|(\d\s?(?:EUR|USD|GBP|BRL|JPY|ARS))/

    it.each(CARD_KINDS)('%s carries no money, no member name and no slug', async (kind) => {
        const json = JSON.stringify(await buildFixtureCard(kind))
        expect(json).not.toMatch(MONEY)
        for (const memberName of FIXTURE_MEMBER_NAMES) expect(json).not.toContain(memberName)
        expect(json).not.toContain(slugOf('en'))
        // `invite` carries the ROOM name and nothing else, which is strictly less
        // than `/r/[slug]/opengraph-image` already prints into the same chat.
        if (kind !== 'invite') expect(json).not.toContain(FIXTURE_ROOM_NAME)
    })

    it('has art for every kind and a kind for every art', () => {
        expect(Object.keys(ART_BY_KIND).sort()).toEqual([...CARD_KINDS].sort())
    })

    /** `i18n/t.ts` leaves an unmatched `{param}` verbatim, and `{`/`}` are both
     *  inside `BODY_CHARS` — so a forgotten value ships as literal braces on a
     *  card in a group chat, and nothing else in the repo catches it. */
    it('resolves every placeholder before the string reaches Satori', async () => {
        for (const kind of CARD_KINDS) {
            for (const locale of LOCALES) {
                for (const value of stringsOf(await buildFixtureCard(kind, locale))) {
                    expect(value).not.toMatch(/[{}]/)
                }
            }
        }
    })

    it('translates every card into all three catalogs', async () => {
        const titles = await Promise.all(LOCALES.map(async (l) => (await buildFixtureCard('landing', l)) as never))
        const values = titles.map((card: { title: string }) => card.title)
        expect(values).toEqual(['ALL SQUARE', 'A MANO', 'QUITES'])
    })
})
