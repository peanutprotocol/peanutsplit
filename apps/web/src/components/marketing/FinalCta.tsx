'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { motion, type Variants } from 'motion/react'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { buttonClassName } from '@/components/ui/button-style'
import { LANDING_CAST, LandingPersona } from './LandingPersona'
import { popVariants, riseSoftVariants, riseVariants, sceneKey, sceneProps, useSceneArm } from './motion'

/** The card is the stage: it lands with the section, then hands the stagger to the pieces on it. */
const cardVariants: Variants = {
    hidden: { y: 14 },
    shown: {
        y: 0,
        transition: {
            type: 'spring',
            stiffness: 240,
            damping: 26,
            staggerChildren: 0.07,
            delayChildren: 0.05,
        },
    },
}

/** The faces get a beat of their own, tighter than the copy, so they read as one group arriving. */
const facesVariants: Variants = {
    hidden: {},
    shown: { transition: { staggerChildren: 0.06 } },
}

/** Each face drops in off-angle and straightens. The tilt differs per face so they do not march. */
const faceVariants: Variants = {
    hidden: (tilt: number) => ({ opacity: 0, scale: 0.6, rotate: tilt }),
    shown: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 320, damping: 18 } },
}

const FACES = [
    { persona: LANDING_CAST.bea, tilt: -14 },
    { persona: LANDING_CAST.jules, tilt: 12 },
    { persona: LANDING_CAST.you, tilt: -8 },
]

/**
 * The second and last ask on the page. The hero's CTA catches people who already knew what they
 * wanted; this one catches the ones who needed the four sections in between, and it names a
 * concrete occasion rather than repeating the hero's abstraction.
 *
 * Same button as the hero on purpose — a different-looking primary action at the bottom reads
 * as a different action.
 *
 * The supporting line names the next group expense without repeating the hero's trust claims.
 * It gives the broad headline a concrete job while the shared button still carries the ask.
 *
 * It arrives as a scene rather than as one block: the three faces pop in one after another, the
 * ask rises under them, and the button lands last.
 */
export function FinalCta() {
    const t = useTranslations('marketing.finalCta')
    const motionAllowed = useMotionAllowed()
    const feedback = useFeedback()
    const scene = useSceneArm<HTMLElement>(motionAllowed)

    return (
        <motion.section
            ref={scene.ref}
            key={sceneKey('final-cta', scene.armed)}
            data-testid="final-cta"
            data-motion={motionAllowed ? 'ready' : 'still'}
            data-motion-surface
            {...sceneProps(scene.armed)}
            className="mx-auto w-full max-w-xl px-5 py-10"
        >
            {/* `.final-cta-link:active` owns the press. A `whileTap` here would also make motion
                stamp `tabIndex=0` on this div, giving keyboard users the CTA twice. */}
            <motion.div variants={cardVariants} data-motion-surface>
                <Link
                    href="/new"
                    data-testid="final-cta-link"
                    className="final-cta-link shadow-4 block rounded-sm border border-n-1 bg-white p-5 text-inherit no-underline"
                    onClick={() => feedback('whoosh')}
                >
                    <motion.div
                        className="mb-4 flex -space-x-2"
                        aria-hidden="true"
                        variants={facesVariants}
                        data-motion-surface
                    >
                        {FACES.map(({ persona, tilt }) => (
                            <motion.span
                                key={persona}
                                className="flex"
                                custom={tilt}
                                variants={faceVariants}
                                data-motion-surface
                            >
                                <LandingPersona persona={persona} size={40} />
                            </motion.span>
                        ))}
                    </motion.div>
                    <motion.h2 className="text-h5" variants={riseVariants} data-motion-surface>
                        {t('title')}
                    </motion.h2>
                    {/*
                     * Not <Button>: a <button> inside an <a> is invalid HTML, and the whole card is the
                     * link now. It borrows Button's classes. The document root owns the native-catalog
                     * translation policy. The press affordance lives on .final-cta-link:active instead.
                     *
                     * The pop rides on the wrapper because Button's own `transition-all` would fight
                     * the inline transform motion writes each frame.
                     */}
                    <motion.div className="mt-4" variants={popVariants} data-motion-surface>
                        <span
                            className={buttonClassName({
                                shadowSize: '4',
                                interactive: false,
                                className: 'final-cta-button justify-center text-h6',
                            })}
                        >
                            {t('button')}
                        </span>
                    </motion.div>
                </Link>
            </motion.div>
        </motion.section>
    )
}

export default FinalCta
