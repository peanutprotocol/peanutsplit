import type { DoodleName } from '@/components/ui/doodles'

/**
 * The room theme catalog.
 *
 * A room stores a `theme` KEY, never colours. The palette lives here, in code,
 * for two reasons: an arbitrary colour field on a link-credential surface is a
 * defacement vector (anyone with the link could paint a room unreadable, or
 * spell something with hex), and a stored hex can never be fixed later — a key
 * lets the whole estate be re-tuned in one commit and the OG cards catch up on
 * their next render.
 *
 * No 'use client': this module is imported by the Satori OG renderer, by route
 * handlers, and by client components alike. Keep it free of React and of
 * anything Node-only.
 *
 * Contrast rule, same as the OG avatar palette: every `field` carries BLACK ink
 * and a black 1px border, because that is the entire design system. This is why
 * there is no ink-inverted theme — a dark field would need a second ink token in
 * every component and in the OG card, which is a reskin rather than a tint.
 * `graphite` is the ink-family answer that keeps the invariant.
 */

export interface RoomTheme {
    /** Stored in `Room.theme`. `classic` is stored as null — see DEFAULT_THEME_KEY. */
    key: string
    /** Key under the `room.theme.names` namespace. */
    nameKey: string
    /** The big flat surface: the room header, and the OG card's field. */
    field: string
    /** The OG card's decorative blobs — one step off `field`, same hue. */
    fieldTint: string
    /** Muted ink that stays legible ON `field`. Used by the OG wordmark line. */
    fieldInk: string
    /** The lightest member of the family, for a tint sitting on white — the
     *  settled balance card. Never carries meaning; red/green stay red/green. */
    tint: string
    /** Small accents: the selected swatch, focus rings. Never a text colour. */
    accent: string
    /** One drawing that gives the palette a name you can point at in the picker. */
    motif: DoodleName
}

/**
 * Stored as NULL, not as the string — a room written before themes existed and a
 * room deliberately set back to the default must be the same row. Everything
 * resolves through `themeFor`, which maps null and unknown alike to this entry.
 */
export const DEFAULT_THEME_KEY = 'classic'

/**
 * Eight palettes drawn from the design system's own families. `classic`
 * reproduces today's look EXACTLY — its values are the literals the OG card and
 * the room header shipped with, so a null theme is a no-op everywhere.
 */
export const ROOM_THEMES: readonly RoomTheme[] = [
    {
        key: 'classic',
        nameKey: 'classic',
        field: '#FFC900',
        fieldTint: '#FFD84D',
        fieldInk: '#7A5E00',
        // White, not a yellow wash: the settled balance card is white today and
        // the default theme is not allowed to move a single pixel.
        tint: '#FFFFFF',
        accent: '#FF90E8',
        motif: 'peanut',
    },
    {
        key: 'bubblegum',
        nameKey: 'bubblegum',
        field: '#FF90E8',
        fieldTint: '#FFB3EF',
        fieldInk: '#8A2E77',
        tint: '#FFEAFA',
        accent: '#FFC900',
        motif: 'candy',
    },
    {
        key: 'lavender',
        nameKey: 'lavender',
        field: '#EFE4FF',
        fieldTint: '#E0CEFF',
        fieldInk: '#5B3E8C',
        tint: '#F7F1FF',
        accent: '#AE7AFF',
        motif: 'crystal',
    },
    {
        key: 'mint',
        nameKey: 'mint',
        field: '#98E9AB',
        fieldTint: '#B7F1C5',
        fieldInk: '#1F6B33',
        tint: '#EAFBEE',
        accent: '#90A8ED',
        motif: 'leaf',
    },
    {
        key: 'sky',
        nameKey: 'sky',
        field: '#90A8ED',
        fieldTint: '#B0C1F3',
        fieldInk: '#26356B',
        tint: '#E9EEFB',
        accent: '#FFC900',
        motif: 'wave',
    },
    {
        key: 'coral',
        nameKey: 'coral',
        field: '#E99898',
        fieldTint: '#F2B9B9',
        fieldInk: '#7A2E2E',
        tint: '#FBEAEA',
        accent: '#FFC900',
        motif: 'sun',
    },
    {
        key: 'sand',
        nameKey: 'sand',
        field: '#FFF4CC',
        fieldTint: '#FAE184',
        fieldInk: '#7A5E00',
        tint: '#FFFBEE',
        accent: '#FFC900',
        motif: 'island',
    },
    {
        key: 'graphite',
        nameKey: 'graphite',
        field: '#E7E8E9',
        fieldTint: '#D3D5D8',
        fieldInk: '#3A3E45',
        tint: '#F4F5F6',
        accent: '#211C17',
        motif: 'iconpencil',
    },
]

const BY_KEY = new Map(ROOM_THEMES.map((theme) => [theme.key, theme]))

export const DEFAULT_THEME = BY_KEY.get(DEFAULT_THEME_KEY)!

/** The validation gate. Everything that accepts a theme from the wire uses this. */
export const isThemeKey = (value: unknown): value is string => typeof value === 'string' && BY_KEY.has(value)

/**
 * Never throws. An unknown key can only reach here from a row written by a newer
 * build (or a rollback), and a room that renders in the default palette is a far
 * better answer than a 500 in the middle of someone's trip.
 */
export const themeFor = (key: string | null | undefined): RoomTheme => (key && BY_KEY.get(key)) || DEFAULT_THEME

/**
 * The CSS custom properties the room container carries. Tailwind classes read
 * them with the classic value as the literal fallback, so a room with no theme
 * — and any surface that has not been themed yet — renders exactly as before.
 *
 * Returned as a plain string map rather than `CSSProperties`: React's type does
 * not admit custom properties without a cast, and this module stays React-free.
 */
export function themeVars(key: string | null | undefined): Record<string, string> {
    const theme = themeFor(key)
    return {
        '--split-theme-field': theme.field,
        '--split-theme-field-tint': theme.fieldTint,
        '--split-theme-tint': theme.tint,
        '--split-theme-accent': theme.accent,
    }
}
