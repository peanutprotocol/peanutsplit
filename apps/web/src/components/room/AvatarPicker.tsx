'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'
import {
    SPIN_MS,
    TICK_MS,
    type SpinPlan,
    ensurePick,
    handAt,
    hasSettled,
    initialHand,
    initialPaletteHand,
    isPopping,
    planPaletteHand,
    planSpin,
} from '@/lib/avatar-hand'
import { isAvatarPaletteKey, type AvatarPaletteKey } from '@/lib/avatar-palettes'
import { AVATARS, type AvatarKey } from '@/lib/avatars'
import { cn } from '@/lib/cn'
import { useMotionAllowed } from '@/lib/use-motion'
import { MemberAvatar } from './MemberAvatar'

interface AvatarPickerProps {
    name: string
    /** Null is possible only while legacy rows are being backfilled. */
    value: string | null
    /** Null is possible only during a rolling deploy or from an older cache. */
    palette: string | null
    onChange: (avatar: string, palette: AvatarPaletteKey) => void
    disabled?: boolean
}

/** Every tile is the same object, dice included. */
const tileClass =
    'flex min-h-[112px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-sm border border-n-1 p-2 text-center transition-transform duration-100'

/**
 * Two lines of title, always. A name is how you find your own character, so
 * "Overpacker Hamster" may not arrive as "Overpacker Ha…" — the animal is the
 * half that identifies it. The height is fixed rather than grown because the
 * reels cycle long and short names through the same tile: a label that wrapped
 * on its own would resize the grid sixteen times a second.
 */
const titleClass = 'line-clamp-2 w-full text-xs font-semibold leading-tight'

/** One deliberately short line, visually secondary to the character name. */
const vibeClass = 'h-3.5 w-full truncate text-[10px] leading-[14px] text-grey-1'

/** Title, subtitle and their gap have one stable footprint while the reel spins. */
const copyClass = 'flex h-[46px] w-full min-w-0 flex-col justify-center gap-0.5'

/**
 * One roll of the die, in degrees.
 *
 * A whole number of turns, so the die always comes to rest the way it was drawn,
 * and ADDED to wherever it already is rather than set — that is what keeps the
 * roll going forward through a second tap and stops it snapping back to zero
 * when the spin state clears. One CSS transition on the app's decelerating
 * curve carries it: a die is thrown, it does not tick.
 */
const DIE_TURN_DEGREES = 720

/**
 * The grid of characters: eight of them, plus a die.
 *
 * The catalog is forty-eight options and a wall of forty-eight tiles is not a
 * choice, it is a search task. So the grid is one hand of eight and the ninth
 * tile deals another — the whole thing stays a 3×3 that a thumb can cover.
 *
 * The die reshuffles what is OFFERED and never changes who you are: the current
 * pick survives every shuffle (`ensurePick` / `planSpin`), because a character
 * that vanishes from the grid reads as a character that was lost. Selection
 * happens only by tapping a face.
 *
 * The reels start in a ripple and stop one after another, decelerating, which is
 * the entire delight; one interval drives all eight — `avatar-hand.ts` plans the
 * spin and this component renders ticks of it. A tile does not merely stop, it
 * RESOLVES: the name it was cycling too fast to carry fades in as it lands and
 * the tile pops once. Reduced motion gets the new hand with no cycling, no fade
 * and no pop at all.
 *
 * Each tile carries its short joke as a one-line subtitle. The character name is
 * darker and semibold so the grid remains easy to scan; the joke is smaller and
 * muted. Both live in one fixed-height copy block, so reels cycling between long
 * and short names never resize the grid under a choosing finger.
 *
 * The selected tile is marked, never enlarged, for the same reason.
 */
export function AvatarPicker({ name, value, palette, onChange, disabled }: AvatarPickerProps) {
    const t = useTranslations('room.avatar')
    const motionAllowed = useMotionAllowed()

    // Derived from `value` alone, so the server HTML and the first client render
    // are identical. Randomness starts at the first tap of the die, never here.
    const [hand, setHand] = useState<AvatarKey[]>(() => initialHand(value))
    const [handPalettes, setHandPalettes] = useState<AvatarPaletteKey[]>(() =>
        initialPaletteHand(initialHand(value), value, palette)
    )
    const [spin, setSpin] = useState<{
        plan: SpinPlan
        palettes: AvatarPaletteKey[]
        tick: number
    } | null>(null)
    // The die's angle outlives the spin, so nothing about starting or ending one
    // can make it jump. It only ever grows.
    const [dieAngle, setDieAngle] = useState(0)
    const timer = useRef<number | null>(null)

    const stopSpin = () => {
        if (timer.current === null) return
        window.clearInterval(timer.current)
        timer.current = null
    }

    // The drawer can close mid-spin. Nothing may tick, or set state, after that.
    useEffect(() => stopSpin, [])

    const shuffle = () => {
        if (disabled) return
        // One timer, whatever happens: a second tap mid-spin abandons the old
        // plan rather than racing it.
        stopSpin()
        const plan = planSpin(value)
        const palettes = planPaletteHand(plan.hand, value, palette)

        if (!motionAllowed) {
            setSpin(null)
            setHand([...plan.hand])
            setHandPalettes(palettes)
            return
        }

        setDieAngle((angle) => angle + DIE_TURN_DEGREES)
        setSpin({ plan, palettes, tick: 0 })

        // The wall clock decides which tick we are on, not a counter: a busy main
        // thread should make the spin SKIP ticks, never run long. A counter turns
        // one janky frame into a longer animation, and eight of them into a spin
        // that is still going when the drawer has been shut.
        const startedAt = performance.now()
        timer.current = window.setInterval(() => {
            const tick = Math.round((performance.now() - startedAt) / TICK_MS)
            if (tick >= plan.ticks) {
                // Everything settled long before this; the tail was the last
                // tile's pop. Commit the hand and stop rendering spin state.
                stopSpin()
                setSpin(null)
                setHand([...plan.hand])
                setHandPalettes(palettes)
                return
            }
            setSpin({ plan, palettes, tick })
        }, TICK_MS)
    }

    const spinning = spin !== null
    const shown = spin ? handAt(spin.plan, spin.tick) : ensurePick(hand, value)
    // `ensurePick` is reached only when room state changes outside this open
    // picker. Keep palettes aligned by slot, and make the externally selected
    // pair authoritative instead of leaving the inserted character in the
    // colour of whichever tile it replaced.
    const settledPalettes = shown.map((key, slot) => {
        if (key === value && isAvatarPaletteKey(palette)) return palette
        if (key === hand[slot] && handPalettes[slot]) return handPalettes[slot]
        return initialPaletteHand([key], null, null)[0]
    })
    const shownPalettes = spin
        ? shown.map((_, slot) =>
              hasSettled(spin.plan, slot, spin.tick) ? spin.palettes[slot] : (handPalettes[slot] ?? spin.palettes[slot])
          )
        : settledPalettes

    const option = (key: AvatarKey, slot: number) => {
        const art = AVATARS[key]
        const offerPalette = shownPalettes[slot]
        // Mid-spin nothing is "the selection": a tile is showing whatever its reel
        // is on, and flashing the selected treatment as that scrolls past would be
        // a lie told sixteen times a second.
        const selected = !spinning && key === value
        const settled = spin === null || hasSettled(spin.plan, slot, spin.tick)
        const popping = spin !== null && isPopping(spin.plan, slot, spin.tick)
        return (
            <button
                // The SLOT is the identity, not the character. Re-keying on the
                // character would unmount and rebuild eight drawings every frame.
                key={slot}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                aria-label={t('option', { name: art.label })}
                // A tap that lands on a moving tile would select a character
                // nobody chose to look at.
                onClick={() => !spinning && onChange(key, offerPalette)}
                data-testid="avatar-option"
                data-avatar={key}
                data-avatar-palette={offerPalette}
                className={cn(
                    tileClass,
                    selected ? 'shadow-4 bg-primary-1' : 'bg-white active:translate-y-[2px]',
                    // One short scale as the reel lands. Without it, "settled" is
                    // only ever inferred from movement stopping, which is negative
                    // information — the eye has to notice an absence.
                    popping && 'animate-tile-settle',
                    disabled && 'opacity-50'
                )}
            >
                <MemberAvatar name={name} avatar={key} palette={offerPalette} size={44} />
                {/* Nobody reads copy at sixteen changes a second, so both lines
                    fade in only when the reel settles. Opacity moves nothing:
                    the full copy block stays reserved throughout. */}
                <span
                    className={cn(copyClass, 'transition-opacity duration-150', settled ? 'opacity-100' : 'opacity-0')}
                >
                    <span className={titleClass} data-testid="avatar-option-title">
                        {art.label}
                    </span>
                    <span className={vibeClass} data-testid="avatar-option-description">
                        {art.vibe}
                    </span>
                </span>
            </button>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            {/* The die sits INSIDE the radiogroup because it is the ninth tile of
                one 3×3 object and splitting the grid would break that. It is a
                plain button and selects nothing; `aria-busy` marks the group while
                the reels are still moving. */}
            <div
                role="radiogroup"
                aria-label={t('titleFor', { name })}
                aria-busy={spinning || undefined}
                data-testid="avatar-picker"
                className="grid grid-cols-3 gap-2"
            >
                {shown.map(option)}
                <button
                    type="button"
                    disabled={disabled}
                    onClick={shuffle}
                    aria-label={t('shuffleLabel')}
                    data-testid="avatar-shuffle"
                    // Not a character and not a selection. In this grid a filled
                    // yellow tile MEANS "this is you", so the die cannot borrow that
                    // colour to mean "press me" — it wore `bg-primary-3` and read as
                    // a second, paler selection. Dashed border on the page surface is
                    // the language this app already uses for a control sitting among
                    // content (PeopleSection's add row, LinkMoment, SettlementRow):
                    // an outline where the others have a card, and no fill of its own.
                    className={cn(
                        tileClass,
                        'border-dashed bg-grey-3',
                        !disabled && 'active:translate-y-[2px]',
                        disabled && 'opacity-50'
                    )}
                >
                    <span
                        className="flex h-11 w-11 items-center justify-center"
                        style={{
                            transform: `rotate(${dieAngle}deg)`,
                            // Declared here rather than as a class so the roll and
                            // the reels cannot drift apart: one constant, one spin.
                            transition: motionAllowed
                                ? `transform ${SPIN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                                : undefined,
                        }}
                    >
                        <Icon name="dice" size={40} />
                    </span>
                    <span className={copyClass}>
                        <span className={titleClass}>{t('shuffle')}</span>
                    </span>
                </button>
            </div>
        </div>
    )
}
