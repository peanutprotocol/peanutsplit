/**
 * The unfurl artwork itself.
 *
 * The frame — field, sheet, wordmark, the disc — lives in `frame.tsx` now and is
 * shared with every other card. What stays here is what only the unfurl does:
 * the room name stepped to fit, the avatar row, and the empty seat.
 *
 * Satori rules that this file obeys, and that any edit must keep obeying:
 *  - every element with more than one child carries an explicit `display: flex`
 *  - no CSS grid, no `gap` (margins only), no shorthand `background`
 *  - inline styles only; no class names, no Tailwind, no CSS variables
 *  - text lives in a leaf element, never as a sibling of another element
 */
import { DEFAULT_THEME } from '@/lib/themes'
import { doodleDataUri } from '@/server/og/emblem'
import { DISPLAY_FONT, headlineFont, headlineWeight } from '@/server/og/fonts'
import { BLOBS_RIGHT, disc, Field, INK, MUTED, Sheet, Wordmark } from '@/server/og/frame'
import { AVATAR_COLORS, ENGLISH_CARD_COPY, type OgAvatar, type RoomCardData } from '@/server/og/roomCard'

/** Re-exported from their canonical home so the seven `opengraph-image` routes
 *  that already read them off this module keep one import each. */
export { OG_CACHE_CONTROL, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/frame'

/** Gluten is wide; step the name down rather than let it wrap to three lines. */
export function nameFontSize(name: string): number {
    if (name.length <= 10) return 92
    if (name.length <= 16) return 76
    if (name.length <= 26) return 60
    return 48
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
                        fontFamily: headlineFont(avatar.letter),
                        fontWeight: headlineWeight(avatar.letter),
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
            <div style={{ ...disc(80, '#FFFFFF'), border: `4px dashed ${INK}`, marginLeft: -18 }}>
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
        <Field field={card.theme.field} tint={card.theme.fieldTint} blobs={BLOBS_RIGHT}>
            <Sheet>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {emojiSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc} width={128} height={128} alt="" style={{ flexShrink: 0 }} />
                    ) : (
                        <div
                            style={{
                                ...disc(128, card.theme.field),
                                fontFamily: headlineFont(card.name.slice(0, 1)),
                                fontWeight: headlineWeight(card.name.slice(0, 1)),
                                fontSize: 60,
                            }}
                        >
                            {card.name.slice(0, 1).toUpperCase()}
                        </div>
                    )}
                    <div
                        style={{
                            display: 'flex',
                            marginLeft: 30,
                            maxWidth: 800,
                            fontFamily: headlineFont(card.name),
                            fontWeight: headlineWeight(card.name),
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
            <Wordmark note={card.tagline} noteColor={card.theme.fieldInk} />
        </Field>
    )
}

/**
 * The brand card: the landing unfurl, and what an unknown slug gets. An expired
 * or mistyped link still lands in a group chat, so it gets artwork, not a 500.
 */
export function BrandCard({ lines, tagline }: { lines: readonly [string, string]; tagline: string }) {
    return (
        <Field field={DEFAULT_THEME.field} tint={DEFAULT_THEME.fieldTint} blobs={BLOBS_RIGHT}>
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
            <Wordmark note={ENGLISH_CARD_COPY.tagline} noteColor={DEFAULT_THEME.fieldInk} />
        </Field>
    )
}
