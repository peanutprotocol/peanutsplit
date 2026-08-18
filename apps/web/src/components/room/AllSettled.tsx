'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { peanutCheering } from '@/assets/mascot'
import { type DoodleName } from '@/components/ui/doodles'
import { recapPath } from '@/lib/recap'
import { storyBucketFor } from '@/lib/story'
import { DUCK_LEAD_MS, duckMaster } from '@/lib/sounds'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback, useSettings } from '@/lib/use-settings'
import { Confetti } from './Confetti'
import { RecapShareButton } from './RecapShareButton'

/**
 * Signature moment #6. Deliberately screenshot-worthy — this is the state people
 * send back into the group chat, so it is composed as an artefact rather than a
 * status message: a green card with a hard shadow, the mascot springing in over
 * a burst of brand confetti, and a rule of three under the headline.
 *
 * `celebrate` gates the whole performance. The room passes it once, the first
 * time the room actually reaches zero; the settle drawer renders the same card
 * quietly (`compact`), because two celebrations for one event is one too many.
 */
interface AllSettledProps {
    compact?: boolean
    celebrate?: boolean
    /** The receipt line. Omitted in the drawer, where the room is right behind it. */
    summary?: { people: number; expenses: number; days: number }
    /** The room's own character — it rides the confetti. Omitted in the drawer. */
    emblem?: DoodleName
    /**
     * Present only in the room, where the recap belongs. The settle drawer renders
     * this card too, and offering "share the story" from behind a sheet — before
     * the celebration has even played — is asking for the artefact at the one
     * moment nobody wants it.
     */
    slug?: string
}

/**
 * The Pixar bounce, hand-keyed rather than sprung. A spring can overshoot but it
 * cannot *anticipate*, and the crouch before the launch is the entire reason this
 * reads as alive rather than as a scaling image.
 *
 * Nine keyframes over ~1s: crouch, stretch off the floor, apex, land heavy, then
 * two decaying hops. scaleX and scaleY move opposite each other the whole way —
 * squash wide is squash short — because conserved volume is what the eye reads
 * as a body.
 */
const BOUNCE_S = 1
const BOUNCE_TIMES = [0, 0.09, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 1]
const BOUNCE = {
    scaleX: [1, 1.18, 0.84, 0.96, 1.16, 0.94, 1.08, 0.98, 1],
    scaleY: [1, 0.8, 1.24, 1.06, 0.86, 1.1, 0.93, 1.03, 1],
    y: [0, 4, -18, -40, 0, -18, 0, -6, 0],
    rotate: 0,
    opacity: 1,
}
/** Index 2 of the keyframes: the stretch that leaves the floor. */
const LAUNCH_S = BOUNCE_S * BOUNCE_TIMES[2]
/** The burst trails the launch instead of firing with it, so it reads as caused
 *  by the jump rather than as a second thing that happened at the same time. */
const CONFETTI_DELAY_S = LAUNCH_S + 0.15

export function AllSettled({ compact = false, celebrate = false, summary, emblem, slug }: AllSettledProps) {
    const t = useTranslations('room.allSettled')
    const tRecap = useTranslations('room.recap')
    const tStory = useTranslations('room.story')
    const motionAllowed = useMotionAllowed()
    const { settings } = useSettings()
    const feedback = useFeedback()
    const rung = useRef(false)
    const bouncing = celebrate && motionAllowed

    useEffect(() => {
        if (!celebrate || rung.current) return
        rung.current = true
        // Terminal cue: pull the bed down first so the bell rides over the settle
        // thunk and the row collapse still decaying under it. Gated on the sound
        // setting directly — `duckMaster` would otherwise build an AudioContext
        // for someone who has turned sound off.
        if (settings.soundEnabled) duckMaster()
        const timer = window.setTimeout(() => feedback('bell', { haptic: 'success' }), DUCK_LEAD_MS)
        return () => window.clearTimeout(timer)
    }, [celebrate, feedback, settings.soundEnabled])

    return (
        <motion.div
            data-testid="all-settled"
            initial={motionAllowed ? { scale: 0.92, opacity: 0, y: 8 } : false}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={motionAllowed ? { scale: 0.94, opacity: 0, transition: { duration: 0.18 } } : undefined}
            transition={motionAllowed ? { type: 'spring', stiffness: 260, damping: 20, mass: 0.9 } : { duration: 0 }}
            data-motion-surface
            className={
                compact
                    ? 'shadow-4 relative mx-4 flex flex-col items-center gap-2 rounded-sm border border-n-1 bg-green-1 px-6 py-5 text-center'
                    : 'shadow-primary-6 relative mx-4 flex flex-col items-center gap-3 rounded-sm border border-n-1 bg-green-1 px-6 py-8 text-center'
            }
        >
            {/* Spilling past the card edge is the point — a burst contained by a
                border is a progress bar, not a celebration. The inset is capped at
                `-inset-4`, matching this card's own `mx-4`: that margin is the only
                safe room to spill into, because nothing wraps this component with
                horizontal padding of its own. A wider inset (this was `-inset-8`)
                spilled past the viewport itself, widening the whole document by
                15px on a 390px phone and pushing the "Add expense" bar off-screen
                with no way to scroll to it. */}
            {celebrate && <Confetti className="-inset-4" delay={CONFETTI_DELAY_S} doodle={emblem} />}

            <motion.div
                initial={
                    !motionAllowed
                        ? false
                        : bouncing
                          ? // The bounce starts from rest and fades in over its own
                            // crouch — a scale-in entrance in front of it would eat
                            // the anticipation, which is the whole point.
                            { scaleX: 1, scaleY: 1, y: 0, opacity: 0 }
                          : { scale: 0.3, rotate: -14, opacity: 0 }
                }
                animate={bouncing ? BOUNCE : { scale: 1, rotate: 0, opacity: 1 }}
                transition={
                    !motionAllowed
                        ? { duration: 0 }
                        : bouncing
                          ? { duration: BOUNCE_S, times: BOUNCE_TIMES, ease: 'easeOut', opacity: { duration: 0.14 } }
                          : { type: 'spring', stiffness: 300, damping: 13, mass: 1.1 }
                }
                data-motion-surface
                className="relative"
            >
                <Image
                    src={peanutCheering}
                    alt=""
                    unoptimized
                    className={compact ? 'h-20 w-20 object-contain' : 'h-28 w-28 object-contain'}
                />
            </motion.div>

            <motion.div
                initial={motionAllowed ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={
                    motionAllowed
                        ? { type: 'spring', stiffness: 320, damping: 26, delay: bouncing ? LAUNCH_S : 0 }
                        : { duration: 0 }
                }
                data-motion-surface
                className="flex flex-col items-center gap-2"
            >
                <p className={compact ? 'text-h5' : 'text-h3'}>{t('title')}</p>

                {/* The receipt: what actually got squared away. Without it the card
                    is a mood; with it, it is a result worth screenshotting. */}
                {summary && (
                    <p className="mt-2 flex items-center gap-2 rounded-sm border border-n-1 bg-white px-3 py-1.5 text-h9 uppercase tracking-wide">
                        <span>{t('expenseCount', { count: summary.expenses })}</span>
                        <span aria-hidden="true" className="text-grey-1">
                            ·
                        </span>
                        <span>{t('peopleCount', { count: summary.people })}</span>
                        <span aria-hidden="true" className="text-grey-1">
                            ·
                        </span>
                        <span>{t('allSquare')}</span>
                    </p>
                )}

                {/* The epilogue: the receipt's numbers, told back as this room's
                    story. Deterministic — same trip, same line, on every phone
                    that screenshots it. It rides the block's existing spring,
                    which is the whole trick: the story lands with the receipt,
                    not as a second event. */}
                {summary && (
                    <p className="max-w-[20rem] text-sm font-medium text-n-1/70">
                        {tStory(
                            storyBucketFor({
                                dayCount: summary.days,
                                expenseCount: summary.expenses,
                                memberCount: summary.people,
                            }),
                            {
                                days: summary.days,
                                count: summary.people,
                                rounds: summary.expenses,
                            }
                        )}
                    </p>
                )}

                {/* The second artefact. It arrives AFTER the celebration has landed
                    — the card is already the screenshot people take, and this is
                    the version with the numbers on it, minted rather than cropped. */}
                {slug && (
                    <div className="mt-3 flex w-full max-w-xs flex-col items-center gap-2">
                        <RecapShareButton slug={slug} />
                        <Link href={recapPath(slug)} className="text-sm font-bold text-n-1 underline">
                            {tRecap('seeRecap')}
                        </Link>
                    </div>
                )}
            </motion.div>
        </motion.div>
    )
}
