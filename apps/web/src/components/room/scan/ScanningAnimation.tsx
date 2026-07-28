'use client'

/**
 * The wait, made worth watching.
 *
 * A vision call takes three to eight seconds — long enough that a spinner reads
 * as "stuck". So the wait gets a picture of what is happening: a paper receipt
 * with a bar sweeping down it, and the ghost lines lighting up as the bar passes
 * them. It is honest about the operation (something is reading your bill,
 * top to bottom) rather than decorative, which is what makes it tolerable to
 * watch twice.
 *
 * Motion is a preference, not a given: with `useMotionAllowed()` false the same
 * receipt renders still, with the lines already lit. Nothing about the state is
 * carried by the movement, so removing it costs no information.
 */

import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { useMotionAllowed } from '@/lib/use-motion'

/** Varied widths so the block reads as printed lines rather than a loading
 *  skeleton — the shape is doing the explaining. */
const LINES = [0.82, 0.64, 0.9, 0.55, 0.74, 0.48, 0.86, 0.6]

export function ScanningAnimation() {
    const t = useTranslations('room.scan')
    const motionAllowed = useMotionAllowed()

    return (
        <div className="flex flex-col items-center gap-6 py-8" role="status" aria-live="polite">
            <div className="relative w-44 overflow-hidden rounded-sm border border-n-1 bg-white p-4 shadow-[4px_4px_0_0_#211C17]">
                <div className="flex flex-col gap-2.5">
                    {LINES.map((width, index) => (
                        <motion.div
                            key={index}
                            className="h-2 rounded-full bg-n-1"
                            style={{ width: `${width * 100}%` }}
                            initial={{ opacity: motionAllowed ? 0.15 : 0.55 }}
                            animate={
                                motionAllowed
                                    ? { opacity: [0.15, 0.85, 0.15] }
                                    : // Lit and still: the same picture, minus the sweep.
                                      { opacity: 0.55 }
                            }
                            transition={
                                motionAllowed
                                    ? {
                                          duration: 1.6,
                                          repeat: Infinity,
                                          ease: 'easeInOut',
                                          // Staggered by row so the glow travels with the bar
                                          // instead of the whole receipt pulsing at once.
                                          delay: (index / LINES.length) * 1.6,
                                      }
                                    : { duration: 0 }
                            }
                        />
                    ))}
                </div>

                {motionAllowed && (
                    <motion.div
                        aria-hidden
                        className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-primary-1/70 to-transparent"
                        initial={{ top: '-2rem' }}
                        animate={{ top: ['-2rem', '100%'] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                    />
                )}
            </div>

            <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-h7">{t('reading')}</p>
                {/* The privacy promise belongs HERE, at the one moment the user is
                    wondering where their photo just went. */}
                <p className="text-sm text-grey-1">{t('privacyNote')}</p>
            </div>
        </div>
    )
}
