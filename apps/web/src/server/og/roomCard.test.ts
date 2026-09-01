import { describe, expect, it } from 'vitest'
import { encodeRoomDrawing } from '@/lib/room-drawing'
import { BODY_CHARS, BODY_FONT, DISPLAY_FONT, HEADLINE_CHARS, headlineFont, headlineWeight } from '@/server/og/fonts'
import {
    MAX_AVATARS,
    MAX_MEMBER_CHARS,
    MAX_NAME_CHARS,
    MEMBER_FALLBACK,
    NAME_FALLBACK,
    avatarLetter,
    avatarsFor,
    safeAmount,
    sanitizeDisplayName,
    sanitizeMemberName,
    statLine,
    toRoomCard,
} from '@/server/og/roomCard'
import { ROOM_FALLBACK_TITLE, roomTitle } from '@/server/og/roomMeta'
import { DEFAULT_THEME, themeFor } from '@/lib/themes'

const drawableByBody = (value: string) => [...value].every((ch) => BODY_CHARS.has(ch))
const drawableByHeadline = (value: string) => [...value].every((ch) => HEADLINE_CHARS.has(ch))

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

    it('keeps a Ukrainian name whole for the targeted Roboto fallback', () => {
        expect(sanitizeDisplayName('Київ 2026')).toBe('Київ 2026')
        expect(sanitizeDisplayName('Подорож до Європи')).toBe('Подорож до Європи')
        expect(sanitizeDisplayName('Їдемо до Ґанку в Києві')).toBe('Їдемо до Ґанку в Києві')
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

    it('only ever emits characters one of the headline fonts can draw', () => {
        for (const raw of ['Ski trip 🎿', 'Café Zürich', 'Київ 2026', '東京旅行', 'A~B`C', 'Fête d’été']) {
            expect(drawableByHeadline(sanitizeDisplayName(raw))).toBe(true)
        }
    })

    it('keeps the display face for its supported alphabet and targets Roboto at Cyrillic', () => {
        expect(headlineFont('Ski trip')).toBe(DISPLAY_FONT)
        expect(headlineWeight('Ski trip')).toBe(400)
        expect(headlineFont('Київ')).toBe(BODY_FONT)
        expect(headlineWeight('Київ')).toBe(800)
        expect(headlineFont('Ski trip Київ')).toBe(BODY_FONT)
    })
})

/** The other binding of `sanitizeForFont`: body charset, shorter ceiling, its own
 *  fallback. Lived beside the recap as a hand-copy until the copies drifted. */
describe('sanitizeMemberName', () => {
    it('keeps a name the body font can draw', () => {
        expect(sanitizeMemberName('María')).toBe('María')
        expect(sanitizeMemberName('Zoë')).toBe('Zoë')
        expect(sanitizeMemberName('Błażej')).toBe('Błażej')
        expect(sanitizeMemberName('Анастасія')).toBe('Анастасія')
        expect(sanitizeMemberName('Ґанна')).toBe('Ґанна')
    })

    it('strips decoration without losing the name', () => {
        expect(sanitizeMemberName('Hugo 🥜')).toBe('Hugo')
    })

    it('falls back rather than render a name eaten down to nothing', () => {
        expect(sanitizeMemberName('東京')).toBe(MEMBER_FALLBACK)
        expect(sanitizeMemberName('  ')).toBe(MEMBER_FALLBACK)
    })

    it('truncates with dots, never the ellipsis glyph', () => {
        const long = sanitizeMemberName('Bartholomew Wolfeschlegelstein')
        expect(long.endsWith('...')).toBe(true)
        expect(long).not.toContain('…')
        expect(long.length).toBeLessThanOrEqual(MAX_MEMBER_CHARS + 3)
    })

    /** The reconciled rule. A cut that lands on a comma used to leave ",..." on
     *  the recap card and not on the room card, because the two truncations were
     *  separate copies. */
    it('drops punctuation the cut landed on, exactly as the room card does', () => {
        // The 22nd character is the comma, so the cut lands exactly on it.
        expect(sanitizeMemberName('Bartholomew Rodriguez, Jr')).toBe('Bartholomew Rodriguez...')
        expect(sanitizeDisplayName(`${'a'.repeat(MAX_NAME_CHARS - 1)}, and more`)).toBe(
            `${'a'.repeat(MAX_NAME_CHARS - 1)}...`
        )
    })

    it('only ever emits characters the body font can draw', () => {
        for (const raw of ['María', '🥜🥜', 'Київ', 'Ana~`', 'Zoë 東京', 'Fête']) {
            expect(drawableByBody(sanitizeMemberName(raw))).toBe(true)
        }
    })
})

describe('avatars', () => {
    it('folds diacritics down to a drawable initial', () => {
        expect(avatarLetter('Ángela')).toBe('A')
        expect(avatarLetter('  jota')).toBe('J')
        expect(avatarLetter('99 problems')).toBe('9')
        expect(avatarLetter('Їрина')).toBe('Ї')
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
        // `฿` is outside the shipped Roboto cmap — a gap here would read as a rendering bug.
        expect(safeAmount(50000n, 'THB')).toBe('500.00 THB')
        expect(drawableByBody(statLine(1, 50000n, 'THB'))).toBe(true)
    })

    /** This used to print raw minor units, because `currency()` threw and the catch below fell
     *  back to the undivided number. It is total now, so an invented ticker reads as money. */
    it('renders an invented ticker as money, not as raw minor units', () => {
        expect(safeAmount(1234n, 'XYZ')).toBe('12.34 XYZ')
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

    it('preserves a custom room drawing for the unfurl renderer', () => {
        const custom = encodeRoomDrawing([[{ x: 0.5, y: 0.5 }]])
        const card = toRoomCard({ name: 'Fresh', emoji: custom, currency: 'USD', members: [], expenses: [] })
        expect(card.emblem).toBe(custom)
    })

    /**
     * The unfurl following the palette IS the theme feature — a room repainted
     * in the app and still yellow in the group chat is the version nobody
     * would have asked for.
     */
    it('resolves the room’s theme into the colours the card draws', () => {
        const card = toRoomCard({
            name: 'Ski trip',
            emoji: null,
            currency: 'EUR',
            theme: 'mint',
            members: [{ name: 'Hugo' }],
            expenses: [],
        })
        expect(card.theme).toBe(themeFor('mint'))
        expect(card.theme.field).toBe('#98E9AB')
        expect(card.theme.fieldTint).toBe('#B7F1C5')
    })

    it('draws an unthemed room in the palette it always had', () => {
        const unset = toRoomCard({ name: 'Ski trip', emoji: null, currency: 'EUR', members: [], expenses: [] })
        const explicitNull = toRoomCard({
            name: 'Ski trip',
            emoji: null,
            currency: 'EUR',
            theme: null,
            members: [],
            expenses: [],
        })
        expect(unset.theme).toBe(DEFAULT_THEME)
        expect(explicitNull.theme).toBe(DEFAULT_THEME)
    })

    it('never 500s on a key the catalog no longer has', () => {
        const card = toRoomCard({
            name: 'Ski trip',
            emoji: null,
            currency: 'EUR',
            theme: 'retired-in-a-later-build',
            members: [],
            expenses: [],
        })
        expect(card.theme).toBe(DEFAULT_THEME)
    })
})

describe('roomTitle', () => {
    it('keeps legacy emoji out of text metadata', () => {
        expect(roomTitle('Ski trip', '🎿')).toBe('Ski trip — Peanut Split')
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
