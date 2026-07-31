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
 * The `disc`/field/sheet/stamp helpers that used to be duplicated here now live
 * in `frame.tsx`, which is what the note this file carried asked for.
 */
import type { DoodleName } from '@/components/ui/doodles'
import { doodleDataUri } from '@/server/og/emblem'
import { DISPLAY_FONT } from '@/server/og/fonts'
import { BLOBS_LEFT, disc, Field, INK, MUTED, PersonaDisc, SettledStamp, Sheet, Wordmark } from '@/server/og/frame'
import type { RecapCardData } from '@/server/og/recapCard'

/** green-1 — the all-settled colour the app already celebrates in. */
const FIELD = '#98E9AB'
const FIELD_TINT = '#B2F0C1'
const FIELD_INK = '#1F5B31'

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

function Panel({ name, size, first = false }: { name: DoodleName; size: number; first?: boolean }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={doodleDataUri(name)}
            width={size}
            height={size}
            alt=""
            style={{ flexShrink: 0, marginLeft: first ? 0 : 18 }}
        />
    )
}

/**
 * The trip in three drawings: we went → we spent → we're square. Wordless on
 * purpose — the strip has to read in a chat in any language, and drawings are
 * the one vocabulary this card can use without opening the font-coverage
 * question. The room's own character leads, so a ski trip's story starts with
 * the skis and a pizza night's with the pizza.
 */
function StoryStrip({ emblem }: { emblem: DoodleName }) {
    // 52px panels: present enough to read next to the 64px avatar discs, small
    // enough that the sheet's 146px hero number stays the headline and the
    // tallest card (long name + top payer + avatars) stays inside 630px.
    return (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 22 }}>
            <Panel name={emblem} size={52} first />
            <Panel name="iconarrowright" size={32} />
            <Panel name="tally" size={52} />
            <Panel name="iconarrowright" size={32} />
            <Panel name="iconcheck" size={52} />
        </div>
    )
}

function AvatarRow({ card }: { card: RecapCardData }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
            {card.personas.map((avatar, i) => (
                <PersonaDisc key={i} avatar={avatar} size={64} marginLeft={i === 0 ? 0 : -16} />
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
                        marginLeft: card.personas.length > 0 ? 24 : 0,
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
        <Field field={FIELD} tint={FIELD_TINT} blobs={BLOBS_LEFT}>
            <Sheet outerPadding="30px 56px 0 46px" innerPadding="34px 44px 38px 44px">
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
                                // `block`, not the file's usual flex: satori only honours
                                // `lineClamp` on block text, and this leaf holds nothing
                                // but the name.
                                display: 'block',
                                marginLeft: 22,
                                maxWidth: 620,
                                fontFamily: DISPLAY_FONT,
                                fontSize: nameFontSize(card.name),
                                lineHeight: 1.1,
                                color: INK,
                                // Two lines, hard stop. A three-line name plus the story
                                // strip pushes the sheet over the wordmark — and the
                                // printed domain is the one thing a stranger holding
                                // this image can act on, so the name yields, not it.
                                lineClamp: 2,
                            }}
                        >
                            {card.name}
                        </div>
                    </div>
                    {/* Only a room that actually reached zero gets the stamp. A
                        mid-trip recap is a scoreboard, not a result. */}
                    {card.settled ? <SettledStamp label="SETTLED" /> : null}
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

                {/* Only a settled room has earned the tick at the end of the
                    strip — mid-trip, the third panel would be a lie, so the
                    strip waits with the stamp. */}
                {card.settled ? <StoryStrip emblem={card.emblem} /> : null}
            </Sheet>
            {/* The domain, not a tagline. This image travels ALONE — it is shared as
                a file so the room slug (which is the room's credential) never leaves
                the group — so the printed domain is the only thing a stranger who
                sees it can act on. */}
            <Wordmark note="peanutsplit.com" noteColor={FIELD_INK} height={88} />
        </Field>
    )
}
