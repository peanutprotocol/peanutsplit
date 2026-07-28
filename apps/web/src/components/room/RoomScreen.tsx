'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { isApiError } from '@/lib/api'
import { roomProps, track } from '@/lib/analytics'
import type { MemberIdentity } from '@/lib/identity'
import { useCurrencies, useRoomState } from '@/lib/queries'
import { rememberRoom } from '@/lib/recent-rooms'
import { useRoomParams } from '@/lib/room-params'
import { themeVars } from '@/lib/themes'
import { useRoomIdentity } from '@/lib/use-identity'
import { AllSettled } from './AllSettled'
import { BalanceDrawer } from './BalanceDrawer'
import { BalanceStrip } from './BalanceStrip'
import { ExpenseDrawer } from './ExpenseDrawer'
import { ExpenseList } from './ExpenseList'
import { JoinGate } from './JoinGate'
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
    const { data: state, error, isPending, refetch } = useRoomState(slug)
    const { data: currencies } = useCurrencies()
    const { identity, loaded, claim, forget } = useRoomIdentity(slug)
    const [params, setParams] = useRoomParams()
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
        rememberRoom({ slug, name: state.room.name, emoji: state.room.emoji ?? undefined })
    }, [slug, state])

    const settledUp = !!state && state.expenses.length > 0 && state.suggestedTransfers.length === 0

    // Nothing is celebrated behind a sheet: the settle drawer dims the room to
    // 20% and the burst would be spent before anyone saw it.
    const drawerOpen = params.add || params.settle || params.share || !!params.expense || !!params.balance

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

    if (isApiError(error, 'NOT_FOUND')) return <RoomNotFound />
    if (error && !state) return <RoomErrorState onRetry={() => void refetch()} />

    const closeDrawers = () => setParams({ add: null, expense: null, settle: null })
    const needsJoin = loaded && !identity && !!state

    const onJoined = (next: MemberIdentity) => claim(next)

    const meId =
        identity && state?.members.some((member) => member.id === identity.memberId) ? identity.memberId : undefined
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
                    identity={identity}
                    onShare={() => setParams({ share: true })}
                    onForgetIdentity={forget}
                />
            )}

            <div className="flex flex-1 flex-col gap-6 pb-36 pt-4">
                {/* Skeleton → content is a crossfade, not a cut: the shapes are
                    already in the right place, so anything harder reads as a flash. */}
                <AnimatePresence mode="wait" initial={false}>
                    {isPending && !state ? (
                        <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                            <RoomSkeleton />
                        </motion.div>
                    ) : state ? (
                        <motion.div
                            key="content"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.24, ease: 'easeOut' }}
                            className="flex flex-col gap-6"
                        >
                            <BalanceStrip
                                state={state}
                                currencies={currencies}
                                meId={meId}
                                onSelect={(memberId) => setParams({ balance: memberId })}
                            />
                            <AnimatePresence initial={false}>
                                {settledUp && (
                                    <AllSettled
                                        key="all-settled"
                                        celebrate={celebrate}
                                        summary={{
                                            people: state.members.length,
                                            expenses: state.expenses.length,
                                        }}
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
                        open={(params.add || !!editing) && !needsJoin}
                        onClose={closeDrawers}
                        slug={slug}
                        state={state}
                        currencies={currencies}
                        token={identity?.token}
                        expense={editing}
                        defaultPaidById={defaultPaidById}
                    />
                    <SettleDrawer
                        open={params.settle && !needsJoin}
                        onClose={closeDrawers}
                        slug={slug}
                        state={state}
                        currencies={currencies}
                        token={identity?.token}
                    />
                    <ShareDrawer open={params.share} onClose={() => setParams({ share: null })} room={state.room} />
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
