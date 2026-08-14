'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { motion, type Variants } from 'motion/react'
import { Doodle } from '@/components/ui/Doodle'
import { useMotionAllowed } from '@/lib/use-motion'
import { SLUG_TAIL_HINT } from '@/lib/slugify'
import { LANDING_CAST, LandingPersona } from './LandingPersona'
import { LandingMarquee } from './LandingMarquee'
import { popVariants, riseSoftVariants, riseVariants, sceneKey, sceneProps, sceneVariants, useSceneArm } from './motion'

/** The example cards are a list of names, not an argument — they cascade faster than a full scene. */
const exampleListVariants: Variants = {
    hidden: { opacity: 0 },
    shown: { opacity: 1, transition: { duration: 0.2, staggerChildren: 0.05 } },
}

/**
 * Three large product truths replace the old run of interchangeable feature cards.
 *
 * These are verified, illustrative fixtures: no room queries, no fabricated live activity and
 * no controls pretending to write data. They make the trust model visible before the detailed
 * FAQ takes over lower on the page.
 *
 * Each scene reveals as a scene, not as a screenshot: the copy splits into headline and body,
 * and the card next to it fills piece by piece — the ticket, then the people, then the rows.
 * Nested `sceneVariants` containers carry the stagger down; leaves pick `rise`, `riseSoft` or
 * `pop` from the shared vocabulary in `./motion`.
 */
export function LandingProof() {
    const t = useTranslations('marketing.proof')
    const tFooter = useTranslations('marketing.footer')
    const motionAllowed = useMotionAllowed()
    const linkScene = useSceneArm<HTMLElement>(motionAllowed)
    const expensesScene = useSceneArm<HTMLElement>(motionAllowed)
    const planScene = useSceneArm<HTMLElement>(motionAllowed)
    const roomsScene = useSceneArm<HTMLElement>(motionAllowed)
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
                ref={linkScene.ref}
                className="landing-proof-scene landing-proof-scene-link"
                key={sceneKey('proof-link', linkScene.armed)}
                {...sceneProps(linkScene.armed)}
            >
                <motion.div className="landing-proof-copy" variants={sceneVariants} data-motion-surface>
                    <motion.h2 variants={riseVariants} data-motion-surface>
                        {t('linkIdentity.title')}
                    </motion.h2>
                    <motion.span variants={riseSoftVariants} data-motion-surface>
                        {t('linkIdentity.body')}
                    </motion.span>
                </motion.div>

                <motion.div className="landing-proof-visual" variants={sceneVariants} data-motion-surface>
                    <Link
                        href="/new"
                        aria-label={`${tFooter('createSplit')}: ${t('linkIdentity.title')}`}
                        data-testid="proof-link-identity-link"
                        className="landing-proof-object-link landing-proof-object-link-identity"
                    >
                        <div className="landing-proof-link-card" aria-hidden="true">
                            <motion.div
                                className="landing-proof-ticket"
                                variants={riseSoftVariants}
                                data-motion-surface
                            >
                                <Doodle name="link" size={34} weight={1.7} />
                                <span>
                                    <small>{t('linkIdentity.linkLabel')}</small>
                                    <b>peanutsplit.com/r/lisbon-weekend{SLUG_TAIL_HINT}</b>
                                </span>
                            </motion.div>
                            <div className="landing-proof-identity">
                                <small>{t('linkIdentity.identityLabel')}</small>
                                <ul>
                                    <motion.li variants={popVariants} data-motion-surface>
                                        <LandingPersona persona={LANDING_CAST.you} size={32} />
                                        {t('linkIdentity.you')}
                                    </motion.li>
                                    <motion.li variants={popVariants} data-motion-surface>
                                        <LandingPersona persona={LANDING_CAST.bea} size={32} />
                                        {t('linkIdentity.friendOne')}
                                    </motion.li>
                                    <motion.li variants={popVariants} data-motion-surface>
                                        <LandingPersona persona={LANDING_CAST.jules} size={32} />
                                        {t('linkIdentity.friendTwo')}
                                    </motion.li>
                                </ul>
                            </div>
                        </div>
                    </Link>
                </motion.div>
            </motion.section>

            <motion.section
                data-testid="proof-everyone-adds"
                data-motion-surface
                ref={expensesScene.ref}
                className="landing-proof-scene landing-proof-scene-expenses"
                key={sceneKey('proof-expenses', expensesScene.armed)}
                {...sceneProps(expensesScene.armed)}
            >
                <motion.div className="landing-proof-copy" variants={sceneVariants} data-motion-surface>
                    <motion.h2 variants={riseVariants} data-motion-surface>
                        {t('everyoneAdds.title')}
                    </motion.h2>
                    <motion.span variants={riseSoftVariants} data-motion-surface>
                        {t('everyoneAdds.body')}
                    </motion.span>
                </motion.div>

                <motion.div className="landing-proof-visual" variants={sceneVariants} data-motion-surface>
                    <Link
                        href="/new"
                        aria-label={`${tFooter('createSplit')}: ${t('everyoneAdds.title')}`}
                        data-testid="proof-everyone-adds-link"
                        className="landing-proof-object-link landing-proof-object-link-expenses"
                    >
                        <ul className="landing-proof-expenses" aria-hidden="true">
                            {/* Each row fades and staggers its own contents rather than rising: the scattered
                                resting tilt is a CSS `rotate` per row, and an animated transform would erase it.
                                Same reason these rows carry no `data-motion-surface` — its `transform: none`. */}
                            <motion.li variants={sceneVariants}>
                                <LandingPersona persona={LANDING_CAST.bea} size={42} />
                                <motion.span variants={riseSoftVariants} data-motion-surface>
                                    <b>{t('everyoneAdds.expenseOne')}</b>
                                    <small>{t('everyoneAdds.expenseOneMeta')}</small>
                                </motion.span>
                            </motion.li>
                            <motion.li variants={sceneVariants}>
                                <LandingPersona persona={LANDING_CAST.jules} size={42} />
                                <motion.span variants={riseSoftVariants} data-motion-surface>
                                    <b>{t('everyoneAdds.expenseTwo')}</b>
                                    <small>{t('everyoneAdds.expenseTwoMeta')}</small>
                                </motion.span>
                            </motion.li>
                            <motion.li variants={sceneVariants}>
                                <LandingPersona persona={LANDING_CAST.ana} size={42} />
                                <motion.span variants={riseSoftVariants} data-motion-surface>
                                    <b>{t('everyoneAdds.expenseThree')}</b>
                                    <small>{t('everyoneAdds.expenseThreeMeta')}</small>
                                </motion.span>
                            </motion.li>
                        </ul>
                    </Link>
                </motion.div>
            </motion.section>

            <motion.section
                data-testid="proof-suggested-plan"
                data-motion-surface
                ref={planScene.ref}
                className="landing-proof-scene landing-proof-scene-plan"
                key={sceneKey('proof-plan', planScene.armed)}
                {...sceneProps(planScene.armed)}
            >
                <motion.div className="landing-proof-copy" variants={sceneVariants} data-motion-surface>
                    <motion.h2 variants={riseVariants} data-motion-surface>
                        {t('suggestedPlan.title')}
                    </motion.h2>
                    <motion.span variants={riseSoftVariants} data-motion-surface>
                        {t('suggestedPlan.body')}
                    </motion.span>
                </motion.div>

                <motion.div className="landing-proof-visual" variants={sceneVariants} data-motion-surface>
                    <Link
                        href="/new"
                        aria-label={`${tFooter('createSplit')}: ${t('suggestedPlan.title')}`}
                        data-testid="proof-suggested-plan-link"
                        className="landing-proof-object-link landing-proof-object-link-plan"
                    >
                        <div className="landing-proof-plan" aria-hidden="true">
                            <motion.span variants={riseSoftVariants} data-motion-surface>
                                {t('suggestedPlan.planLabel')}
                            </motion.span>
                            <motion.p variants={popVariants} data-motion-surface>
                                <LandingPersona persona={LANDING_CAST.you} size={32} />
                                <b>{t('suggestedPlan.paymentOne')}</b>
                                <Doodle name="iconarrowright" size={25} weight={2.2} />
                                <LandingPersona persona={LANDING_CAST.bea} size={32} />
                            </motion.p>
                            <motion.p variants={popVariants} data-motion-surface>
                                <LandingPersona persona={LANDING_CAST.you} size={32} />
                                <b>{t('suggestedPlan.paymentTwo')}</b>
                                <Doodle name="iconarrowright" size={25} weight={2.2} />
                                <LandingPersona persona={LANDING_CAST.jules} size={32} />
                            </motion.p>
                        </div>
                    </Link>
                </motion.div>
            </motion.section>

            <LandingMarquee />

            <motion.section
                data-testid="room-examples"
                data-motion-surface
                ref={roomsScene.ref}
                className="landing-room-examples"
                key={sceneKey('proof-rooms', roomsScene.armed)}
                {...sceneProps(roomsScene.armed, 0.2)}
            >
                <motion.div className="landing-room-examples-heading" variants={sceneVariants} data-motion-surface>
                    <div className="landing-room-examples-copy">
                        <motion.h2 variants={riseVariants} data-motion-surface>
                            {t('examples.title')}
                        </motion.h2>
                        <motion.span variants={riseSoftVariants} data-motion-surface>
                            {t('examples.body')}
                        </motion.span>
                    </div>
                </motion.div>
                <motion.ul variants={exampleListVariants} data-motion-surface>
                    {examples.map((example) => (
                        <motion.li key={example.name} variants={riseSoftVariants} data-motion-surface>
                            <Link
                                href="/new"
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
