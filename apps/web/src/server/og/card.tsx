/**
 * The unfurl artwork itself.
 *
 * Satori rules that this file obeys, and that any edit must keep obeying:
 *  - every element with more than one child carries an explicit `display: flex`
 *  - no CSS grid, no `gap` (margins only), no shorthand `background`
 *  - inline styles only; no class names, no Tailwind, no CSS variables
 *  - text lives in a leaf element, never as a sibling of another element
 */
import { DEFAULT_THEME, type RoomTheme } from '@/lib/themes'
import { doodleDataUri } from '@/server/og/emblem'
import { BODY_FONT, DISPLAY_FONT } from '@/server/og/fonts'
import { AVATAR_COLORS, ENGLISH_CARD_COPY, type OgAvatar, type RoomCardData } from '@/server/og/roomCard'

export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_CONTENT_TYPE = 'image/png'
/**
 * Five minutes. Long enough that a link pasted into three chats renders once,
 * short enough that the card catches up with the room within a coffee break —
 * a stale "no expenses yet" is worse than a re-render.
 */
export const OG_CACHE_CONTROL = 'public, max-age=300'

const INK = '#211C17'
const MUTED = '#5F646D'

/**
 * The field colours come from the room's theme now, not from constants. Ink,
 * borders, the white sheet and the shadow do NOT — a theme tints the field, it
 * does not restyle the card, and every palette in the catalog is chosen to carry
 * warm dark ink. `DEFAULT_THEME` is what the brand card and an unthemed room use, and
 * its values are the literals this file shipped with.
 */

/** Knerd is wide; step the name down rather than let it wrap to three lines. */
function nameFontSize(name: string): number {
    if (name.length <= 10) return 92
    if (name.length <= 16) return 76
    if (name.length <= 26) return 60
    return 48
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

function Field({ theme, children }: { theme: RoomTheme; children: React.ReactNode }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: OG_SIZE.width,
                height: OG_SIZE.height,
                backgroundColor: theme.field,
                fontFamily: BODY_FONT,
                position: 'relative',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    position: 'absolute',
                    top: -170,
                    right: -130,
                    width: 470,
                    height: 470,
                    borderRadius: 9999,
                    backgroundColor: theme.fieldTint,
                }}
            />
            <div
                style={{
                    display: 'flex',
                    position: 'absolute',
                    bottom: -200,
                    left: -150,
                    width: 430,
                    height: 430,
                    borderRadius: 9999,
                    backgroundColor: theme.fieldTint,
                }}
            />
            {children}
        </div>
    )
}

/** "PEANUT SPLIT" is the brand and stays put in every language. The line beside
 *  it is a sentence, so it arrives already localized and font-safe. */
function Wordmark({ theme, tagline }: { theme: RoomTheme; tagline: string }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: 96,
                padding: '0 56px',
            }}
        >
            <div style={{ display: 'flex', fontFamily: DISPLAY_FONT, fontSize: 34, color: INK }}>PEANUT SPLIT</div>
            <div style={{ display: 'flex', fontSize: 26, color: theme.fieldInk }}>{tagline}</div>
        </div>
    )
}

/**
 * The white card floats, height-to-content, on the yellow field — chat clients
 * crop previews unpredictably, and a card that hugs its content survives a crop
 * better than one stretched to the canvas.
 */
function Sheet({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: '36px 62px 0 46px' }}>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    padding: '44px 46px',
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

function AvatarRow({ avatars, overflow, people }: { avatars: OgAvatar[]; overflow: number; people: string }) {
    // `people` is already either the count or the empty-roster line — the branch
    // lives with the copy, in `roomCard.ts`, so this file holds no sentences.
    if (avatars.length === 0) {
        return <div style={{ display: 'flex', alignItems: 'center', fontSize: 32, color: MUTED }}>{people}</div>
    }
    return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
            {avatars.map((avatar, i) => (
                <div
                    key={i}
                    style={{
                        ...disc(80, avatar.color),
                        marginLeft: i === 0 ? 0 : -18,
                        fontFamily: DISPLAY_FONT,
                        fontSize: 34,
                    }}
                >
                    {avatar.letter}
                </div>
            ))}
            {overflow > 0 ? (
                <div style={{ ...disc(80, '#FFFFFF'), marginLeft: -18, fontSize: 30, fontWeight: 800 }}>
                    {`+${overflow}`}
                </div>
            ) : null}
            {/* The empty seat. This card renders in the group chat of everyone
                who has not joined yet, so the roster ends with a chair held open
                for the person looking at it — the invitation drawn rather than
                written. Dashed on purpose: a seat, not a member. */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 80,
                    height: 80,
                    borderRadius: 9999,
                    backgroundColor: '#FFFFFF',
                    border: `4px dashed ${INK}`,
                    marginLeft: -18,
                    flexShrink: 0,
                }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={doodleDataUri('question')} width={44} height={44} alt="" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 26, fontSize: 32, color: MUTED }}>
                {people}
            </div>
        </div>
    )
}

/** The room unfurl. `emojiSrc` is a resolved data URI, or null for the initial. */
export function RoomCard({ card, emojiSrc }: { card: RoomCardData; emojiSrc: string | null }) {
    return (
        <Field theme={card.theme}>
            <Sheet>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {emojiSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc} width={128} height={128} alt="" style={{ flexShrink: 0 }} />
                    ) : (
                        <div style={{ ...disc(128, card.theme.field), fontFamily: DISPLAY_FONT, fontSize: 60 }}>
                            {card.name.slice(0, 1).toUpperCase()}
                        </div>
                    )}
                    <div
                        style={{
                            display: 'flex',
                            marginLeft: 30,
                            maxWidth: 800,
                            fontFamily: DISPLAY_FONT,
                            fontSize: nameFontSize(card.name),
                            lineHeight: 1.1,
                            color: INK,
                        }}
                    >
                        {card.name}
                    </div>
                </div>
                {/* Roster and money read as one cluster, so the headline gets the
                    whole top half — the shape a chat preview crops best. */}
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44 }}>
                    <AvatarRow avatars={card.avatars} overflow={card.overflow} people={card.people} />
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 24, fontSize: 36, color: INK }}>
                        {card.stat}
                    </div>
                </div>
            </Sheet>
            <Wordmark theme={card.theme} tagline={card.tagline} />
        </Field>
    )
}

/**
 * The brand card: the landing unfurl, and what an unknown slug gets. An expired
 * or mistyped link still lands in a group chat, so it gets artwork, not a 500.
 */
export function BrandCard({ lines, tagline }: { lines: readonly [string, string]; tagline: string }) {
    return (
        <Field theme={DEFAULT_THEME}>
            <Sheet>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', fontFamily: DISPLAY_FONT, fontSize: 108, lineHeight: 1.02 }}>
                        {lines[0]}
                    </div>
                    <div style={{ display: 'flex', fontFamily: DISPLAY_FONT, fontSize: 108, lineHeight: 1.02 }}>
                        {lines[1]}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 44 }}>
                    {(['A', 'M', 'J', 'S'] as const).map((letter, i) => (
                        <div
                            key={letter}
                            style={{
                                ...disc(76, AVATAR_COLORS[i]),
                                marginLeft: i === 0 ? 0 : -18,
                                fontFamily: DISPLAY_FONT,
                                fontSize: 32,
                            }}
                        >
                            {letter}
                        </div>
                    ))}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginLeft: 28,
                            fontSize: 34,
                            color: MUTED,
                        }}
                    >
                        {tagline}
                    </div>
                </div>
            </Sheet>
            <Wordmark theme={DEFAULT_THEME} tagline={ENGLISH_CARD_COPY.tagline} />
        </Field>
    )
}
