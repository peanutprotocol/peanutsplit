/**
 * The card frame: every piece of drawing shared by more than one OG card.
 *
 * `card.tsx` and `recapCardArt.tsx` each carried their own `disc`, field, sheet
 * and wordmark, and `recapCardArt.tsx:21-25` said why and for how long:
 *
 *   > "The local `disc`/field/sheet helpers duplicate ~30 lines of `card.tsx` on
 *   > purpose: those are private there, this card's palette and composition
 *   > differ, and the file has another owner this week. Worth folding into one
 *   > set of shared primitives once the OG module has a single owner."
 *
 * This is that fold, and the achievement cards are the third and fourth callers
 * that would otherwise have copied the same thirty lines again. The parameters
 * are exactly the axes the two shipped cards already differed on — palette, blob
 * placement, sheet padding, the line beside the wordmark — so the fold moved
 * code and not pixels. `roomRoute.test.ts` and `recapRoute.test.ts` rasterize
 * both of them for real, which is what makes that claim checkable.
 *
 * Satori rules every element here obeys, and any edit must keep obeying:
 *  - every element with more than one child carries an explicit `display: flex`
 *  - no CSS grid, no `gap` (margins only), no shorthand `background`
 *  - inline styles only; no class names, no Tailwind, no CSS variables
 *  - text lives in a leaf element, never as a sibling of another element
 */
import type { DoodleName } from '@/components/ui/doodles'
import { avatarPalette, avatarPaletteForIdentity, isAvatarPaletteKey } from '@/lib/avatar-palettes'
import { avatarArt } from '@/lib/avatars'
import { siteUrl } from '@/lib/site'
import { doodleDataUri } from '@/server/og/emblem'
import { BODY_FONT, DISPLAY_FONT, headlineFont, headlineWeight } from '@/server/og/fonts'

export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_CONTENT_TYPE = 'image/png'
/**
 * Five minutes in both private browser caches and shared reverse-proxy caches.
 * Long enough that a proactive same-origin fetch and the first few chat crawlers
 * reuse one render, short enough that the card catches up with the room within
 * a coffee break. A brief stale-while-revalidate window avoids a blank unfurl
 * while a fresh render is being built.
 */
export const OG_CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=60'

/** Warm dark ink. Every field in the theme catalog is chosen to carry it, which
 *  is why a theme tints the field and never restyles the card. */
export const INK = '#211C17'
export const MUTED = '#5F646D'
/** primary-1. The Peanut mark's pink: stamps and confetti, never body ink. */
export const PINK = '#FF90E8'
/** secondary-1, the default field — and the confetti's third colour. */
export const YELLOW = '#FFC900'

/** The domain the card prints, resolved rather than typed. A literal would say
 *  `peanutsplit.com` on a preview deploy, where it is the one thing on the card
 *  a stranger could act on and the one place it would be wrong. */
export const cardDomain = (): string => siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')

export const disc = (size: number, color: string) =>
    ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 9999,
        backgroundColor: color,
        border: `4px solid ${INK}`,
        color: INK,
        flexShrink: 0,
    }) as const

/** A field's two decorative circles. Each names only the two edges it hangs off,
 *  so a blob cannot accidentally pin all four and stretch. */
export interface FieldBlob {
    size: number
    at: { top?: number; right?: number; bottom?: number; left?: number }
}

/** The invite family's corners: top-right, then bottom-left. */
export const BLOBS_RIGHT: readonly FieldBlob[] = [
    { size: 470, at: { top: -170, right: -130 } },
    { size: 430, at: { bottom: -200, left: -150 } },
]
/** Mirrored, for a card that must not be mistaken for the invite at a glance. */
export const BLOBS_LEFT: readonly FieldBlob[] = [
    { size: 470, at: { top: -190, left: -140 } },
    { size: 430, at: { bottom: -180, right: -120 } },
]

/**
 * The coloured canvas. Chat clients crop previews unpredictably, so everything
 * that carries meaning sits on the sheet and the field only carries mood.
 */
export function Field({
    field,
    tint,
    blobs = BLOBS_RIGHT,
    children,
}: {
    field: string
    tint: string
    blobs?: readonly FieldBlob[]
    children: React.ReactNode
}) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: OG_SIZE.width,
                height: OG_SIZE.height,
                backgroundColor: field,
                fontFamily: BODY_FONT,
                position: 'relative',
            }}
        >
            {blobs.map((blob, i) => (
                <div
                    key={i}
                    style={{
                        display: 'flex',
                        position: 'absolute',
                        ...blob.at,
                        width: blob.size,
                        height: blob.size,
                        borderRadius: 9999,
                        backgroundColor: tint,
                    }}
                />
            ))}
            {children}
        </div>
    )
}

/**
 * The white card floats, height-to-content, on the field — a card that hugs its
 * content survives a chat client's crop better than one stretched to the canvas.
 *
 * `torn` adds the two notch circles and the dashed rule that make it a ticket.
 * Same geometry `LinkMoment.tsx` already draws in HTML, so the shared image and
 * the in-app share sheet are recognisably one object.
 */
export function Sheet({
    outerPadding = '36px 62px 0 46px',
    innerPadding = '44px 46px',
    torn = false,
    tornOffset = 128,
    notchColor,
    children,
}: {
    outerPadding?: string
    innerPadding?: string
    torn?: boolean
    /** Where the perforation sits, measured up from the sheet's bottom edge. It
     *  has to fall BETWEEN two rows: a ticket torn through its own subject is a
     *  printing fault, not a ticket. */
    tornOffset?: number
    /** The field colour behind the notches — they are holes, not dots. */
    notchColor?: string
    children: React.ReactNode
}) {
    return (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: outerPadding }}>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    padding: innerPadding,
                    backgroundColor: '#FFFFFF',
                    border: `5px solid ${INK}`,
                    borderRadius: 28,
                    boxShadow: `12px 12px 0 ${INK}`,
                    // `relative` only when something is pinned to it: satori reads
                    // an explicit `static` differently from an absent one.
                    ...(torn ? { position: 'relative' as const } : {}),
                }}
            >
                {torn ? <TornEdge notchColor={notchColor ?? YELLOW} offset={tornOffset} /> : null}
                {children}
            </div>
        </div>
    )
}

/** Two bitten-out circles and a perforation, three quarters of the way down. */
function TornEdge({ notchColor, offset }: { notchColor: string; offset: number }) {
    const notch = (side: 'left' | 'right') =>
        ({
            display: 'flex',
            position: 'absolute' as const,
            top: -22,
            [side]: -27,
            width: 44,
            height: 44,
            borderRadius: 9999,
            backgroundColor: notchColor,
            border: `5px solid ${INK}`,
        }) as const
    return (
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: offset, height: 0 }}>
            <div style={notch('left')} />
            <div style={notch('right')} />
            <div
                style={{
                    display: 'flex',
                    position: 'absolute',
                    left: 34,
                    right: 34,
                    top: 0,
                    height: 0,
                    borderTop: `4px dashed ${INK}`,
                }}
            />
        </div>
    )
}

/**
 * "PEANUT SPLIT" is the brand and stays put in every language. The line beside
 * it is either a localized sentence (the unfurl, which travels WITH a link) or
 * the domain (every card that travels alone as a file, where the printed domain
 * is the only thing a stranger who sees it can act on).
 */
export function Wordmark({ note, noteColor, height = 96 }: { note: string; noteColor: string; height?: number }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height,
                padding: '0 56px',
            }}
        >
            <div style={{ display: 'flex', fontFamily: DISPLAY_FONT, fontSize: 34, color: INK }}>PEANUT SPLIT</div>
            <div style={{ display: 'flex', fontSize: 26, color: noteColor }}>{note}</div>
        </div>
    )
}

/**
 * The tick, built from two borders of a rotated box rather than from `✓`.
 * U+2713 is in neither shipped cmap, and a stamp whose tick is a blank rectangle
 * is worse than no stamp at all.
 */
export function Tick({ size }: { size: number }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: size,
                height: size,
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    width: size * 0.42,
                    height: size * 0.78,
                    borderRight: `${Math.round(size * 0.16)}px solid ${INK}`,
                    borderBottom: `${Math.round(size * 0.16)}px solid ${INK}`,
                    transform: 'rotate(45deg)',
                    // The rotation lifts the tick off its own baseline; nudge it back.
                    marginTop: -size * 0.12,
                }}
            />
        </div>
    )
}

/**
 * The settled stamp — off-axis, because a stamp that is square to the page reads
 * as a badge the layout put there rather than one somebody banged on.
 *
 * `label` is optional because the landing achievement already states the result
 * in its localized headline. Recaps pass their localized settled verdict. Long
 * German, Polish and Ukrainian labels step down rather than widening the stamp
 * into the room name beside it.
 */
export function settledStampFontSize(label: string): number {
    const length = [...label].length
    if (length <= 11) return 36
    if (length <= 14) return 30
    if (length <= 17) return 25
    return 22
}

export function SettledStamp({ label }: { label?: string }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: label ? '10px 24px 14px 20px' : '10px 20px 14px 20px',
                backgroundColor: PINK,
                border: `5px solid ${INK}`,
                borderRadius: 9999,
                boxShadow: `6px 6px 0 ${INK}`,
                transform: 'rotate(-7deg)',
                flexShrink: 0,
            }}
        >
            <Tick size={38} />
            {label ? (
                <div
                    style={{
                        display: 'flex',
                        marginLeft: 12,
                        fontFamily: headlineFont(label),
                        fontWeight: headlineWeight(label),
                        fontSize: settledStampFontSize(label),
                        lineHeight: 1,
                        color: INK,
                    }}
                >
                    {label}
                </div>
            ) : null}
        </div>
    )
}

/**
 * A member as their actual character, not as the first letter of their name.
 *
 * `MemberAvatar.tsx` ported to Satori: a reviewed two-colour ground and ink
 * with the same 104% close crop. The slightly heavier single stroke stays crisp
 * when chat clients scale the card down.
 */
export function PersonaDisc({
    avatar,
    palette,
    size,
    marginLeft = 0,
}: {
    avatar: string | null | undefined
    palette?: string | null
    size: number
    marginLeft?: number
}) {
    const art = avatarArt(avatar)
    const colors = isAvatarPaletteKey(palette) ? avatarPalette(palette) : avatarPaletteForIdentity(avatar ?? art.doodle)
    const drawing = Math.round(size * 1.04)
    return (
        <div
            style={{
                ...disc(size, colors.background),
                borderWidth: Math.max(3, Math.round(size * 0.045)),
                marginLeft,
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={doodleDataUri(art.doodle, {
                    ink: colors.ink,
                    weight: 2.15,
                })}
                width={drawing}
                height={drawing}
                alt=""
                style={{ position: 'relative' }}
            />
        </div>
    )
}

/**
 * Paper confetti behind a celebration, scattered by a number rather than by a
 * clock: the same room gets the same scatter on every render, on every box, so
 * the card a member screenshots today matches the one they share tomorrow. Same
 * argument `lib/story.ts` makes for the recap — "a story that changes between
 * two phones is a bug report, not a delight."
 */
export function ConfettiScatter({
    seed,
    width,
    height,
    count = 18,
}: {
    seed: number
    width: number
    height: number
    count?: number
}) {
    const colors = [YELLOW, PINK, INK]
    return (
        // Absolute pixel offsets rather than percentages: the box this fills is
        // sized by its content, and a percentage of an auto width is nothing.
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width, height }}>
            {Array.from({ length: count }, (_, i) => {
                // Three cheap decorrelated draws off one seed. Nothing here is a
                // secret; it only has to look unplanned and stay put.
                const a = (seed + i * 2654435761) >>> 0
                const b = (seed + i * 40503 + 7) >>> 0
                const c = (seed + i * 2246822519) >>> 0
                return (
                    <div
                        key={i}
                        style={{
                            display: 'flex',
                            position: 'absolute',
                            left: Math.round((a % 1000) * (width / 1000)),
                            top: Math.round((b % 1000) * (height / 1000)),
                            width: 14 + (c % 12),
                            height: 8 + (a % 7),
                            borderRadius: 4,
                            backgroundColor: colors[c % colors.length],
                            transform: `rotate(${(b % 90) - 45}deg)`,
                        }}
                    />
                )
            })}
        </div>
    )
}

/**
 * One number over one drawing.
 *
 * The WRAPPED cards are made of these instead of sentences, and that is a
 * translation decision rather than a layout one: "3 days · 14 expenses · 6
 * people" is three plurals across every language, and `i18n/t.ts` is deliberately
 * not an ICU implementation. A numeral beside a calendar reads the same in all
 * three and costs no keys. `recapCardArt.tsx` already argues this for its story
 * strip: drawings are the one vocabulary a card can use without opening the
 * font-coverage question.
 */
export function NumeralColumn({ value, doodle }: { value: number; doodle: DoodleName }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={doodleDataUri(doodle)} width={96} height={96} alt="" />
            <div
                style={{
                    display: 'flex',
                    marginTop: 8,
                    fontFamily: DISPLAY_FONT,
                    fontSize: 116,
                    lineHeight: 1.05,
                    color: INK,
                }}
            >
                {String(value)}
            </div>
        </div>
    )
}

/** The WRAPPED cards' one row, spread rather than stacked left: two or three
 *  columns with the whole sheet to sit in read as a summary, and the same row
 *  hugging one edge reads as a list that ran out. */
export function NumeralRow({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-around', width: '100%', marginTop: 26 }}>{children}</div>
    )
}
