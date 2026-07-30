'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { BTN_MEDIUM } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import { roomProps, track } from '@/lib/analytics'
import type { RoomState } from '@/lib/api-types'
import { useErrorMessage } from '@/lib/error-messages'
import { dismiss, dismissedMemberIds, latecomerOffer, runBackfill, type LatecomerOffer } from '@/lib/latecomer'
import { roomKey, useUpdateExpense } from '@/lib/queries'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { MemberAvatar } from './MemberAvatar'

interface LatecomerBannerProps {
    slug: string
    state: RoomState
    token?: string | null
}

/**
 * "Dani wasn't in the four dinners before they joined — add them?"
 *
 * Offered to anybody in the room, not only to the person who arrived: the people
 * who can actually answer the question are the ones who were already there.
 * Dismissing is per device, and the offer still comes back for the NEXT
 * latecomer, because that is a different question about a different person.
 *
 * The repair runs one expense at a time rather than as a batch, and none of the
 * three reasons is caution for its own sake. Each PATCH returns the whole room,
 * so the balances count along with the progress. A failure halfway leaves the
 * rows it already fixed fixed, because every PATCH is complete on its own. And
 * eligibility re-derives from the room, so pressing the button again resumes
 * from wherever it stopped and cannot add anybody twice.
 *
 * The loop itself lives in `runBackfill`, which re-reads the query cache before
 * every write so a concurrent edit is skipped rather than reverted.
 */
export function LatecomerBanner({ slug, state, token }: LatecomerBannerProps) {
    const t = useTranslations('room.latecomer')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const queryClient = useQueryClient()
    const updateExpense = useUpdateExpense(slug, token)

    /**
     * Read once, then held in state: `localStorage` is not reactive, so reading
     * it during render would make the banner's visibility depend on when React
     * happened to re-run this function rather than on what somebody tapped.
     */
    const [dismissed, setDismissed] = useState<string[]>(() => dismissedMemberIds(slug))
    /**
     * The offer as it was when the button was pressed. Pinned for the duration of
     * the run because the live one moves under it — each PATCH shrinks the
     * remaining list and, in a room with two latecomers, the offer would switch
     * to the other person halfway through, changing the name above a progress
     * count that is still finishing the first one.
     */
    const [running, setRunning] = useState<LatecomerOffer | null>(null)
    const [done, setDone] = useState(0)
    const [error, setError] = useState<string | null>(null)
    /** Flipped by "stop"; read between PATCHes, which is the only point in the
     *  run where the room is in a state worth leaving behind. */
    const abandoned = useRef(false)
    const offeredFor = useRef<string | null>(null)

    // A stale-room transition removes this banner. Treat that exactly like the
    // explicit stop button so a multi-expense repair cannot continue mutating
    // cached history after the refresh failure is known.
    useEffect(
        () => () => {
            abandoned.current = true
        },
        []
    )

    const live = latecomerOffer(state)
    const offer = running ?? (live && !dismissed.includes(live.member.id) ? live : null)

    useEffect(() => {
        if (!offer) return
        // Once per person, not once per render — the room polls every eight
        // seconds and this would otherwise become an event stream.
        if (offeredFor.current === offer.member.id) return
        offeredFor.current = offer.member.id
        track('latecomer_backfill_offered', roomProps(slug, { expenses: offer.expenses.length }))
    }, [offer, slug])

    if (!offer) return null

    const total = offer.expenses.length

    const run = async () => {
        setError(null)
        setRunning(offer)
        setDone(0)
        abandoned.current = false
        let fixed = 0
        try {
            await runBackfill({
                memberId: offer.member.id,
                expenseIds: offer.expenses.map((expense) => expense.id),
                // The cache, not `state`: the prop is the render this run started
                // from, and by the third PATCH it is three round trips old.
                read: () => queryClient.getQueryData<RoomState>(roomKey(slug)),
                patch: (id, input) => updateExpense.mutateAsync({ id, input }),
                onWrote: (done) => {
                    fixed = done
                    setDone(done)
                },
                stopped: () => abandoned.current,
            })
            if (fixed > 0 && !abandoned.current) feedback('pop')
        } catch (err) {
            feedback('error', { haptic: 'error' })
            setError(errorMessage(err, t('failed')))
        } finally {
            // Counts only, and the count is what actually landed — a run that was
            // stopped or that failed on row three did three, and saying four
            // would make the funnel a worse record than no funnel.
            track('latecomer_backfill_accepted', roomProps(slug, { expenses: fixed }))
            setRunning(null)
        }
    }

    return (
        <motion.section
            initial={motionAllowed ? { opacity: 0, y: -8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={motionAllowed ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }}
            data-motion-surface
            data-testid="latecomer-banner"
            className="mx-4 flex flex-col gap-3 rounded-sm border border-n-1 bg-primary-3 p-4"
        >
            <div className="flex items-center gap-3">
                <MemberAvatar name={offer.member.name} avatar={offer.member.avatar} size={32} />
                <p className="min-w-0 flex-1 text-h8">{t('title', { name: offer.member.name, count: total })}</p>
            </div>
            <p className="text-sm leading-5 text-n-1">{t('body', { name: offer.member.name })}</p>

            {error && (
                <p role="alert" className="text-sm font-bold text-error">
                    {error}
                </p>
            )}

            {running ? (
                <div className="flex items-center gap-3">
                    <span className="flex-1 text-sm tabular-nums text-n-1" data-testid="latecomer-progress">
                        {t('progress', { done, count: total })}
                    </span>
                    <Button
                        variant="stroke"
                        size="medium"
                        className={cn(BTN_MEDIUM, 'w-auto shrink-0 justify-center')}
                        onClick={() => {
                            abandoned.current = true
                        }}
                        data-testid="latecomer-stop"
                    >
                        {t('stop')}
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <Button
                        variant="primary"
                        shadowSize="4"
                        className="justify-center text-h6"
                        onClick={run}
                        data-testid="latecomer-confirm"
                    >
                        {t('confirm', { count: total })}
                    </Button>
                    <Button
                        variant="stroke"
                        className="justify-center"
                        onClick={() => {
                            dismiss(slug, offer.member.id)
                            setDismissed((previous) => [...previous, offer.member.id])
                        }}
                        data-testid="latecomer-dismiss"
                    >
                        {t('dismiss')}
                    </Button>
                </div>
            )}
        </motion.section>
    )
}
