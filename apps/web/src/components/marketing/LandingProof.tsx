'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { motion, type Variants } from 'motion/react'
import { Doodle } from '@/components/ui/Doodle'
import { useMotionAllowed } from '@/lib/use-motion'
import { SLUG_TAIL_HINT } from '@/lib/slugify'
import { LANDING_CAST, LandingPersona } from './LandingPersona'

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
    const tFooter = useTranslations('marketing.footer')
    const motionAllowed = useMotionAllowed()
    const examples = [
        { persona: LANDING_CAST.lisbon, name: t('examples.lisbon.name'), meta: t('examples.lisbon.meta') },
        { persona: LANDING_CAST.flat, name: t('examples.flat.name'), meta: t('examples.flat.meta') },
        { persona: LANDING_CAST.dinner, name: t('examples.dinner.name'), meta: t('examples.dinner.meta') },
        { persona: LANDING_CAST.retreat, name: t('examples.retreat.name'), meta: t('examples.retreat.meta') },
    ]

    return (
        <div className="landing-proof" data-testid="landing-proof" data-motion={motionAllowed ? 'ready' : 'still'}>
            <motion.section
                data-testid="proof-link-identity"
                data-motion-surface
                className="landing-proof-scene landing-proof-scene-link"
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.28 }}
            >
                <motion.div className="landing-proof-copy" variants={riseVariants} data-motion-surface>
                    <h2>{t('linkIdentity.title')}</h2>
                    <span>{t('linkIdentity.body')}</span>
                </motion.div>

                <motion.div className="landing-proof-visual" variants={popVariants} data-motion-surface>
                    <Link
                        href="/app"
                        aria-label={`${tFooter('createSplit')}: ${t('linkIdentity.title')}`}
                        data-testid="proof-link-identity-link"
                        className="landing-proof-object-link landing-proof-object-link-identity"
                    >
                        <div className="landing-proof-link-card" aria-hidden="true">
                            <div className="landing-proof-ticket">
                                <Doodle name="link" size={34} weight={1.7} />
                                <span>
                                    <small>{t('linkIdentity.linkLabel')}</small>
                                    <b>peanutsplit.com/r/lisbon-weekend{SLUG_TAIL_HINT}</b>
                                </span>
                            </div>
                            <div className="landing-proof-identity">
                                <small>{t('linkIdentity.identityLabel')}</small>
                                <ul>
                                    <li>
                                        <LandingPersona persona={LANDING_CAST.you} size={32} />
                                        {t('linkIdentity.you')}
                                    </li>
                                    <li>
                                        <LandingPersona persona={LANDING_CAST.bea} size={32} />
                                        {t('linkIdentity.friendOne')}
                                    </li>
                                    <li>
                                        <LandingPersona persona={LANDING_CAST.jules} size={32} />
                                        {t('linkIdentity.friendTwo')}
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </Link>
                </motion.div>
            </motion.section>

            <motion.section
                data-testid="proof-everyone-adds"
                data-motion-surface
                className="landing-proof-scene landing-proof-scene-expenses"
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.28 }}
            >
                <motion.div className="landing-proof-copy" variants={riseVariants} data-motion-surface>
                    <h2>{t('everyoneAdds.title')}</h2>
                    <span>{t('everyoneAdds.body')}</span>
                </motion.div>

                <motion.div className="landing-proof-visual" variants={popVariants} data-motion-surface>
                    <Link
                        href="/app"
                        aria-label={`${tFooter('createSplit')}: ${t('everyoneAdds.title')}`}
                        data-testid="proof-everyone-adds-link"
                        className="landing-proof-object-link landing-proof-object-link-expenses"
                    >
                        <ul className="landing-proof-expenses" aria-hidden="true">
                            <li>
                                <LandingPersona persona={LANDING_CAST.bea} size={42} />
                                <span>
                                    <b>{t('everyoneAdds.expenseOne')}</b>
                                    <small>{t('everyoneAdds.expenseOneMeta')}</small>
                                </span>
                            </li>
                            <li>
                                <LandingPersona persona={LANDING_CAST.jules} size={42} />
                                <span>
                                    <b>{t('everyoneAdds.expenseTwo')}</b>
                                    <small>{t('everyoneAdds.expenseTwoMeta')}</small>
                                </span>
                            </li>
                            <li>
                                <LandingPersona persona={LANDING_CAST.ana} size={42} />
                                <span>
                                    <b>{t('everyoneAdds.expenseThree')}</b>
                                    <small>{t('everyoneAdds.expenseThreeMeta')}</small>
                                </span>
                            </li>
                        </ul>
                    </Link>
                </motion.div>
            </motion.section>

            <motion.section
                data-testid="proof-suggested-plan"
                data-motion-surface
                className="landing-proof-scene landing-proof-scene-plan"
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.28 }}
            >
                <motion.div className="landing-proof-copy" variants={riseVariants} data-motion-surface>
                    <h2>{t('suggestedPlan.title')}</h2>
                    <span>{t('suggestedPlan.body')}</span>
                </motion.div>

                <motion.div className="landing-proof-visual" variants={popVariants} data-motion-surface>
                    <Link
                        href="/app"
                        aria-label={`${tFooter('createSplit')}: ${t('suggestedPlan.title')}`}
                        data-testid="proof-suggested-plan-link"
                        className="landing-proof-object-link landing-proof-object-link-plan"
                    >
                        <div className="landing-proof-plan" aria-hidden="true">
                            <span>{t('suggestedPlan.planLabel')}</span>
                            <p>
                                <LandingPersona persona={LANDING_CAST.you} size={32} />
                                <b>{t('suggestedPlan.paymentOne')}</b>
                                <Doodle name="iconarrowright" size={25} weight={2.2} />
                                <LandingPersona persona={LANDING_CAST.bea} size={32} />
                            </p>
                            <p>
                                <LandingPersona persona={LANDING_CAST.you} size={32} />
                                <b>{t('suggestedPlan.paymentTwo')}</b>
                                <Doodle name="iconarrowright" size={25} weight={2.2} />
                                <LandingPersona persona={LANDING_CAST.jules} size={32} />
                            </p>
                        </div>
                    </Link>
                </motion.div>
            </motion.section>

            <motion.ul
                className="landing-proof-rail"
                data-motion-surface
                aria-label={t('suggestedPlan.planLabel')}
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.7 }}
            >
                <motion.li variants={riseVariants} data-motion-surface>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.roomCreated')}
                </motion.li>
                <motion.li variants={riseVariants} data-motion-surface>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.linkShared')}
                </motion.li>
                <motion.li variants={riseVariants} data-motion-surface>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.friendJoined')}
                </motion.li>
                <motion.li variants={riseVariants} data-motion-surface>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.roomEven')}
                </motion.li>
            </motion.ul>

            <motion.section
                data-testid="room-examples"
                data-motion-surface
                className="landing-room-examples"
                variants={sceneVariants}
                initial={motionAllowed ? 'hidden' : false}
                animate={motionAllowed ? undefined : 'shown'}
                whileInView={motionAllowed ? 'shown' : undefined}
                viewport={{ once: true, amount: 0.2 }}
            >
                <motion.div className="landing-room-examples-heading" variants={riseVariants} data-motion-surface>
                    <div className="landing-room-examples-copy">
                        <h2>{t('examples.title')}</h2>
                        <span>{t('examples.body')}</span>
                    </div>
                </motion.div>
                <motion.ul variants={sceneVariants} data-motion-surface>
                    {examples.map((example) => (
                        <motion.li key={example.name} variants={popVariants} data-motion-surface>
                            <Link
                                href="/app"
                                aria-label={`${tFooter('createSplit')}: ${example.name}: ${example.meta}`}
                                data-testid="room-example-link"
                                className="landing-room-example-link"
                            >
                                <LandingPersona persona={example.persona} size={46} />
                                <span>
                                    <b>{example.name}</b>
                                    <small>{example.meta}</small>
                                </span>
                            </Link>
                        </motion.li>
                    ))}
                </motion.ul>
            </motion.section>
        </div>
    )
}

export default LandingProof
