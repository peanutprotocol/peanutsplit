'use client'

import type { ReactNode, SyntheticEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { motion, type Variants } from 'motion/react'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'
import { Icon } from '@/components/ui/Icon'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { LANDING_CAST, LandingPersona } from './LandingPersona'
import { popVariants, riseSoftVariants, riseVariants, sceneKey, sceneProps, sceneVariants, useSceneArm } from './motion'

/** The fold column and the feature grid run long, so their beat is tighter than the shared 80ms. */
const columnVariants: Variants = {
    hidden: { opacity: 0 },
    shown: { opacity: 1, transition: { duration: 0.2, staggerChildren: 0.06, delayChildren: 0.02 } },
}

/**
 * An open fold cascades off the `open` state, not off the viewport: while the fold
 * is closed its body is never in view, so `whileInView` would never fire and the
 * server-rendered copy inside would stay at opacity 0 the whole session.
 */
const foldBodyVariants: Variants = {
    hidden: { opacity: 0 },
    shown: { opacity: 1, transition: { duration: 0.2, staggerChildren: 0.07, delayChildren: 0.05 } },
}

/** The join preview assembles: the card scales in, then its rows land in reading order. */
const joinCardVariants: Variants = {
    hidden: { opacity: 0, scale: 0.96, y: 10 },
    shown: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 240, damping: 22, staggerChildren: 0.06, delayChildren: 0.08 },
    },
}

/** The header doodle lands with a tilt that settles — the one flourish up top. */
const questionVariants: Variants = {
    hidden: { opacity: 0, scale: 0.9, rotate: -10 },
    shown: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 240, damping: 14 } },
}

function Fold({
    title,
    children,
    onToggle,
    motionAllowed,
}: {
    title: string
    children: ReactNode
    onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void
    motionAllowed: boolean
}) {
    const details = useRef<HTMLDetailsElement>(null)
    const [open, setOpen] = useState(false)

    // A fold opened before hydration — or by find-in-page — never reaches the React
    // handler, and its body would then sit at opacity 0 while visibly open.
    useEffect(() => {
        setOpen(details.current?.open === true)
    }, [])

    const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
        setOpen(event.currentTarget.open)
        onToggle(event)
    }

    return (
        <motion.details
            ref={details}
            onToggle={handleToggle}
            variants={riseSoftVariants}
            data-motion-surface
            className="group/fold rounded-sm border border-n-1 bg-white px-4 transition-colors open:bg-primary-4/20 sm:px-5"
        >
            <motion.summary
                whileTap={motionAllowed ? { scale: 0.99 } : undefined}
                className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 text-h6 outline-none transition-colors sm:text-h5 [&::-webkit-details-marker]:hidden"
            >
                <span>{title}</span>
                <Icon
                    name="plus"
                    size={24}
                    aria-hidden="true"
                    className="shrink-0 transition-transform duration-200 group-open/fold:rotate-45 motion-reduce:transition-none"
                />
            </motion.summary>
            <motion.div
                className="landing-fold-body pb-5 pr-0 sm:pr-10"
                data-motion-surface
                variants={foldBodyVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? (open ? 'shown' : 'hidden') : 'shown'}
            >
                {children}
            </motion.div>
        </motion.details>
    )
}

/**
 * The deeper landing-page argument, presented as a real page fold.
 *
 * This follows peanut.me's FAQ interaction language: whole-row native
 * disclosures and a plus that turns into an x. Each fold gets the cleaner,
 * friendly rounded treatment used throughout the product while the copy
 * remains server-rendered inside `<details>`.
 */
export function ReadMore() {
    const t = useTranslations('marketing.readMore')
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const scene = useSceneArm<HTMLElement>(motionAllowed)
    const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
        feedback(event.currentTarget.open ? 'blip' : 'tick', { throttleKey: 'landing-fold' })
    }
    const features: Array<{
        key: 'currency' | 'splits' | 'exact' | 'live' | 'offline' | 'home' | 'transfers'
        doodle: DoodleName
    }> = [
        { key: 'currency', doodle: 'globe' },
        { key: 'splits', doodle: 'slice' },
        { key: 'exact', doodle: 'tally' },
        { key: 'live', doodle: 'pulse' },
        { key: 'offline', doodle: 'tent' },
        { key: 'home', doodle: 'phone' },
        { key: 'transfers', doodle: 'swap' },
    ]
    const methods: Array<{ key: 'cash' | 'bank'; doodle: DoodleName }> = [
        { key: 'cash', doodle: 'cash' },
        { key: 'bank', doodle: 'bank' },
    ]
    const team = [
        { key: 'konrad', persona: LANDING_CAST.konrad },
        { key: 'hugo', persona: LANDING_CAST.hugo },
    ] as const
    const points = ['built', 'free', 'data'] as const
    const questions = ['retype', 'access', 'lost', 'limits'] as const

    return (
        <motion.section
            ref={scene.ref}
            key={sceneKey('read-more', scene.armed)}
            data-testid="read-more"
            data-motion={motionAllowed ? 'ready' : 'still'}
            data-motion-surface
            {...sceneProps(scene.armed, 0.08)}
            className="w-full border-y-2 border-n-1 bg-primary-3"
        >
            <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
                <motion.div
                    className="flex items-start justify-between gap-6"
                    variants={sceneVariants}
                    data-motion-surface
                >
                    <div>
                        <motion.h2 className="text-h3 sm:text-h2" variants={riseVariants} data-motion-surface>
                            {t('toggle')}
                        </motion.h2>
                        <motion.p
                            className="mt-3 max-w-xl text-base leading-6 text-grey-1"
                            variants={riseSoftVariants}
                            data-motion-surface
                        >
                            {t('toggleHint')}
                        </motion.p>
                    </div>
                    <motion.div
                        className="mt-1 hidden shrink-0 sm:block"
                        variants={questionVariants}
                        data-motion-surface
                    >
                        <Doodle name="question" size={54} weight={1.5} />
                    </motion.div>
                </motion.div>

                <motion.div className="mt-10 flex flex-col gap-3" variants={columnVariants} data-motion-surface>
                    <Fold title={t('join.title')} onToggle={onToggle} motionAllowed={motionAllowed}>
                        <motion.div
                            className="rounded-sm border border-n-1 bg-white p-4 sm:max-w-xl"
                            variants={joinCardVariants}
                            data-motion-surface
                        >
                            <motion.p
                                className="flex items-center gap-2 text-h8"
                                variants={riseSoftVariants}
                                data-motion-surface
                            >
                                <Doodle name="mountain" size={22} weight={1.8} />
                                {t('join.roomName')}
                            </motion.p>
                            <motion.p
                                className="mt-3 text-sm text-grey-1"
                                variants={riseSoftVariants}
                                data-motion-surface
                            >
                                {t('join.nameLabel')}
                            </motion.p>
                            <motion.p
                                className="mt-1 rounded-sm border border-dashed border-n-1 px-2 py-1 text-sm text-grey-1"
                                variants={riseSoftVariants}
                                data-motion-surface
                            >
                                {t('join.namePlaceholder')}
                            </motion.p>
                            <motion.p className="mt-3 text-center text-h8" variants={popVariants} data-motion-surface>
                                {t('join.button')}
                            </motion.p>
                        </motion.div>
                        <motion.p
                            className="mt-4 max-w-xl text-sm leading-5 text-n-1"
                            variants={riseSoftVariants}
                            data-motion-surface
                        >
                            {t('join.body')}
                        </motion.p>
                    </Fold>

                    <Fold title={t('features.title')} onToggle={onToggle} motionAllowed={motionAllowed}>
                        <motion.ul
                            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                            variants={columnVariants}
                            data-motion-surface
                        >
                            {features.map(({ key, doodle }) => (
                                <motion.li
                                    key={key}
                                    className="rounded-sm border border-n-1 bg-white p-4"
                                    variants={popVariants}
                                    data-motion-surface
                                >
                                    <Doodle name={doodle} size={25} weight={1.8} />
                                    <span className="mt-2 block text-h7">{t(`features.${key}.title`)}</span>
                                    <span className="mt-1 block text-sm leading-5 text-grey-1">
                                        {t(`features.${key}.body`)}
                                    </span>
                                </motion.li>
                            ))}
                        </motion.ul>
                    </Fold>

                    <Fold title={t('settle.title')} onToggle={onToggle} motionAllowed={motionAllowed}>
                        <motion.ul className="grid grid-cols-2 gap-2" variants={sceneVariants} data-motion-surface>
                            {methods.map(({ key, doodle }) => (
                                <motion.li
                                    key={key}
                                    className="flex flex-col items-center gap-2 rounded-sm border border-n-1 bg-white p-3 text-center text-h8"
                                    variants={popVariants}
                                    data-motion-surface
                                >
                                    <Doodle name={doodle} size={25} weight={1.8} />
                                    {t(`settle.${key}`)}
                                </motion.li>
                            ))}
                        </motion.ul>
                    </Fold>

                    <Fold title={t('team.title')} onToggle={onToggle} motionAllowed={motionAllowed}>
                        <motion.p
                            className="max-w-xl text-sm leading-5 text-grey-1"
                            variants={riseSoftVariants}
                            data-motion-surface
                        >
                            {t('team.intro')}
                        </motion.p>
                        <motion.ul
                            className="mt-4 grid gap-3 sm:grid-cols-2"
                            variants={sceneVariants}
                            data-motion-surface
                        >
                            {team.map(({ key, persona }) => (
                                <motion.li
                                    key={key}
                                    className="flex items-start gap-4 rounded-sm border border-n-1 bg-white p-4"
                                    variants={popVariants}
                                    data-motion-surface
                                >
                                    <LandingPersona persona={persona} size={80} className="shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm leading-5 text-n-1">“{t(`team.${key}.quote`)}”</p>
                                        <p className="mt-2 text-h8">
                                            {t(`team.${key}.name`)}
                                            <span className="font-normal text-grey-1"> · {t(`team.${key}.role`)}</span>
                                        </p>
                                    </div>
                                </motion.li>
                            ))}
                        </motion.ul>
                    </Fold>

                    <Fold title={t('who.title')} onToggle={onToggle} motionAllowed={motionAllowed}>
                        <motion.ul className="flex flex-col gap-3" variants={sceneVariants} data-motion-surface>
                            {points.map((point) => (
                                <motion.li
                                    key={point}
                                    className="flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4"
                                    variants={riseSoftVariants}
                                    data-motion-surface
                                >
                                    <motion.span
                                        aria-hidden="true"
                                        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1 bg-green-1"
                                        variants={popVariants}
                                        data-motion-surface
                                    >
                                        <Icon name="check" size={14} className="text-n-1" />
                                    </motion.span>
                                    <span className="flex-1">
                                        <span className="block text-h7">{t(`who.${point}.title`)}</span>
                                        <span className="mt-1 block text-sm leading-5 text-grey-1">
                                            {t(`who.${point}.body`)}
                                        </span>
                                    </span>
                                </motion.li>
                            ))}
                        </motion.ul>
                    </Fold>

                    {questions.map((question) => (
                        <Fold
                            key={question}
                            title={t(`faq.${question}.q`)}
                            onToggle={onToggle}
                            motionAllowed={motionAllowed}
                        >
                            <motion.p
                                className="max-w-xl text-sm leading-6 text-grey-1"
                                variants={riseSoftVariants}
                                data-motion-surface
                            >
                                {t(`faq.${question}.a`)}
                                {question === 'retype' && ` ${t('faq.retype.import')}`}
                            </motion.p>
                        </Fold>
                    ))}
                </motion.div>

                <motion.p
                    className="mt-8 text-sm leading-5 text-grey-1"
                    variants={riseSoftVariants}
                    data-motion-surface
                >
                    {t('compare.line')}{' '}
                    <Link href="/splitwise-alternative" className="text-n-1 underline underline-offset-2">
                        {t('compare.link')}
                    </Link>
                </motion.p>
            </div>
        </motion.section>
    )
}

export default ReadMore
