/**
 * The six achievement cards.
 *
 * Same Satori rules as `card.tsx` and `recapCardArt.tsx`, and any edit must keep
 * obeying them:
 *  - every element with more than one child carries an explicit `display: flex`
 *  - no CSS grid, no `gap` (margins only), no shorthand `background`
 *  - inline styles only; no class names, no Tailwind, no CSS variables
 *  - text lives in a leaf element, never as a sibling of another element
 *
 * Every string here arrived already filtered to a shipped cmap by
 * `achievementCard.ts`. Nothing in this file reads a catalog, a database or a
 * locale — it draws what it is handed.
 *
 * Knerd carries one or two words and nothing longer (`ROADMAP.md`: "at three
 * words it stops being a headline and becomes a texture"), so the only display
 * type on these cards is the title and the numerals. The award name, four words
 * long in Spanish, is set in the body face.
 */
import type { ReactElement } from 'react'
import type { CardKind } from '@/lib/achievements-contract'
import { DISPLAY_FONT, INVITE_FONT } from '@/server/og/fonts'
import {
    BLOBS_LEFT,
    cardDomain,
    ConfettiScatter,
    disc,
    Field,
    INK,
    MUTED,
    NumeralColumn,
    NumeralRow,
    OG_SIZE,
    PersonaDisc,
    SettledStamp,
    Sheet,
    Wordmark,
    YELLOW,
} from '@/server/og/frame'
import { doodleDataUri } from '@/server/og/emblem'
import { BrandCard } from '@/server/og/card'
import type { AchievementCardData, CurrencyStamp } from '@/server/og/achievementCard'

/** Every one of these images travels ALONE, as a file handed to the share sheet,
 *  so the printed domain is the only thing a stranger who sees it can act on —
 *  the same argument the recap card's wordmark already makes. */
const Footer = ({ ink }: { ink: string }) => <Wordmark note={cardDomain()} noteColor={ink} height={88} />

const Title = ({ text, size = 88 }: { text: string; size?: number }) => (
    <div style={{ display: 'flex', fontFamily: DISPLAY_FONT, fontSize: size, lineHeight: 1.05, color: INK }}>
        {text}
    </div>
)

const Line = ({ text, marginTop = 18 }: { text: string; marginTop?: number }) => (
    <div style={{ display: 'flex', marginTop, fontSize: 34, color: MUTED }}>{text}</div>
)

// ---------------------------------------------------------------- invite

export function inviteNameFontSize(name: string): number {
    if (name.length <= 10) return 88
    if (name.length <= 16) return 72
    if (name.length <= 26) return 58
    return 46
}

const inviterFontSize = (inviter: string): number => {
    if (inviter.length <= 28) return 40
    if (inviter.length <= 36) return 34
    return 30
}

/**
 * The room handoff, replacing the client-built SVG.
 *
 * Deliberately thinner than the `/r/[slug]` unfurl, which prints "3 expenses ·
 * $128.50 so far": that image travels WITH the link and its numbers are read in
 * the same breath as the invitation. This one is a file, and a file gets
 * forwarded on without the text that justified it. It must identify the
 * product, explain the handoff and carry the room's identity by itself.
 */
function InviteCard(card: Extract<AchievementCardData, { kind: 'invite' }>): ReactElement {
    const personaSize = card.count <= 1 ? 104 : card.count === 2 ? 100 : 92
    return (
        <div
            style={{
                display: 'flex',
                width: OG_SIZE.width,
                height: OG_SIZE.height,
                padding: '44px 48px 44px 54px',
                backgroundColor: YELLOW,
                color: INK,
                fontFamily: INVITE_FONT,
            }}
        >
            <div style={{ display: 'flex', width: 610, height: '100%', flexDirection: 'column', padding: '8px 0' }}>
                <div style={{ display: 'flex', fontSize: 48, fontWeight: 800, letterSpacing: -2 }}>Peanut Split</div>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        marginTop: 'auto',
                        marginBottom: 'auto',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            maxWidth: 570,
                            fontSize: inviterFontSize(card.inviter),
                            fontWeight: 800,
                            letterSpacing: -1.4,
                            lineHeight: 1.05,
                        }}
                    >
                        {card.inviter}
                    </div>
                    <div
                        style={{
                            display: 'block',
                            maxWidth: 570,
                            marginTop: 10,
                            fontSize: inviteNameFontSize(card.name),
                            fontWeight: 800,
                            letterSpacing: -3.2,
                            lineHeight: 0.96,
                            lineClamp: 2,
                            wordBreak: 'break-word',
                        }}
                    >
                        {card.name}
                    </div>
                    <div style={{ display: 'flex', marginTop: 20, fontSize: 36, fontWeight: 800, lineHeight: 1.05 }}>
                        {card.label}
                    </div>
                    <div style={{ display: 'flex', maxWidth: 540, marginTop: 12, fontSize: 30, lineHeight: 1.18 }}>
                        {card.line}
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    width: 454,
                    height: 542,
                    flexDirection: 'column',
                    marginLeft: 34,
                    overflow: 'hidden',
                    border: `5px solid ${INK}`,
                    borderRadius: 28,
                    backgroundColor: '#FFFDF8',
                    boxShadow: `11px 11px 0 ${INK}`,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        width: '100%',
                        height: 22,
                        flexShrink: 0,
                        borderBottom: `4px solid ${INK}`,
                        backgroundColor: '#98E9AB',
                    }}
                />
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', padding: '34px 32px 30px' }}>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 25,
                            fontWeight: 800,
                            letterSpacing: 1.2,
                            lineHeight: 1.05,
                            color: MUTED,
                        }}
                    >
                        {card.rosterLabel}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            minHeight: 112,
                            marginTop: 22,
                        }}
                    >
                        {card.count === 0 ? (
                            <div
                                style={{
                                    ...disc(104, '#FFFFFF'),
                                    border: `4px dashed ${INK}`,
                                    fontSize: 46,
                                    fontWeight: 800,
                                }}
                            >
                                ?
                            </div>
                        ) : (
                            card.personas.map((persona, index) => (
                                <PersonaDisc
                                    key={index}
                                    avatar={persona.avatar}
                                    palette={persona.palette}
                                    size={personaSize}
                                    marginLeft={index === 0 ? 0 : -16}
                                />
                            ))
                        )}
                        {card.overflow > 0 ? (
                            <div
                                style={{
                                    ...disc(personaSize, '#FFF9ED'),
                                    marginLeft: -16,
                                    fontSize: 32,
                                    fontWeight: 800,
                                }}
                            >
                                {`+${card.overflow}`}
                            </div>
                        ) : null}
                    </div>
                    <div
                        style={{
                            display: 'block',
                            maxWidth: 380,
                            marginTop: 16,
                            fontSize: card.count === 0 ? 32 : 38,
                            fontWeight: 800,
                            letterSpacing: -1.2,
                            lineHeight: 1.08,
                            lineClamp: 2,
                            wordBreak: 'break-word',
                        }}
                    >
                        {card.rosterLine}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            marginTop: 'auto',
                            paddingTop: 22,
                            borderTop: `3px solid ${INK}`,
                            fontSize: 30,
                            fontWeight: 800,
                            lineHeight: 1.14,
                            color: MUTED,
                        }}
                    >
                        {card.proof}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------- crew

function CrewCard(card: Extract<AchievementCardData, { kind: 'crew' }>): ReactElement {
    const size = card.personas.length > 6 ? 104 : 124
    return (
        <Field field={card.theme.field} tint={card.theme.fieldTint} blobs={BLOBS_LEFT}>
            {/* On the field, behind the sheet: paper thrown over a whole card
                reads as a celebration, while the same pieces scattered on the
                white sheet between the faces read as dirt on the lens. */}
            <ConfettiScatter seed={card.seed} width={OG_SIZE.width} height={OG_SIZE.height} count={24} />
            <Sheet innerPadding="38px 46px 42px 46px">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Title text={String(card.count)} size={130} />
                    <div style={{ display: 'flex', marginLeft: 26 }}>
                        <Title text={card.title} size={78} />
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 26 }}>
                    {card.personas.map((persona, i) => (
                        <PersonaDisc
                            key={i}
                            avatar={persona.avatar}
                            palette={persona.palette}
                            size={size}
                            marginLeft={i === 0 ? 0 : -20}
                        />
                    ))}
                    {card.overflow > 0 ? (
                        <div
                            style={{
                                ...disc(size, '#FFFFFF'),
                                marginLeft: -20,
                                fontSize: Math.round(size * 0.32),
                                fontWeight: 800,
                            }}
                        >
                            {`+${card.overflow}`}
                        </div>
                    ) : null}
                </div>
                <Line text={card.line} marginTop={22} />
            </Sheet>
            <Footer ink={card.theme.fieldInk} />
        </Field>
    )
}

// ---------------------------------------------------------------- passport

/** One currency's stamp: a drawn sign and the code. Every code resolves to some
 *  drawing — a real currency without a sign of its own gets a banknote, and an
 *  invented ticker gets the shrug. `lib/currency-doodle.ts` explains the order. */
function Stamp({ stamp, index }: { stamp: CurrencyStamp; index: number }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                marginLeft: index === 0 ? 0 : 26,
                padding: '12px 24px 16px 24px',
                border: `5px solid ${INK}`,
                borderRadius: 20,
                boxShadow: `6px 6px 0 ${INK}`,
                // Alternating, so a row of stamps reads as banged on one at a
                // time rather than laid out by a grid.
                transform: `rotate(${index % 2 === 0 ? -7 : 4}deg)`,
                flexShrink: 0,
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={doodleDataUri(stamp.doodle)} width={54} height={54} alt="" />
            <div
                style={{
                    display: 'flex',
                    marginLeft: 14,
                    fontFamily: DISPLAY_FONT,
                    fontSize: 46,
                    color: INK,
                }}
            >
                {stamp.code}
            </div>
        </div>
    )
}

function PassportCard(card: Extract<AchievementCardData, { kind: 'passport' }>): ReactElement {
    // Rows of three, built here rather than left to `flexWrap`: satori's wrapping
    // is the one layout rule in this file that has no test behind it.
    const rows = [card.stamps.slice(0, 3), card.stamps.slice(3, 6)].filter((row) => row.length > 0)
    return (
        <Field field={card.theme.field} tint={card.theme.fieldTint} blobs={BLOBS_LEFT}>
            <Sheet innerPadding="38px 46px 42px 46px">
                <Title text={card.title} />
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 30 }}>
                    {rows.map((row, r) => (
                        <div key={r} style={{ display: 'flex', alignItems: 'center', marginTop: r === 0 ? 0 : 26 }}>
                            {row.map((stamp, i) => (
                                <Stamp key={stamp.code} stamp={stamp} index={i} />
                            ))}
                        </div>
                    ))}
                </div>
                <Line text={card.line} marginTop={26} />
            </Sheet>
            <Footer ink={card.theme.fieldInk} />
        </Field>
    )
}

// ---------------------------------------------------------------- alter ego

function AlterEgoCard(card: Extract<AchievementCardData, { kind: 'alterego' }>): ReactElement {
    return (
        <Field field={card.theme.field} tint={card.theme.fieldTint} blobs={BLOBS_LEFT}>
            <Sheet innerPadding="40px 46px 46px 46px">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <PersonaDisc avatar={card.persona} palette={card.palette} size={250} />
                    <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 44 }}>
                        <Title text={card.title} size={72} />
                        {/* Body face, not Knerd: `Leyenda de la cuenta` is four words,
                            and the display face stops being a headline past two. */}
                        <div
                            style={{
                                display: 'flex',
                                marginTop: 16,
                                fontSize: 44,
                                fontWeight: 800,
                                color: INK,
                            }}
                        >
                            {card.award}
                        </div>
                        <Line text={card.line} marginTop={14} />
                    </div>
                </div>
            </Sheet>
            <Footer ink={card.theme.fieldInk} />
        </Field>
    )
}

// ---------------------------------------------------------------- wrapped

function StatsCard(card: Extract<AchievementCardData, { kind: 'stats' }>): ReactElement {
    return (
        <Field field={card.theme.field} tint={card.theme.fieldTint} blobs={BLOBS_LEFT}>
            <Sheet innerPadding="34px 46px 38px 46px">
                <Title text={card.title} />
                <NumeralRow>
                    <NumeralColumn value={card.days} doodle="iconcalendar" />
                    <NumeralColumn value={card.expenses} doodle="iconreceipt" />
                    <NumeralColumn value={card.people} doodle="iconusers" />
                </NumeralRow>
            </Sheet>
            <Footer ink={card.theme.fieldInk} />
        </Field>
    )
}

function LandingCard(card: Extract<AchievementCardData, { kind: 'landing' }>): ReactElement {
    return (
        <Field field={card.theme.field} tint={card.theme.fieldTint} blobs={BLOBS_LEFT}>
            <Sheet innerPadding="34px 46px 38px 46px">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Title text={card.title} />
                    {/* No word under the stamp: the headline already says it, in the
                        room's own language, and `SETTLED` under `A MANO` would make
                        the card bilingual by accident. */}
                    <SettledStamp />
                </div>
                <NumeralRow>
                    <NumeralColumn value={card.people} doodle="iconusers" />
                    <NumeralColumn value={card.settlements} doodle="iconhandcoins" />
                </NumeralRow>
            </Sheet>
            <Footer ink={card.theme.fieldInk} />
        </Field>
    )
}

/**
 * Kind → art. Exported so `achievementCard.test.ts` can assert its keys are
 * exactly `CARD_KINDS`: a kind cannot exist without art, and art cannot exist
 * without a kind.
 */
export const ART_BY_KIND: Record<CardKind, (card: never) => ReactElement> = {
    invite: InviteCard,
    crew: CrewCard,
    passport: PassportCard,
    alterego: AlterEgoCard,
    stats: StatsCard,
    landing: LandingCard,
}

/**
 * The element the route rasterizes.
 *
 * Null is the unknown-slug case and is answered with the brand card, not with a
 * 404 or a 500: the share button is fetching these bytes, and a dead link still
 * ends up pasted into a group chat. Handled here rather than in the route so
 * `route.ts` stays free of JSX and can stay a `.ts` file.
 */
export function renderAchievementCard(card: AchievementCardData | null): ReactElement {
    if (!card) return <BrandCard lines={['SPLIT', 'ANYTHING']} tagline="Share one link, settle up after." />
    switch (card.kind) {
        case 'invite':
            return InviteCard(card)
        case 'crew':
            return CrewCard(card)
        case 'passport':
            return PassportCard(card)
        case 'alterego':
            return AlterEgoCard(card)
        case 'stats':
            return StatsCard(card)
        case 'landing':
            return LandingCard(card)
    }
}
