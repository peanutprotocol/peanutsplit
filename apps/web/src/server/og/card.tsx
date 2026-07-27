/**
 * The unfurl artwork itself.
 *
 * Satori rules that this file obeys, and that any edit must keep obeying:
 *  - every element with more than one child carries an explicit `display: flex`
 *  - no CSS grid, no `gap` (margins only), no shorthand `background`
 *  - inline styles only; no class names, no Tailwind, no CSS variables
 *  - text lives in a leaf element, never as a sibling of another element
 */
import { BODY_FONT, DISPLAY_FONT } from '@/server/og/fonts'
import { AVATAR_COLORS, type OgAvatar, type RoomCardData } from '@/server/og/roomCard'

export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_CONTENT_TYPE = 'image/png'
/**
 * Five minutes. Long enough that a link pasted into three chats renders once,
 * short enough that the card catches up with the room within a coffee break —
 * a stale "no expenses yet" is worse than a re-render.
 */
export const OG_CACHE_CONTROL = 'public, max-age=300'

const INK = '#000000'
const FIELD = '#FFC900'
const FIELD_TINT = '#FFD84D'
const MUTED = '#5F646D'
const FIELD_INK = '#7A5E00'

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
            <div
                style={{
                    display: 'flex',
                    position: 'absolute',
                    top: -170,
                    right: -130,
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
                    bottom: -200,
                    left: -150,
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

function Wordmark() {
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
            <div style={{ display: 'flex', fontSize: 26, color: FIELD_INK }}>no signup · free forever</div>
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

function AvatarRow({ avatars, overflow, memberCount }: { avatars: OgAvatar[]; overflow: number; memberCount: number }) {
    if (avatars.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 32, color: MUTED }}>
                Nobody has joined yet
            </div>
        )
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
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 26, fontSize: 32, color: MUTED }}>
                {memberCount === 1 ? '1 person' : `${memberCount} people`}
            </div>
        </div>
    )
}

/** The room unfurl. `emojiSrc` is a resolved data URI, or null for the initial. */
export function RoomCard({ card, emojiSrc }: { card: RoomCardData; emojiSrc: string | null }) {
    return (
        <Field>
            <Sheet>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {emojiSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc} width={128} height={128} alt="" style={{ flexShrink: 0 }} />
                    ) : (
                        <div style={{ ...disc(128, FIELD), fontFamily: DISPLAY_FONT, fontSize: 60 }}>
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
                    <AvatarRow avatars={card.avatars} overflow={card.overflow} memberCount={card.memberCount} />
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 24, fontSize: 36, color: INK }}>
                        {card.stat}
                    </div>
                </div>
            </Sheet>
            <Wordmark />
        </Field>
    )
}

/**
 * The brand card: the landing unfurl, and what an unknown slug gets. An expired
 * or mistyped link still lands in a group chat, so it gets artwork, not a 500.
 */
export function BrandCard({ lines, tagline }: { lines: readonly [string, string]; tagline: string }) {
    return (
        <Field>
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
            <Wordmark />
        </Field>
    )
}
