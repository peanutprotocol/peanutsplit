'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Doodle } from '@/components/ui/Doodle'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { isApiError } from '@/lib/api'
import { roomProps, track } from '@/lib/analytics'
import type { MemberIdentity } from '@/lib/identity'
import { isRoomSettled, savedExpenses } from '@/lib/pending'
import { useCurrencies, useRoomState } from '@/lib/queries'
import { rememberRoom } from '@/lib/recent-rooms'
import { roomEmblemDoodle } from '@/lib/room-emblem'
import { useRoomParams } from '@/lib/room-params'
import { daySpan } from '@/lib/story'
import { themeVars } from '@/lib/themes'
import { useRoomIdentity } from '@/lib/use-identity'
import { useMotionAllowed } from '@/lib/use-motion'
import { AllSettled } from './AllSettled'
import { BalanceDrawer } from './BalanceDrawer'
import { BalanceStrip } from './BalanceStrip'
import { ExpenseDrawer } from './ExpenseDrawer'
import { ExpenseList } from './ExpenseList'
import { JoinGate } from './JoinGate'
import { LatecomerBanner } from './LatecomerBanner'
import { RoomErrorState, RoomNotFound, RoomSkeleton } from './RoomStates'
import { RoomHeader } from './RoomHeader'
import { SettleDrawer } from './SettleDrawer'
import { ShareDrawer } from './ShareDrawer'

/**
 * THE room. One client component owning the whole screen: the join gate, the
 * live state, and the four URL-driven drawers.
 *
 * Everything money-shaped comes straight from the server's RoomState — this file
 * never derives a balance.
 */
export function RoomScreen({ slug }: { slug: string }) {
    const t = useTranslations('room.actions')
    const tStates = useTranslations('room.states')
    const { data: state, error, isPending, isFetching, isRefetchError, refetch } = useRoomState(slug)
    const { data: currencies } = useCurrencies()
    const { identity, loaded, claim, forget } = useRoomIdentity(slug)
    const [params, setParams] = useRoomParams()
    const motionAllowed = useMotionAllowed()
    const celebrated = useRef(false)
    /**
     * Moment #6 fires once per *arrival* at zero, not on every render of a
     * settled room: walking back into a room that was already settled last week
     * should not throw confetti at you.
     */
    const [celebrate, setCelebrate] = useState(false)
    const sawUnsettled = useRef(false)

    useEffect(() => {
        if (!state) return
        rememberRoom({
            slug,
            name: state.room.name,
            emoji: state.room.emoji ?? undefined,
            theme: state.room.theme ?? undefined,
        })
    }, [slug, state])

    /**
     * `state` is the MERGED state — `useRoomState` prepends a row for anything
     * still queued on this device — while `suggestedTransfers` is server truth.
     * Counting the merged list against it made a brand-new room with one unsent
     * expense claim it was all settled: confetti, the bell, the `all_settled`
     * event and a share card reading "€0.00 · 0 expenses". So the count comes
     * from the rows the server actually has.
     */
    const saved = useMemo(() => (state ? savedExpenses(state.expenses) : []), [state])
    const settledUp = isRoomSettled(state)

    // Nothing is celebrated behind a sheet: the settle drawer dims the room to
    // 20% and the burst would be spent before anyone saw it.
    const drawerOpen = params.add || params.settle || params.share || !!params.expense || !!params.balance
    const needsJoin = loaded && !identity && !!state
    const staleState = !!state && isRefetchError

    useEffect(() => {
        if (!state) return
        if (!settledUp) {
            sawUnsettled.current = true
            setCelebrate(false)
        } else if (sawUnsettled.current && !drawerOpen) {
            sawUnsettled.current = false
            setCelebrate(true)
        }
    }, [settledUp, state, drawerOpen])

    useEffect(() => {
        if (settledUp && !celebrated.current) {
            celebrated.current = true
            track('all_settled', roomProps(slug))
        }
        if (!settledUp) celebrated.current = false
    }, [settledUp, slug])

    const editing = useMemo(
        () => (params.expense ? (state?.expenses.find((expense) => expense.id === params.expense) ?? null) : null),
        [params.expense, state]
    )

    // A selected expense that vanished (deleted on another device) must not leave
    // an empty drawer hanging around.
    useEffect(() => {
        if (params.expense && state && !editing) setParams({ expense: null })
    }, [params.expense, state, editing, setParams])

    // Same for a balance sheet whose member is not on the roster — a link shared from
    // another room, or a stale param.
    useEffect(() => {
        if (params.balance && state && !state.members.some((member) => member.id === params.balance))
            setParams({ balance: null })
    }, [params.balance, state, setParams])

    useEffect(() => {
        if (staleState && (params.settle || params.expense)) setParams({ settle: null, expense: null })
    }, [params.expense, params.settle, setParams, staleState])

    if (isApiError(error, 'NOT_FOUND')) return <RoomNotFound />
    if (error && !state) return <RoomErrorState onRetry={() => void refetch()} />

    const closeDrawers = () => setParams({ add: null, expense: null, settle: null })

    const onJoined = (next: MemberIdentity) => claim(next)

    // The roster row for whoever is holding the phone, resolved once: the header
    // needs the whole row (its avatar), everything else needs only the id.
    const me = (identity && state?.members.find((member) => member.id === identity.memberId)) || null
    const meId = me?.id
    const defaultPaidById = meId ?? state?.members[0]?.id ?? ''

    return (
        // The theme is a handful of CSS variables on the room container, not a
        // class swap: every themed surface reads a `var(--split-theme-*, <the
        // literal it used to have>)`, so an unthemed room renders byte-identical
        // and a surface nobody has themed yet keeps working untouched.
        <main
            style={themeVars(state?.room.theme) as React.CSSProperties}
            data-theme={state?.room.theme ?? 'classic'}
            className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-background"
        >
            {state && (
                <RoomHeader
                    room={state.room}
                    members={state.members}
                    state={state}
                    identity={identity}
                    me={me}
                    onShare={() => setParams({ share: true })}
                    onForgetIdentity={forget}
                />
            )}

            {staleState && (
                <div
                    role="alert"
                    data-testid="room-stale-warning"
                    className="mx-4 mt-4 flex items-start gap-3 rounded-sm border border-n-1 bg-yellow-1 p-4"
                >
                    <Doodle name="pulse" size={28} weight={1.8} className="mt-0.5 shrink-0" aria-hidden />
                    <div id="room-stale-warning-copy" className="min-w-0 flex-1">
                        <p className="text-h7">{tStates('staleTitle')}</p>
                        <p className="mt-1 text-sm text-grey-1">{tStates('staleBody')}</p>
                    </div>
                    <Button
                        variant="stroke"
                        size="small"
                        disabled={isFetching}
                        loading={isFetching}
                        onClick={() => void refetch()}
                    >
                        {tStates('retry')}
                    </Button>
                </div>
            )}

            <div className="flex flex-1 flex-col gap-6 pb-36 pt-4">
                {/* Skeleton → content is a crossfade, not a cut: the shapes are
                    already in the right place, so anything harder reads as a flash. */}
                <AnimatePresence mode="wait" initial={false}>
                    {isPending && !state ? (
                        <motion.div
                            key="skeleton"
                            exit={motionAllowed ? { opacity: 0 } : undefined}
                            transition={motionAllowed ? { duration: 0.18 } : { duration: 0 }}
                            data-motion-surface
                        >
                            <RoomSkeleton />
                        </motion.div>
                    ) : state ? (
                        <motion.div
                            key="content"
                            initial={motionAllowed ? { opacity: 0 } : false}
                            animate={{ opacity: 1 }}
                            transition={motionAllowed ? { duration: 0.24, ease: 'easeOut' } : { duration: 0 }}
                            data-motion-surface
                            className="flex flex-col gap-6"
                        >
                            <BalanceStrip
                                state={state}
                                currencies={currencies}
                                meId={meId}
                                onSelect={(memberId) => setParams({ balance: memberId })}
                            />
                            {/* Above the history, below the balances: it is a
                                statement about the numbers on the strip, and the
                                fix it offers rewrites the rows underneath it. */}
                            {!needsJoin && !staleState && (
                                <LatecomerBanner slug={slug} state={state} token={identity?.token} />
                            )}
                            <AnimatePresence initial={false}>
                                {settledUp && (
                                    <AllSettled
                                        key="all-settled"
                                        celebrate={celebrate}
                                        slug={slug}
                                        summary={{
                                            people: state.members.length,
                                            expenses: saved.length,
                                            days: daySpan(saved.map((expense) => new Date(expense.date))),
                                        }}
                                        emblem={roomEmblemDoodle(state.room.emoji, state.room.name)}
                                    />
                                )}
                            </AnimatePresence>
                            <ExpenseList
                                state={state}
                                currencies={currencies}
                                meId={meId}
                                slug={slug}
                                token={identity?.token}
                                onSelect={(expenseId) => setParams({ expense: expenseId })}
                                onInvite={() => setParams({ share: true })}
                                savedActionsDisabled={staleState}
                            />
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>

            {state && !needsJoin && (
                <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-xl border-t border-n-1 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
                    <div className="flex gap-3">
                        <Button
                            variant="stroke"
                            icon="hand-coins"
                            className="w-auto shrink-0 justify-center px-4"
                            onClick={() => setParams({ settle: true })}
                            disabled={staleState}
                            data-testid="open-settle"
                        >
                            {t('settleUp')}
                        </Button>
                        <Button
                            variant="primary"
                            shadowSize="4"
                            icon="plus"
                            className="flex-1 justify-center text-h6"
                            onClick={() => setParams({ add: true })}
                            data-testid="open-add-expense"
                        >
                            {t('addExpense')}
                        </Button>
                    </div>
                </div>
            )}

            {state && needsJoin && <JoinGate slug={slug} state={state} onJoined={onJoined} />}

            {state && (
                <>
                    <ExpenseDrawer
                        open={(params.add || (!!editing && !staleState)) && !needsJoin}
                        onClose={closeDrawers}
                        slug={slug}
                        state={state}
                        currencies={currencies}
                        token={identity?.token}
                        expense={editing}
                        defaultPaidById={defaultPaidById}
                    />
                    <SettleDrawer
                        open={params.settle && !needsJoin && !staleState}
                        onClose={closeDrawers}
                        slug={slug}
                        state={state}
                        currencies={currencies}
                        token={identity?.token}
                    />
                    <ShareDrawer
                        open={params.share}
                        onClose={() => setParams({ share: null })}
                        room={state.room}
                        members={state.members}
                    />
                    <BalanceDrawer
                        open={!!params.balance && !needsJoin}
                        onClose={() => setParams({ balance: null })}
                        state={state}
                        currencies={currencies}
                        memberId={params.balance}
                        meId={meId}
                    />
                </>
            )}

            {/* Install prompt lives on the room, not the landing page: you only pin
                something you are already using. */}
            {state && !needsJoin && (
                <InstallPrompt
                    onShown={() => track('pwa_prompt_shown', roomProps(slug))}
                    onInstalled={() => track('pwa_installed', roomProps(slug))}
                />
            )}
        </main>
    )
}
