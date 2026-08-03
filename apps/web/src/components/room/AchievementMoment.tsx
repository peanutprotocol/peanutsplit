'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Doodle } from '@/components/ui/Doodle'
import type { AwardId } from '@/lib/achievements-contract'
import { claimSessionPrompt, markSeen, readSeen } from '@/lib/achievement-storage'
import { unlocksFor, type Unlock } from '@/lib/achievements'
import { achievementProps, track } from '@/lib/analytics'
import type { RoomState } from '@/lib/api-types'
import { currencyDoodle } from '@/lib/currency-doodle'
import { savedExpenses } from '@/lib/pending'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { CardShareButton } from './CardShareButton'
import { Confetti } from './Confetti'
import { MemberAvatar } from './MemberAvatar'

/**
 * The one-shot in-room celebration.
 *
 * Drawn in HTML rather than as the PNG on purpose: a moment has to be instant and animated, and
 * the shelf is where exactness with the shared artefact matters.
 *
 * Two throttles, and both are load-bearing. The durable seen-set means a rung never celebrates
 * twice on this device; the session claim means a room that unlocks two things in one sitting
 * interrupts once and lets the other land quietly on the shelf. An unlock that loses the session
 * claim is deliberately NOT marked seen — it is still owed a moment, just not now.
 *
 * Sound and haptics fire on the Share tap only, never on appearance. That differs from
 * `AllSettled`, which rings a bell on arrival; that one is the terminal moment of the whole
 * product, and an achievement is not.
 */
export function AchievementMoment({
    slug,
    state,
    meId,
    onInvite,
}: {
    slug: string
    state: RoomState
    meId: string | undefined
    /** CREW's call to action drives the existing invite flow rather than inventing a second one. */
    onInvite: () => void
}) {
    const t = useTranslations('room.achievements')
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const [shown, setShown] = useState<Unlock | null>(null)
    const [dismissed, setDismissed] = useState(false)
    const claimed = useRef(false)

    const unlocks = useMemo(() => unlocksFor(state, meId), [state, meId])

    useEffect(() => {
        if (claimed.current) return
        const seen = readSeen(slug)
        // WRAPPED has no moment: its surface is the deck on the recap page, and the all-settled
        // celebration is already the moment for that event.
        const fresh = unlocks.find((unlock) => unlock.type !== 'wrapped' && !seen.has(unlock.id))
        if (!fresh) return
        if (!claimSessionPrompt(slug)) return
        claimed.current = true
        markSeen(slug, fresh.covers)
        track('achievement_seen', achievementProps(fresh.type))
        setShown(fresh)
    }, [slug, unlocks])

    const dismiss = useCallback(() => {
        feedback('tick')
        setDismissed(true)
    }, [feedback])

    if (!shown || dismissed) return null

    return (
        <motion.div
            initial={motionAllowed ? { opacity: 0, y: 12, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={motionAllowed ? { type: 'spring', stiffness: 320, damping: 26 } : { duration: 0 }}
            data-motion-surface
            data-testid="achievement-moment"
            data-achievement={shown.id}
            className="relative mx-4 flex flex-col gap-4 overflow-hidden rounded-sm border border-n-1 bg-white p-4 shadow-[6px_6px_0_#211C17]"
        >
            {/* Returns null on its own under reduced motion — no second branch needed here. */}
            {shown.type !== 'alterego' && <Confetti />}

            <div className="relative flex flex-col gap-3">
                <Subject unlock={shown} state={state} meId={meId} t={t} />
                <div className="flex flex-col gap-1">
                    <p className="text-h6">
                        {shown.type === 'crew' || shown.type === 'passport'
                            ? t(`${shown.type}.title`, { count: shown.detail.count ?? 0 })
                            : t('alterego.title')}
                    </p>
                    <p className="text-sm text-grey-1">{t(`${shown.type}.body`)}</p>
                </div>
            </div>

            <div className="relative flex flex-col gap-2">
                {shown.type === 'crew' ? (
                    <Button
                        variant="primary"
                        shadowSize="4"
                        icon="share"
                        className="justify-center"
                        onClick={onInvite}
                        data-testid="achievement-invite"
                    >
                        {t('crew.invite')}
                    </Button>
                ) : null}
                <CardShareButton
                    slug={slug}
                    kind={shown.type === 'crew' ? 'crew' : shown.type === 'passport' ? 'passport' : 'alterego'}
                    type={shown.type}
                    params={
                        shown.type === 'alterego' && shown.detail.award && shown.detail.persona
                            ? {
                                  award: shown.detail.award,
                                  persona: shown.detail.persona,
                                  palette: shown.detail.palette,
                              }
                            : undefined
                    }
                    variant={shown.type === 'crew' ? 'stroke' : 'primary'}
                />
                <button
                    type="button"
                    onClick={dismiss}
                    data-testid="achievement-dismiss"
                    className="min-h-11 text-sm font-bold text-grey-1 underline"
                >
                    {t('dismiss')}
                </button>
            </div>
        </motion.div>
    )
}

/** The drawn half. Never a name, never an amount — the same rule the cards obey. */
function Subject({
    unlock,
    state,
    meId,
    t,
}: {
    unlock: Unlock
    state: RoomState
    meId: string | undefined
    t: (key: string) => string
}) {
    if (unlock.type === 'crew') {
        const lineup = state.members.slice(0, 8)
        const overflow = state.members.length - lineup.length
        return (
            <div className="flex items-center" data-testid="achievement-lineup">
                {lineup.map((member) => (
                    <MemberAvatar
                        key={member.id}
                        name={member.name}
                        avatar={member.avatar}
                        palette={member.avatarPalette}
                        size={40}
                        className="-mr-2"
                    />
                ))}
                {overflow > 0 && (
                    <span className="-mr-2 flex size-10 items-center justify-center rounded-full border border-n-1 bg-grey-3 text-h10">
                        {`+${overflow}`}
                    </span>
                )}
            </div>
        )
    }

    if (unlock.type === 'passport') {
        // Distinct codes, max six, in first-seen order — the same set the card stamps.
        const codes = [...new Set(savedExpenses(state.expenses).map((expense) => expense.currency))].slice(0, 6)
        return (
            <div className="flex flex-wrap gap-2" data-testid="achievement-stamps">
                {codes.map((code) => (
                    <span
                        key={code}
                        className="flex items-center gap-1 rounded-sm border-2 border-n-1 px-2 py-1 text-h10"
                    >
                        {/* Every code has a drawing: its sign, its family's mark, a banknote, or
                            the shrug for an invented ticker. */}
                        <Doodle name={currencyDoodle(code)} size={14} weight={2.4} aria-hidden />
                        {code}
                    </span>
                ))}
            </div>
        )
    }

    const me = state.members.find((member) => member.id === meId)
    return (
        <div className="flex items-center gap-3" data-testid="achievement-award">
            <MemberAvatar name={me?.name ?? ''} avatar={me?.avatar} palette={me?.avatarPalette} size={56} />
            <p className="text-h5">{t(`award.${unlock.detail.award as AwardId}`)}</p>
        </div>
    )
}
