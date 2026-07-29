'use client'

import { useTranslations } from 'next-intl'
import { motion, type Variants } from 'motion/react'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'
import { useMotionAllowed } from '@/lib/use-motion'

const sceneVariants: Variants = {
    hidden: { opacity: 0 },
    shown: {
        opacity: 1,
        transition: { duration: 0.28, staggerChildren: 0.1, delayChildren: 0.04 },
    },
}

const riseVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    shown: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 210, damping: 24 },
    },
}

const popVariants: Variants = {
    hidden: { opacity: 0, scale: 0.94 },
    shown: {
        opacity: 1,
        scale: 1,
        transition: { type: 'spring', stiffness: 260, damping: 20 },
    },
}

/**
 * Three large product truths replace the old run of interchangeable feature cards.
 *
 * These are verified, illustrative fixtures: no room queries, no fabricated live activity and
 * no controls pretending to write data. They make the trust model visible before the detailed
 * FAQ takes over lower on the page.
 */
export function LandingProof() {
    const t = useTranslations('marketing.proof')
    const motionAllowed = useMotionAllowed()
    const examples: Array<{ doodle: DoodleName; name: string; meta: string }> = [
        { doodle: 'train', name: t('examples.lisbon.name'), meta: t('examples.lisbon.meta') },
        { doodle: 'house', name: t('examples.flat.name'), meta: t('examples.flat.meta') },
        { doodle: 'noodles', name: t('examples.dinner.name'), meta: t('examples.dinner.meta') },
        { doodle: 'globe', name: t('examples.retreat.name'), meta: t('examples.retreat.meta') },
    ]

    return (
        <div className="landing-proof" data-testid="landing-proof" data-motion={motionAllowed ? 'ready' : 'still'}>
            <motion.section
                data-testid="proof-link-identity"
                className="landing-proof-scene landing-proof-scene-link"
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.28 }}
            >
                <motion.div className="landing-proof-copy" variants={riseVariants}>
                    <h2>{t('linkIdentity.title')}</h2>
                    <span>{t('linkIdentity.body')}</span>
                </motion.div>

                <motion.div className="landing-proof-visual" variants={popVariants}>
                    <div className="landing-proof-link-card" aria-hidden="true">
                        <div className="landing-proof-ticket">
                            <Doodle name="link" size={34} weight={1.7} />
                            <span>
                                <small>{t('linkIdentity.linkLabel')}</small>
                                <b>peanutsplit.com/r/lisbon-weekend-••••••</b>
                            </span>
                        </div>
                        <div className="landing-proof-identity">
                            <small>{t('linkIdentity.identityLabel')}</small>
                            <ul>
                                <li>
                                    <i>Y</i>
                                    {t('linkIdentity.you')}
                                </li>
                                <li>
                                    <i>B</i>
                                    {t('linkIdentity.friendOne')}
                                </li>
                                <li>
                                    <i>J</i>
                                    {t('linkIdentity.friendTwo')}
                                </li>
                            </ul>
                        </div>
                    </div>
                </motion.div>
            </motion.section>

            <motion.section
                data-testid="proof-everyone-adds"
                className="landing-proof-scene landing-proof-scene-expenses"
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.28 }}
            >
                <motion.div className="landing-proof-copy" variants={riseVariants}>
                    <h2>{t('everyoneAdds.title')}</h2>
                    <span>{t('everyoneAdds.body')}</span>
                </motion.div>

                <motion.div className="landing-proof-visual" variants={popVariants}>
                    <ul className="landing-proof-expenses" aria-hidden="true">
                        <li>
                            <Doodle name="train" size={30} weight={1.7} />
                            <span>
                                <b>{t('everyoneAdds.expenseOne')}</b>
                                <small>{t('everyoneAdds.expenseOneMeta')}</small>
                            </span>
                        </li>
                        <li>
                            <Doodle name="noodles" size={30} weight={1.7} />
                            <span>
                                <b>{t('everyoneAdds.expenseTwo')}</b>
                                <small>{t('everyoneAdds.expenseTwoMeta')}</small>
                            </span>
                        </li>
                        <li>
                            <Doodle name="taxi" size={30} weight={1.7} />
                            <span>
                                <b>{t('everyoneAdds.expenseThree')}</b>
                                <small>{t('everyoneAdds.expenseThreeMeta')}</small>
                            </span>
                        </li>
                    </ul>
                </motion.div>
            </motion.section>

            <motion.section
                data-testid="proof-suggested-plan"
                className="landing-proof-scene landing-proof-scene-plan"
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.28 }}
            >
                <motion.div className="landing-proof-copy" variants={riseVariants}>
                    <h2>{t('suggestedPlan.title')}</h2>
                    <span>{t('suggestedPlan.body')}</span>
                </motion.div>

                <motion.div className="landing-proof-visual" variants={popVariants}>
                    <div className="landing-proof-plan" aria-hidden="true">
                        <span>{t('suggestedPlan.planLabel')}</span>
                        <p>
                            <i>Y</i>
                            <b>{t('suggestedPlan.paymentOne')}</b>
                            <Doodle name="iconarrowright" size={25} weight={2.2} />
                            <i>B</i>
                        </p>
                        <p>
                            <i>Y</i>
                            <b>{t('suggestedPlan.paymentTwo')}</b>
                            <Doodle name="iconarrowright" size={25} weight={2.2} />
                            <i>J</i>
                        </p>
                    </div>
                </motion.div>
            </motion.section>

            <motion.ul
                className="landing-proof-rail"
                aria-label={t('suggestedPlan.planLabel')}
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.7 }}
            >
                <motion.li variants={riseVariants}>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.roomCreated')}
                </motion.li>
                <motion.li variants={riseVariants}>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.linkShared')}
                </motion.li>
                <motion.li variants={riseVariants}>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.friendJoined')}
                </motion.li>
                <motion.li variants={riseVariants}>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.roomEven')}
                </motion.li>
            </motion.ul>

            <motion.section
                data-testid="room-examples"
                className="landing-room-examples"
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.2 }}
            >
                <motion.div className="landing-room-examples-heading" variants={riseVariants}>
                    <p>{t('examples.eyebrow')}</p>
                    <div className="landing-room-examples-copy">
                        <h2>{t('examples.title')}</h2>
                        <span>{t('examples.body')}</span>
                    </div>
                </motion.div>
                <motion.ul variants={sceneVariants}>
                    {examples.map((example) => (
                        <motion.li key={example.name} variants={popVariants}>
                            <Doodle name={example.doodle} size={38} weight={1.6} />
                            <span>
                                <b>{example.name}</b>
                                <small>{example.meta}</small>
                            </span>
                        </motion.li>
                    ))}
                </motion.ul>
            </motion.section>
        </div>
    )
}

export default LandingProof
