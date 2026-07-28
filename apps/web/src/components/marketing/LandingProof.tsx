import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'

/**
 * Three large product truths replace the old run of interchangeable feature cards.
 *
 * These are verified, illustrative fixtures: no room queries, no fabricated live activity and
 * no controls pretending to write data. They make the trust model visible before the detailed
 * FAQ takes over lower on the page.
 */
export function LandingProof() {
    const t = useTranslations('marketing.proof')
    const examples: Array<{ doodle: DoodleName; name: string; meta: string }> = [
        { doodle: 'train', name: t('examples.lisbon.name'), meta: t('examples.lisbon.meta') },
        { doodle: 'house', name: t('examples.flat.name'), meta: t('examples.flat.meta') },
        { doodle: 'noodles', name: t('examples.dinner.name'), meta: t('examples.dinner.meta') },
        { doodle: 'globe', name: t('examples.retreat.name'), meta: t('examples.retreat.meta') },
    ]

    return (
        <div className="landing-proof">
            <section data-testid="proof-link-identity" className="landing-proof-scene landing-proof-scene-link">
                <div className="landing-proof-copy">
                    <p>{t('linkIdentity.eyebrow')}</p>
                    <h2>{t('linkIdentity.title')}</h2>
                    <span>{t('linkIdentity.body')}</span>
                </div>

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
            </section>

            <section data-testid="proof-everyone-adds" className="landing-proof-scene landing-proof-scene-expenses">
                <div className="landing-proof-copy">
                    <p>{t('everyoneAdds.eyebrow')}</p>
                    <h2>{t('everyoneAdds.title')}</h2>
                    <span>{t('everyoneAdds.body')}</span>
                </div>

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
            </section>

            <section data-testid="proof-suggested-plan" className="landing-proof-scene landing-proof-scene-plan">
                <div className="landing-proof-copy">
                    <p>{t('suggestedPlan.eyebrow')}</p>
                    <h2>{t('suggestedPlan.title')}</h2>
                    <span>{t('suggestedPlan.body')}</span>
                </div>

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
            </section>

            <ul className="landing-proof-rail" aria-label={t('suggestedPlan.planLabel')}>
                <li>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.roomCreated')}
                </li>
                <li>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.linkShared')}
                </li>
                <li>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.friendJoined')}
                </li>
                <li>
                    <Doodle name="iconsparkles" size={15} weight={1.8} />
                    {t('rail.roomEven')}
                </li>
            </ul>

            <section data-testid="room-examples" className="landing-room-examples">
                <div className="landing-room-examples-heading">
                    <p>{t('examples.eyebrow')}</p>
                    <h2>{t('examples.title')}</h2>
                </div>
                <ul>
                    {examples.map((example) => (
                        <li key={example.name}>
                            <Doodle name={example.doodle} size={38} weight={1.6} />
                            <span>
                                <b>{example.name}</b>
                                <small>{example.meta}</small>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    )
}

export default LandingProof
