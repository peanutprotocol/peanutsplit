/**
 * The link preview in the room's own language.
 *
 * Three things have to hold and each one fails silently on its own: the room has
 * to REMEMBER the language, the meta and the card have to USE it, and every
 * string either of them produces has to be DRAWABLE by the two fonts the OG
 * renderer ships. The third is the quiet one — Satori has no fallback chain, so
 * an unmappable character is a blank rectangle in the middle of the product's
 * storefront and nothing anywhere reports it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCALES } from '@/i18n/locales'
import { getTranslator } from '@/i18n/t'
import { prisma, truncateAll } from '@/server/test/db'
import { resetRateLimits } from '@/server/rateLimit'
import { createRoom } from '@/server/rooms'
import { BODY_CHARS } from '@/server/og/fonts'
import { ENGLISH_CARD_COPY, bodySafe, cardCopy, loadRoomCard, peopleLine, statLine } from '@/server/og/roomCard'
import { ROOM_FALLBACK_DESCRIPTION, ROOM_FALLBACK_TITLE, roomMetadata } from '@/server/og/roomMeta'

const newRoom = (locale: string | null) =>
    createRoom({ name: 'Ski Trip', emoji: '🎿', currency: 'EUR', creatorName: 'Ana' }, locale)

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

afterEach(async () => {
    await truncateAll()
})

describe('a room remembers the language it was started in', () => {
    it('stores the creator’s locale', async () => {
        const { room } = await newRoom('es-419')
        const stored = await prisma.room.findUnique({ where: { id: room.id }, select: { locale: true } })
        expect(stored?.locale).toBe('es-419')
    })

    /** Every room written before the column existed, and every import. Null is
     *  "nobody said", and English is what that renders as. */
    it('leaves it null when nothing said', async () => {
        const { room } = await newRoom(null)
        const stored = await prisma.room.findUnique({ where: { id: room.id }, select: { locale: true } })
        expect(stored?.locale).toBeNull()
    })
})

describe('the meta a chat preview reads', () => {
    it('describes the room in the room’s language', async () => {
        const { room } = await newRoom('pt-br')
        const meta = await roomMetadata(room.slug)

        expect(meta.description).toBe('Entre na divisão — veja quem deve o quê e lance o que você pagou.')
        // The title is the group's own name plus the brand, and stays text-only:
        // the room's doodle belongs to the rendered card, not a device emoji.
        expect(meta.title).toBe('Ski Trip — Peanut Split')
        // The slug is the credential, in every language.
        expect(meta.robots).toEqual({ index: false, follow: false })
        expect(meta.openGraph?.description).toBe(meta.description)
        expect(meta.twitter?.description).toBe(meta.description)
        // The card is a large one, and that is the only part of it stated here.
        expect(meta.twitter).toMatchObject({ card: 'summary_large_image' })
        // NOTHING names the image. `opengraph-image.tsx` is a Next file
        // convention and Next writes both tags itself, at a URL carrying a
        // build-scoped hash that no code here can derive. Spelling one out —
        // which is what this test used to assert — overrode Next's URL with
        // `/r/<slug>/opengraph-image`, a 404, and rooms unfurled imageless.
        // The e2e suite holds the other end: that the URL Next does write
        // answers with a 1200×630 PNG.
        expect(meta.openGraph?.images).toBeUndefined()
        expect(meta.twitter?.images).toBeUndefined()
        expect(JSON.stringify(meta)).not.toContain('opengraph-image')
    })

    it('falls back to English for a room that never said', async () => {
        const { room } = await newRoom(null)
        const meta = await roomMetadata(room.slug)
        expect(meta.description).toBe('Join the split — see who owes what and add what you paid.')
    })

    it('serves the brand copy for a slug that does not exist', async () => {
        const meta = await roomMetadata('definitely-not-a-room-zzz999')
        expect(meta.title).toBe(ROOM_FALLBACK_TITLE)
        expect(meta.description).toBe(ROOM_FALLBACK_DESCRIPTION)
    })
})

describe('the card a chat preview draws', () => {
    it('writes the stat line and the roster count in the room’s language', async () => {
        const { room } = await newRoom('es-419')
        await prisma.expense.create({
            data: {
                roomId: room.id,
                description: 'Cena',
                amountMinor: 12850n,
                currency: 'EUR',
                baseAmountMinor: 12850n,
                fxRate: '1',
                paidById: room.members[0].id,
                splitMode: 'EQUAL',
            },
        })

        const card = await loadRoomCard(room.slug)

        // The SENTENCE is Spanish; the amount is not. `formatMinor` is the one
        // money format the server prints anywhere (this card, the recap card,
        // notification copy) and it is symbol-then-dot in every language. Making
        // it locale-aware is a change to money display across all of those, not a
        // property of this card, so it is deliberately left alone here — and
        // pinned, so the day somebody does it, this test is where it surfaces.
        expect(card?.stat).toBe('1 gasto · €128.50 hasta ahora')
        expect(card?.people).toBe('1 persona')
        expect(card?.tagline).toBe('sin registro · gratis para siempre')
    })

    it('is English for a room that never said', async () => {
        const { room } = await newRoom(null)
        const card = await loadRoomCard(room.slug)

        expect(card?.stat).toBe(ENGLISH_CARD_COPY.statNone)
        expect(card?.people).toBe('1 person')
        expect(card?.tagline).toBe(ENGLISH_CARD_COPY.tagline)
    })
})

describe('every localized preview string is drawable', () => {
    const drawable = (value: string) => [...value].filter((ch) => !BODY_CHARS.has(ch))

    /**
     * The load-bearing check. Spanish and Portuguese need Latin-1; Polish needs
     * Latin Extended. The shipped body font covers both, but a catalog is edited
     * by people, and one pasted character outside its cmap would render as a gap
     * nobody would notice until it was in a group chat.
     */
    it.each(LOCALES)('%s draws with the shipped body font', async (locale) => {
        const copy = await cardCopy(locale)
        const samples = {
            statNone: copy.statNone,
            statOne: copy.statOne('€12.50'),
            statMany: copy.statMany(4, '€12.50'),
            peopleOne: copy.peopleOne,
            peopleMany: copy.peopleMany(4),
            emptyRoster: copy.emptyRoster,
            tagline: copy.tagline,
        }
        for (const [key, value] of Object.entries(samples)) {
            expect(`${locale}.${key}: ${drawable(value).join('')}`).toBe(`${locale}.${key}: `)
        }
    })

    it.each(LOCALES)('%s survives the sanitizer unchanged, amounts included', async (locale) => {
        const copy = await cardCopy(locale)
        // A currency whose symbol IS outside the font, so the sanitizer is
        // provably running rather than merely not needed.
        expect(statLine(4, 123456n, 'THB', copy)).toContain('THB')
        expect(drawable(statLine(4, 123456n, 'THB', copy))).toEqual([])
        expect(drawable(statLine(1, 1250n, 'EUR', copy))).toEqual([])
        expect(drawable(statLine(0, 0n, 'EUR', copy))).toEqual([])
        expect(drawable(peopleLine(0, copy))).toEqual([])
        expect(drawable(peopleLine(9, copy))).toEqual([])
    })

    it('keeps Polish letters instead of making a drawable but corrupted sentence', async () => {
        const pangram = 'Zażółć gęślą jaźń'
        expect(bodySafe(pangram)).toBe(pangram)

        const copy = await cardCopy('pl')
        expect(statLine(4, 1250n, 'EUR', copy)).toBe('4 wydatki · łącznie €12.50')
        expect(peopleLine(4, copy)).toBe('4 osoby')
    })

    it.each(LOCALES)('%s says something rather than falling through to a key', async (locale) => {
        const t = await getTranslator(locale)
        const description = await t('preview.roomDescription')
        expect(description).not.toBe('preview.roomDescription')
        expect(description.length).toBeGreaterThan(10)
    })
})
