import { describe, expect, it } from 'vitest'
import { twemojiSlug } from '@/server/og/emoji'
import { BODY_CHARS, DISPLAY_CHARS } from '@/server/og/fonts'
import {
    MAX_AVATARS,
    MAX_NAME_CHARS,
    NAME_FALLBACK,
    avatarLetter,
    avatarsFor,
    safeAmount,
    sanitizeDisplayName,
    statLine,
    toRoomCard,
} from '@/server/og/roomCard'
import { ROOM_FALLBACK_TITLE, roomTitle } from '@/server/og/roomMeta'

const drawableByDisplay = (value: string) => [...value].every((ch) => DISPLAY_CHARS.has(ch))
const drawableByBody = (value: string) => [...value].every((ch) => BODY_CHARS.has(ch))

describe('sanitizeDisplayName', () => {
    it('keeps a plain ASCII name verbatim', () => {
        expect(sanitizeDisplayName('Ski trip 2026')).toBe('Ski trip 2026')
    })

    it('keeps Latin-1 accents the display font actually ships', () => {
        expect(sanitizeDisplayName('Café Zürich')).toBe('Café Zürich')
    })

    it('strips a trailing emoji without losing the name', () => {
        expect(sanitizeDisplayName('Ski trip 🎿')).toBe('Ski trip')
    })

    it('falls back rather than render a name eaten down to digits', () => {
        expect(sanitizeDisplayName('Кипр 2026')).toBe(NAME_FALLBACK)
    })

    it('falls back for a wholly non-Latin name', () => {
        expect(sanitizeDisplayName('東京旅行')).toBe(NAME_FALLBACK)
        expect(sanitizeDisplayName('🥜🥜🥜')).toBe(NAME_FALLBACK)
        expect(sanitizeDisplayName('   ')).toBe(NAME_FALLBACK)
    })

    it('collapses whitespace', () => {
        expect(sanitizeDisplayName('  Flat   bills \n')).toBe('Flat bills')
    })

    it('truncates with dots, never the ellipsis glyph the font lacks', () => {
        const long = sanitizeDisplayName('Barcelona bachelor party weekend blowout 2026')
        expect(long.endsWith('...')).toBe(true)
        expect(long).not.toContain('…')
        expect(long.length).toBeLessThanOrEqual(MAX_NAME_CHARS + 3)
    })

    it('only ever emits characters the display font can draw', () => {
        for (const raw of ['Ski trip 🎿', 'Café Zürich', 'Кипр 2026', '東京旅行', 'A~B`C', 'Fête d’été']) {
            expect(drawableByDisplay(sanitizeDisplayName(raw))).toBe(true)
        }
    })
})

describe('avatars', () => {
    it('folds diacritics down to a drawable initial', () => {
        expect(avatarLetter('Ángela')).toBe('A')
        expect(avatarLetter('  jota')).toBe('J')
        expect(avatarLetter('99 problems')).toBe('9')
    })

    it('never returns tofu for a non-Latin name', () => {
        expect(drawableByBody(avatarLetter('Кипр'))).toBe(true)
        expect(drawableByBody(avatarLetter('🥜'))).toBe(true)
    })

    it('assigns a stable colour per name', () => {
        expect(avatarsFor(['Hugo'])).toEqual(avatarsFor(['Hugo']))
    })

    it('never puts two identical fills side by side', () => {
        const names = ['Ángela', 'Zoë', 'Konrad', 'Kush', 'Hugo', 'Jota']
        const colors = avatarsFor(names).avatars.map((a) => a.color)
        for (let i = 1; i < colors.length; i++) expect(colors[i]).not.toBe(colors[i - 1])
    })

    it('shows everyone when the row fits', () => {
        const { avatars, overflow } = avatarsFor(['A', 'B', 'C'])
        expect(avatars).toHaveLength(3)
        expect(overflow).toBe(0)
    })

    it('collapses the tail into +N past the cap', () => {
        const names = Array.from({ length: 11 }, (_, i) => `Member ${i}`)
        const { avatars, overflow } = avatarsFor(names)
        expect(avatars).toHaveLength(MAX_AVATARS)
        expect(overflow).toBe(11 - MAX_AVATARS)
    })

    it('handles a room with no members', () => {
        expect(avatarsFor([])).toEqual({ avatars: [], overflow: 0 })
    })
})

describe('statLine', () => {
    it('reads naturally at one expense', () => {
        expect(statLine(1, 1250n, 'USD')).toBe('1 expense · $12.50 so far')
    })

    it('pluralises and totals', () => {
        expect(statLine(3, 12850n, 'USD')).toBe('3 expenses · $128.50 so far')
    })

    it('respects zero-decimal currencies', () => {
        expect(statLine(2, 4000n, 'JPY')).toBe('2 expenses · ¥4000 so far')
    })

    it('says nothing rather than "$0.00" on an empty room', () => {
        expect(statLine(0, 0n, 'USD')).toBe('No expenses yet')
    })

    it('swaps an undrawable symbol for the ISO code', () => {
        // `฿` is outside Sniglet's cmap — a gap here would read as a rendering bug.
        expect(safeAmount(50000n, 'THB')).toBe('500.00 THB')
        expect(drawableByBody(statLine(1, 50000n, 'THB'))).toBe(true)
    })

    it('survives an unknown currency code', () => {
        expect(safeAmount(1234n, 'XYZ')).toBe('1234 XYZ')
    })

    it('only ever emits characters the body font can draw', () => {
        for (const code of ['USD', 'EUR', 'GBP', 'BRL', 'CHF', 'THB', 'JPY', 'COP']) {
            expect(drawableByBody(statLine(4, 123456n, code))).toBe(true)
        }
    })
})

describe('toRoomCard', () => {
    it('sums live expenses in the room currency', () => {
        const card = toRoomCard({
            name: 'Ski trip 🎿',
            emoji: '🎿',
            currency: 'EUR',
            members: [{ name: 'Hugo' }, { name: 'Jota' }],
            expenses: [{ baseAmountMinor: 1000n }, { baseAmountMinor: 2550n }],
        })
        expect(card.name).toBe('Ski trip')
        expect(card.stat).toBe('2 expenses · €35.50 so far')
        expect(card.avatars.map((a) => a.letter)).toEqual(['H', 'J'])
        expect(card.memberCount).toBe(2)
        expect(card.overflow).toBe(0)
    })

    it('renders an empty room without inventing numbers', () => {
        const card = toRoomCard({ name: 'Fresh', emoji: null, currency: 'USD', members: [], expenses: [] })
        expect(card.stat).toBe('No expenses yet')
        expect(card.avatars).toEqual([])
        expect(card.memberCount).toBe(0)
    })
})

describe('twemojiSlug', () => {
    it('drops the VS16 presentation selector', () => {
        expect(twemojiSlug('✈️')).toBe('2708')
        expect(twemojiSlug('🏔️')).toBe('1f3d4')
    })

    it('keeps plain and ZWJ sequences intact', () => {
        expect(twemojiSlug('🥜')).toBe('1f95c')
        expect(twemojiSlug('👨‍👩‍👧')).toBe('1f468-200d-1f469-200d-1f467')
    })

    it('refuses non-emoji, so a text "emoji" column never 404-loops', () => {
        expect(twemojiSlug('ski')).toBeNull()
        expect(twemojiSlug('')).toBeNull()
        expect(twemojiSlug(null)).toBeNull()
    })
})

describe('roomTitle', () => {
    it('prefixes the emoji and suffixes the brand', () => {
        expect(roomTitle('Ski trip', '🎿')).toBe('🎿 Ski trip — Peanut Split')
    })

    it('keeps non-Latin names — HTML has no glyph budget', () => {
        expect(roomTitle('Кипр 2026', null)).toBe('Кипр 2026 — Peanut Split')
    })

    it('ignores a non-emoji value in the emoji column', () => {
        expect(roomTitle('Ski trip', 'x')).toBe('Ski trip — Peanut Split')
    })

    it('falls back when the name is empty', () => {
        expect(roomTitle('   ', null)).toBe(ROOM_FALLBACK_TITLE)
    })

    it('clips a very long name', () => {
        const title = roomTitle('B'.repeat(120), null)
        expect(title).toBe(`${'B'.repeat(48)}… — Peanut Split`)
    })
})
