/**
 * The trip-recap artwork — the second shareable artefact, minted when a room
 * reaches zero.
 *
 * Deliberately NOT the invite card. The invite is a yellow field whose headline
 * is the room name and whose job is "tap this". The recap is a green field whose
 * headline is the MONEY, stamped SETTLED, and whose job is "look what we did".
 * Someone who has seen both in the same chat should not have to read them to
 * tell them apart.
 *
 * Same Satori rules as `card.tsx`, and any edit must keep obeying them:
 *  - every element with more than one child carries an explicit `display: flex`
 *  - no CSS grid, no `gap` (margins only), no shorthand `background`
 *  - inline styles only; no class names, no Tailwind, no CSS variables
 *  - text lives in a leaf element, never as a sibling of another element
 *
 * Every string that reaches this file has already been through the font-coverage
 * sanitizers in `recapCard.ts` — there is no fallback glyph, so an unmapped
 * codepoint is a blank box in a group chat.
 *
 * The local `disc`/field/sheet helpers duplicate ~30 lines of `card.tsx` on
 * purpose: those are private there, this card's palette and composition differ,
 * and the file has another owner this week. Worth folding into one set of shared
 * primitives once the OG module has a single owner.
 */
import { BODY_FONT, DISPLAY_FONT } from '@/server/og/fonts'
import type { RecapCardData } from '@/server/og/recapCard'
import { OG_SIZE } from '@/server/og/card'

const INK = '#211C17'
/** green-1 — the all-settled colour the app already celebrates in. */
const FIELD = '#98E9AB'
const FIELD_TINT = '#B2F0C1'
const MUTED = '#5F646D'
const FIELD_INK = '#1F5B31'
/** primary-1. Pink on green is loud, which is the point of a stamp. */
const STAMP = '#FF90E8'

/** Knerd is wide; step the name down rather than let it wrap under the stamp. */
function nameFontSize(name: string): number {
    if (name.length <= 14) return 52
    if (name.length <= 24) return 42
    return 34
}

/** The hero number has to stay on one line at any currency and any magnitude. */
function totalFontSize(total: string): number {
    if (total.length <= 8) return 146
    if (total.length <= 11) return 122
    if (total.length <= 15) return 98
    return 76
}

const disc = (size: number, color: string) =>
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

/**
 * The tick, built from two borders of a rotated box rather than from `✓`.
 * U+2713 is in neither shipped cmap, and a stamp whose tick is a blank rectangle
 * is worse than no stamp at all.
 */
function Tick({ size }: { size: number }) {
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

/** The SETTLED stamp — off-axis, because a stamp that is square to the page
 *  reads as a badge the layout put there rather than one somebody banged on. */
function SettledStamp() {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 24px 14px 20px',
                backgroundColor: STAMP,
                border: `5px solid ${INK}`,
                borderRadius: 9999,
                boxShadow: `6px 6px 0 ${INK}`,
                transform: 'rotate(-7deg)',
                flexShrink: 0,
            }}
        >
            <Tick size={38} />
            <div style={{ display: 'flex', marginLeft: 12, fontFamily: DISPLAY_FONT, fontSize: 36, color: INK }}>
                SETTLED
            </div>
        </div>
    )
}

function Field({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: OG_SIZE.width,
                height: OG_SIZE.height,
                backgroundColor: FIELD,
                fontFamily: BODY_FONT,
                position: 'relative',
            }}
        >
            {/* Mirrored from the invite card's tints so the two read as one
                family — same geometry, different corner, different hue. */}
            <div
                style={{
                    display: 'flex',
                    position: 'absolute',
                    top: -190,
                    left: -140,
                    width: 470,
                    height: 470,
                    borderRadius: 9999,
                    backgroundColor: FIELD_TINT,
                }}
            />
            <div
                style={{
                    display: 'flex',
                    position: 'absolute',
                    bottom: -180,
                    right: -120,
                    width: 430,
                    height: 430,
                    borderRadius: 9999,
                    backgroundColor: FIELD_TINT,
                }}
            />
            {children}
        </div>
    )
}

function Sheet({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: '30px 56px 0 46px' }}>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    padding: '34px 44px 38px 44px',
                    backgroundColor: '#FFFFFF',
                    border: `5px solid ${INK}`,
                    borderRadius: 28,
                    boxShadow: `12px 12px 0 ${INK}`,
                }}
            >
                {children}
            </div>
        </div>
    )
}

/**
 * The domain, not a tagline. This image travels ALONE — it is shared as a file
 * so the room slug (which is the room's credential) never leaves the group — so
 * the printed domain is the only thing a stranger who sees it can act on.
 */
function Wordmark() {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: 88,
                padding: '0 56px',
            }}
        >
            <div style={{ display: 'flex', fontFamily: DISPLAY_FONT, fontSize: 34, color: INK }}>PEANUT SPLIT</div>
            <div style={{ display: 'flex', fontSize: 26, color: FIELD_INK }}>peanutsplit.com</div>
        </div>
    )
}

function AvatarRow({ card }: { card: RecapCardData }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
            {card.avatars.map((avatar, i) => (
                <div
                    key={i}
                    style={{
                        ...disc(64, avatar.color),
                        marginLeft: i === 0 ? 0 : -16,
                        fontFamily: DISPLAY_FONT,
                        fontSize: 28,
                    }}
                >
                    {avatar.letter}
                </div>
            ))}
            {card.overflow > 0 ? (
                <div style={{ ...disc(64, '#FFFFFF'), marginLeft: -16, fontSize: 25, fontWeight: 800 }}>
                    {`+${card.overflow}`}
                </div>
            ) : null}
            {card.topPayer ? (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginLeft: card.avatars.length > 0 ? 24 : 0,
                        fontSize: 32,
                        color: MUTED,
                    }}
                >
                    {card.topPayer}
                </div>
            ) : null}
        </div>
    )
}

export function RecapCard({ card, emojiSrc }: { card: RecapCardData; emojiSrc: string | null }) {
    return (
        <Field>
            <Sheet>
                {/* Eyebrow row: whose trip this was, and the verdict. The name is
                    small here — on this card the money is the headline. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {emojiSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={emojiSrc} width={72} height={72} alt="" style={{ flexShrink: 0 }} />
                        ) : (
                            <div style={{ ...disc(72, FIELD), fontFamily: DISPLAY_FONT, fontSize: 34 }}>
                                {card.name.slice(0, 1).toUpperCase()}
                            </div>
                        )}
                        <div
                            style={{
                                display: 'flex',
                                marginLeft: 22,
                                maxWidth: 620,
                                fontFamily: DISPLAY_FONT,
                                fontSize: nameFontSize(card.name),
                                lineHeight: 1.1,
                                color: INK,
                            }}
                        >
                            {card.name}
                        </div>
                    </div>
                    {/* Only a room that actually reached zero gets the stamp. A
                        mid-trip recap is a scoreboard, not a result. */}
                    {card.settled ? <SettledStamp /> : null}
                </div>

                <div
                    style={{
                        display: 'flex',
                        marginTop: 14,
                        fontFamily: DISPLAY_FONT,
                        fontSize: totalFontSize(card.total),
                        lineHeight: 1.05,
                        color: INK,
                    }}
                >
                    {card.total}
                </div>

                <div style={{ display: 'flex', marginTop: 6, fontSize: 34, color: FIELD_INK }}>{card.stat}</div>

                <div style={{ display: 'flex', marginTop: 26 }}>
                    <AvatarRow card={card} />
                </div>
            </Sheet>
            <Wordmark />
        </Field>
    )
}
