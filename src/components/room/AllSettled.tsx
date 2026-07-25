'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { peanutCheering } from '@/assets/mascot'
import { useFeedback } from '@/lib/use-settings'
import { Confetti } from './Confetti'

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
    summary?: { people: number; expenses: number }
}

export function AllSettled({ compact = false, celebrate = false, summary }: AllSettledProps) {
    const reduceMotion = useReducedMotion()
    const feedback = useFeedback()
    const rung = useRef(false)

    useEffect(() => {
        if (!celebrate || rung.current) return
        rung.current = true
        feedback('bell')
    }, [celebrate, feedback])

    return (
        <motion.div
            data-testid="all-settled"
            initial={reduceMotion ? false : { scale: 0.92, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, mass: 0.9 }}
            className={
                compact
                    ? 'shadow-4 relative mx-4 flex flex-col items-center gap-2 rounded-sm border border-n-1 bg-green-1 px-6 py-5 text-center'
                    : 'shadow-primary-6 relative mx-4 flex flex-col items-center gap-3 rounded-sm border border-n-1 bg-green-1 px-6 py-8 text-center'
            }
        >
            {/* Spilling past the card edge is the point — a burst contained by a
                border is a progress bar, not a celebration. */}
            {celebrate && <Confetti className="-inset-8" />}

            <motion.div
                initial={reduceMotion ? false : { scale: 0.3, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 13, mass: 1.1, delay: celebrate ? 0.08 : 0 }}
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
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26, delay: celebrate ? 0.22 : 0 }}
                className="flex flex-col items-center gap-2"
            >
                <p className={compact ? 'text-h5' : 'text-h3'}>All settled up</p>
                <p className="max-w-[20rem] text-sm font-medium text-n-1">
                    Nobody owes anybody anything. Enjoy the rare feeling.
                </p>

                {/* The receipt: what actually got squared away. Without it the card
                    is a mood; with it, it is a result worth screenshotting. */}
                {summary && (
                    <p className="mt-2 flex items-center gap-2 rounded-sm border border-n-1 bg-white px-3 py-1.5 text-h9 uppercase tracking-wide">
                        <span>
                            {summary.expenses} {summary.expenses === 1 ? 'expense' : 'expenses'}
                        </span>
                        <span aria-hidden="true" className="text-grey-1">
                            ·
                        </span>
                        <span>
                            {summary.people} {summary.people === 1 ? 'person' : 'people'}
                        </span>
                        <span aria-hidden="true" className="text-grey-1">
                            ·
                        </span>
                        <span>all square</span>
                    </p>
                )}
            </motion.div>
        </motion.div>
    )
}
