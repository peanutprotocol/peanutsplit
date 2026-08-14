'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Doodle } from '@/components/ui/Doodle'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { isApiError, MEMBER_TOKEN_INVALID_EVENT } from '@/lib/api'
import { installMeasureProps, roomProps, track, trackFirstSharedBalance, type ShareSurface } from '@/lib/analytics'
import type { MemberIdentity } from '@/lib/identity'
import { isLatecomerReviewDismissed, latecomerReview } from '@/lib/latecomer'
import {
    clearMatureRoomReturnEvidence,
    deferRoomInstallAfterCompetingGuidance,
    deferredRoomInstallWaitMs,
    MATURE_ACTIVITY_HEARTBEAT_MS,
    noteMatureContribution,
    noteMatureRoomActivity,
    noteMatureRoomAway,
    noteMatureRoomVisit,
    noteRoomShareCompleted,
    promotedRoomInstallTrigger,
    readRoomInstallFunnel,
    type AutoInstallTrigger,
} from '@/lib/install-funnel'
import { useQueuedWrites } from '@/lib/offline-queue'
import { isPendingExpenseId, isRoomSettled, savedExpenses } from '@/lib/pending'
import { useCurrencies, useRoomState } from '@/lib/queries'
import { rememberRoom } from '@/lib/recent-rooms'
import { roomEmblemDoodle } from '@/lib/room-emblem'
import { resolveRoomGuidance } from '@/lib/room-guidance'
import { useRoomParams } from '@/lib/room-params'
import { prewarmRoomPreview } from '@/lib/room-preview'
import { activeMembers, isActiveMember } from '@/lib/members'
import { expenseSessionCanStart, expenseSessionShouldOpen } from '@/lib/expense-session'
import { discardSharedReceipt } from '@/lib/shared-receipt'
import { daySpan } from '@/lib/story'
import { themeVars } from '@/lib/themes'
import { useRoomIdentity } from '@/lib/use-identity'
import { useMotionAllowed } from '@/lib/use-motion'
import { AchievementMoment } from './AchievementMoment'
import { AllSettled } from './AllSettled'
import { BalanceDrawer } from './BalanceDrawer'
import { BalanceStrip } from './BalanceStrip'
import { ExpenseDrawer } from './ExpenseDrawer'
import { ExpenseList } from './ExpenseList'
import { JoinGate } from './JoinGate'
import { LatecomerBanner } from './LatecomerBanner'
import { RoomErrorState, RoomHeaderSkeleton, RoomNotFound, RoomSkeleton } from './RoomStates'
import { RoomHeader } from './RoomHeader'
import { RosterCheckpoint } from './RosterCheckpoint'
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
    const [displacedIdentity, setDisplacedIdentity] = useState<MemberIdentity | null>(null)
    const [params, setParams] = useRoomParams()
    const [shareSurface, setShareSurface] = useState<ShareSurface>(() =>
        params.share && params.shareMoment === 'post_aha' ? 'post_aha' : 'header'
    )
    const [postAhaLocationReady, setPostAhaLocationReady] = useState(
        () => params.share && params.shareMoment === 'post_aha'
    )
    const [installTrigger, setInstallTrigger] = useState<AutoInstallTrigger | null>(null)
    /** Null until this device's created-here marker has been read. */
    const [createdHere, setCreatedHere] = useState<boolean | null>(null)
    const [achievementOpen, setAchievementOpen] = useState(false)
    const matureVisitRecorded = useRef(false)
    // The banner intentionally unmounts when its manual row hands off to the
    // Expense drawer. Keep an already-earned transition with the room screen so
    // a later conflict cannot make that first-balance moment disappear.
    const latecomerFirstSharedBalancePending = useRef(false)
    const refreshInstallTrigger = useCallback(() => setInstallTrigger(promotedRoomInstallTrigger(slug)), [slug])
    const openRoomShare = useCallback(
        (surface: ShareSurface) => {
            setShareSurface(surface)
            setPostAhaLocationReady(false)
            void setParams({ share: true, shareMoment: null })
        },
        [setParams]
    )
    const openPostAhaShare = useCallback(
        (closeExpenseDrawer: boolean) => {
            setShareSurface('post_aha')
            setPostAhaLocationReady(false)
            const next = closeExpenseDrawer
                ? { add: null, expense: null, share: true, shareMoment: 'post_aha' }
                : { share: true, shareMoment: 'post_aha' }
            // Safari throttles History API writes. Do not paint a reloadable
            // state until nuqs confirms its URL is durable; if the drawer is
            // visible, a reload must be able to reconstruct why it opened.
            void setParams(next, { history: 'replace' }).then(() => setPostAhaLocationReady(true))
        },
        [setParams]
    )
    const closeRoomShare = useCallback(
        (completed: boolean) => {
            if (shareSurface === 'post_aha' && !completed) {
                deferRoomInstallAfterCompetingGuidance(slug)
                refreshInstallTrigger()
            }
            setShareSurface('header')
            setPostAhaLocationReady(false)
            // A controlled drawer can report the same close twice: once for its
            // explicit button and once as vaul observes `open=false`. Replace is
            // deliberately idempotent, so neither path leaves a stale share entry
            // for Back to reopen.
            void setParams({ share: null, shareMoment: null }, { history: 'replace' })
        },
        [refreshInstallTrigger, setParams, shareSurface, slug]
    )
    const leaveRosterCheckpoint = useCallback(
        // `replace`, not push: Back must leave the room the way it always did, never step
        // back into a checkpoint that has already been answered.
        () => {
            void setParams({ roster: null }, { history: 'replace' })
        },
        [setParams]
    )
    const consumeSharedReceipt = useCallback(
        // `replace`, not the hook's default `push`: the drawer clears this param the instant it
        // lands, and with a history entry the back button would return to a share already spent.
        async () => {
            await setParams({ shared: null }, { history: 'replace' })
        },
        [setParams]
    )
    const motionAllowed = useMotionAllowed()
    const celebrated = useRef(false)
    /**
     * Moment #6 fires once per *arrival* at zero, not on every render of a
     * settled room: walking back into a room that was already settled last week
     * should not throw confetti at you.
     */
    const [celebrate, setCelebrate] = useState(false)
    // Resolve at most one named catch-up per room visit. A tap on this device
    // never cascades into a checklist of the room's other people.
    const [latecomerPaused, setLatecomerPaused] = useState(false)
    const [latecomerReviewOpen, setLatecomerReviewOpen] = useState(false)
    const roomTitleRef = useRef<HTMLButtonElement>(null)
    const sawUnsettled = useRef(false)

    const noteLatecomerFirstSharedBalance = useCallback(() => {
        if (latecomerFirstSharedBalancePending.current) return
        latecomerFirstSharedBalancePending.current = true
        trackFirstSharedBalance()
    }, [])

    const deferCompetingGuidance = useCallback(() => {
        deferRoomInstallAfterCompetingGuidance(slug)
        refreshInstallTrigger()
    }, [refreshInstallTrigger, slug])

    const resolveLatecomer = useCallback(
        (reason: 'completed' | 'not_now') => {
            setLatecomerPaused(true)
            if (reason === 'not_now') deferCompetingGuidance()
            if (!latecomerFirstSharedBalancePending.current) return
            latecomerFirstSharedBalancePending.current = false
            // The review has committed its close before Share becomes the sole
            // modal owner, matching the ordinary successful catch-up path.
            openPostAhaShare(false)
        },
        [deferCompetingGuidance, openPostAhaShare]
    )

    useEffect(() => {
        latecomerFirstSharedBalancePending.current = false
    }, [slug])

    useEffect(() => {
        if (!latecomerPaused || params.share) return
        // Confirm and Not now remove the banner that opened the drawer, so the
        // generic drawer restoration target is disconnected. Wait for that
        // committed close to remove the room's inert state, then land on its
        // real heading instead of dropping focus on body.
        const frame = window.requestAnimationFrame(() => roomTitleRef.current?.focus({ preventScroll: true }))
        return () => window.cancelAnimationFrame(frame)
    }, [latecomerPaused, params.share])

    useEffect(() => {
        if (!state) return
        rememberRoom({
            slug,
            name: state.room.name,
            emoji: state.room.emoji ?? undefined,
            theme: state.room.theme ?? undefined,
        })
    }, [slug, state])

    useEffect(() => {
        if (!state) return
        // Warm the exact image chat crawlers request — read out of this page's
        // own head, so it is the URL Next serves rather than one we guessed —
        // before the share drawer opens. Preview failure is contained and
        // cannot affect the room.
        void prewarmRoomPreview(slug)
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
    const hasActiveDebt = (state?.suggestedTransfers.length ?? 0) > 0
    const historyEmpty = !!state && state.expenses.length === 0 && state.settlements.length === 0
    const queuedWrites = useQueuedWrites(slug)
    const hasUnsavedExpense =
        queuedWrites.length > 0 || !!state?.expenses.some((expense) => isPendingExpenseId(expense.id))

    // Nothing is celebrated behind a sheet: the settle drawer dims the room to
    // 20% and the burst would be spent before anyone saw it.
    const roomDrawerOpen =
        params.add ||
        params.settle ||
        params.share ||
        params.settings ||
        params.rooms ||
        !!params.expense ||
        !!params.balance ||
        !!params.character
    const drawerOpen = roomDrawerOpen || latecomerReviewOpen

    const activeRoster = useMemo(() => activeMembers(state?.members ?? []), [state?.members])
    const identityIsActive = !!identity && activeRoster.some((member) => member.id === identity.memberId)
    const needsJoin = loaded && (!identity || !identityIsActive) && !!state
    const expenseSessionReady = loaded && !!state
    const canRecordMatureVisit =
        loaded && !needsJoin && hasActiveDebt && !settledUp && state?.room.hasReachedSharedBalance === true

    useEffect(() => {
        setCreatedHere(readRoomInstallFunnel(slug).origin === 'created_here')
    }, [slug])

    useEffect(() => {
        matureVisitRecorded.current = false
        refreshInstallTrigger()
    }, [refreshInstallTrigger, slug])

    useEffect(() => {
        if (installTrigger !== null) return
        const firstWait = deferredRoomInstallWaitMs(slug)
        if (firstWait === null) return

        let timer = 0
        const refreshAfterDefer = () => {
            const wait = deferredRoomInstallWaitMs(slug)
            if (wait === null) {
                refreshInstallTrigger()
                return
            }
            // Re-check against wall time when the tab wakes: clocks and background timer
            // throttling must not turn a 30-minute courtesy defer into a permanent one.
            timer = window.setTimeout(refreshAfterDefer, wait + 1)
        }
        timer = window.setTimeout(refreshAfterDefer, firstWait + 1)
        return () => window.clearTimeout(timer)
    }, [installTrigger, refreshInstallTrigger, slug])

    useEffect(() => {
        if (!state || !loaded) return
        if (!canRecordMatureVisit) {
            matureVisitRecorded.current = false
            clearMatureRoomReturnEvidence(slug)
            return
        }
        // A background-loaded tab is not a return until it actually becomes visible.
        if (matureVisitRecorded.current || document.visibilityState !== 'visible') return
        matureVisitRecorded.current = true
        noteMatureRoomVisit(slug)
        refreshInstallTrigger()
    }, [canRecordMatureVisit, loaded, refreshInstallTrigger, slug, state])

    // A mobile PWA commonly survives in the background instead of remounting. Persist both sides
    // of that lifecycle: hidden/blur/pagehide starts an absence, while visible/focus/pageshow
    // evaluates it. The heartbeat keeps a continuously foregrounded tab recent, so 31 minutes of
    // wall time followed by reload cannot masquerade as a retained return.
    useEffect(() => {
        if (!canRecordMatureVisit) return
        let away = document.visibilityState !== 'visible'
        const recordAway = () => {
            away = true
            noteMatureRoomAway(slug)
        }
        const recordVisibleReturn = () => {
            if (document.visibilityState !== 'visible') return
            away = false
            matureVisitRecorded.current = true
            noteMatureRoomVisit(slug)
            refreshInstallTrigger()
        }
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') recordVisibleReturn()
            else recordAway()
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('blur', recordAway)
        window.addEventListener('focus', recordVisibleReturn)
        window.addEventListener('pagehide', recordAway)
        window.addEventListener('pageshow', recordVisibleReturn)
        const heartbeat = window.setInterval(() => {
            if (!away && document.visibilityState === 'visible') noteMatureRoomActivity(slug)
        }, MATURE_ACTIVITY_HEARTBEAT_MS)
        return () => {
            window.clearInterval(heartbeat)
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('blur', recordAway)
            window.removeEventListener('focus', recordVisibleReturn)
            window.removeEventListener('pagehide', recordAway)
            window.removeEventListener('pageshow', recordVisibleReturn)
        }
    }, [canRecordMatureVisit, refreshInstallTrigger, slug])

    useEffect(() => {
        const displaced = (event: Event) => {
            const token = (event as CustomEvent<{ token?: unknown }>).detail?.token
            if (typeof token === 'string' && identity?.token === token) setDisplacedIdentity(identity)
        }
        window.addEventListener(MEMBER_TOKEN_INVALID_EVENT, displaced)
        return () => window.removeEventListener(MEMBER_TOKEN_INVALID_EVENT, displaced)
    }, [identity])
    const staleState = !!state && isRefetchError
    const latecomer = useMemo(() => {
        if (!state || latecomerPaused) return null
        const members = activeMembers(state.members).sort((a, b) => {
            const byTime = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            return byTime || b.id.localeCompare(a.id)
        })
        for (const member of members) {
            const review = latecomerReview(state, member.id)
            if (review && !isLatecomerReviewDismissed(slug, review)) return review
        }
        return null
    }, [latecomerPaused, slug, state])

    // JoinGate is the sole viewport owner during identity recovery. Money
    // drafts remain logically mounted and suspended below; every other URL
    // sheet is disposable and must not stack above or surprise-reopen later.
    useEffect(() => {
        if (!needsJoin || !(params.settings || params.rooms || params.character || params.share || params.balance))
            return
        void setParams(
            { settings: null, rooms: null, character: null, share: null, shareMoment: null, balance: null },
            { history: 'replace' }
        )
    }, [
        needsJoin,
        params.balance,
        params.character,
        params.rooms,
        params.settings,
        params.share,
        params.shareMoment,
        setParams,
    ])

    useEffect(() => {
        if (!params.character || activeRoster.some((member) => member.id === params.character)) return
        void setParams({ character: null }, { history: 'replace' })
    }, [activeRoster, params.character, setParams])
    const latecomerPending = latecomer !== null
    const guidanceOwner = resolveRoomGuidance({
        identity: !loaded || needsJoin,
        recovery: staleState || hasUnsavedExpense,
        postAhaShare: !!params.share && shareSurface === 'post_aha',
        activeFlow: drawerOpen,
        roomActivation: historyEmpty,
        latecomerReview: latecomerPending,
        allSettledMoment: celebrate,
        achievement: achievementOpen,
    })

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
    const expenseRequested = params.add || (!!editing && !staleState)
    const [expenseSessionStarted, setExpenseSessionStarted] = useState(false)
    const settlementRequested = params.settle && !staleState
    const [settlementSessionStarted, setSettlementSessionStarted] = useState(false)

    useEffect(() => {
        if (!expenseRequested) setExpenseSessionStarted(false)
        else if (expenseSessionCanStart(expenseSessionReady, needsJoin)) setExpenseSessionStarted(true)
    }, [expenseRequested, expenseSessionReady, needsJoin])

    useEffect(() => {
        if (!settlementRequested) setSettlementSessionStarted(false)
        else if (expenseSessionCanStart(expenseSessionReady, needsJoin)) setSettlementSessionStarted(true)
    }, [expenseSessionReady, needsJoin, settlementRequested])

    // A selected expense that vanished (deleted on another device) must not leave
    // an empty drawer hanging around.
    useEffect(() => {
        if (params.expense && state && !editing) setParams({ expense: null })
    }, [params.expense, state, editing, setParams])

    // Same for an unknown member or a square Former row. Former balances reopen
    // only when historical corrections make them non-zero.
    useEffect(() => {
        if (!params.balance || !state) return
        const member = state.members.find((candidate) => candidate.id === params.balance)
        if (!member || (member.removedAt != null && BigInt(state.balances[member.id] ?? '0') === 0n)) {
            void setParams({ balance: null }, { history: 'replace' })
        }
    }, [params.balance, state, setParams])

    useEffect(() => {
        if (staleState && (params.settle || params.expense)) setParams({ settle: null, expense: null })
    }, [params.expense, params.settle, setParams, staleState])

    // Another link-holder may mark this device's identity Former. Clear the
    // stale proof locally so the JoinGate opens instead of silently attributing
    // future writes to the room's first active person.
    useEffect(() => {
        if (!loaded || !state || !identity || identityIsActive) return
        setDisplacedIdentity(identity)
        forget()
    }, [forget, identity, identityIsActive, loaded, state])

    // A stale recent-room credential returns before ExpenseDrawer mounts. A joined person can
    // also dismiss the ordinary drawer while its model-capability probe is still pending. Consume
    // both halves of the handoff in either terminal case. JoinGate keeps `add=1`, so an unjoined
    // person can still claim a valid room without this cleanup racing them.
    useEffect(() => {
        if (!params.shared) return
        if (params.add && !isApiError(error, 'NOT_FOUND')) return
        void (async () => {
            await discardSharedReceipt(caches)
            await consumeSharedReceipt()
        })()
    }, [consumeSharedReceipt, error, params.add, params.shared])

    if (isApiError(error, 'NOT_FOUND')) return <RoomNotFound slug={slug} />
    if (error && !state) return <RoomErrorState onRetry={() => void refetch()} />

    // Both halves of the creator proof are localStorage reads that land after the first
    // paint, and the room's own state is already cached from creation. Hold the room back
    // for exactly that frame, or the checkpoint arrives as a flash of the room it is
    // meant to come before.
    if (state && params.roster && (!loaded || createdHere === null)) return null

    // Both creation doors land on `?roster=1`, and neither the member token nor the
    // created-here marker travels in a link: a stranger sent this URL fails both and gets
    // the ordinary room. The token also has to still name an ACTIVE member, so a device
    // whose entry was removed meets the join gate rather than "Who's in?".
    if (state && params.roster && createdHere && !!identity?.token && identityIsActive)
        return <RosterCheckpoint state={state} onContinue={leaveRosterCheckpoint} />

    const closeDrawers = () => setParams({ add: null, expense: null, settle: null })

    const onJoined = (next: MemberIdentity) => {
        setDisplacedIdentity(null)
        claim(next)
    }

    // The roster row for whoever is holding the phone, resolved once: the header
    // needs the whole row (its avatar), everything else needs only the id.
    const me =
        (identity && state?.members.find((member) => member.id === identity.memberId && isActiveMember(member))) || null
    const meId = me?.id
    const defaultPaidById = meId ?? activeRoster[0]?.id ?? ''

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
            <PullToRefresh
                enabled={!!state && !drawerOpen && !needsJoin}
                labels={{
                    pull: tStates('pullToRefresh.pull'),
                    release: tStates('pullToRefresh.release'),
                    refreshing: tStates('pullToRefresh.refreshing'),
                }}
                onRefresh={refetch}
            />
            {state ? (
                <RoomHeader
                    room={state.room}
                    members={state.members}
                    state={state}
                    identity={identity}
                    me={me}
                    roomTitleRef={roomTitleRef}
                    onShare={() => openRoomShare('header')}
                    onRoomShareCompleted={refreshInstallTrigger}
                    onForgetIdentity={() => {
                        setDisplacedIdentity(null)
                        forget()
                    }}
                    suspended={needsJoin}
                />
            ) : (
                <RoomHeaderSkeleton />
            )}

            {staleState && (
                <div
                    role="alert"
                    data-testid="room-stale-warning"
                    className="mx-4 mt-4 flex items-start gap-3 rounded-sm border border-n-1 bg-primary-1 p-4"
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

            <div className={`flex flex-1 flex-col gap-6 pt-4 ${historyEmpty ? 'pb-6' : 'pb-36'}`}>
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
                            {!needsJoin && !staleState && !roomDrawerOpen && latecomer && (
                                <LatecomerBanner
                                    key={latecomer.member.id}
                                    slug={slug}
                                    state={state}
                                    memberId={latecomer.member.id}
                                    token={identity?.token}
                                    onResolved={resolveLatecomer}
                                    onFirstSharedBalanceEarned={noteLatecomerFirstSharedBalance}
                                    onOpenChange={setLatecomerReviewOpen}
                                    onEditExpense={(expenseId) => setParams({ expense: expenseId })}
                                />
                            )}
                            {/* One banner at a time, and the achievement card is the one that
                                yields. The latecomer offer is a correction to the numbers directly
                                above it and it expires; the all-settled celebration is the payoff
                                people came back for. An achievement can wait a render — stacked
                                over the ledger on a 375px screen it pushes either of them below
                                the fold. */}
                            {!needsJoin &&
                                !staleState &&
                                !drawerOpen &&
                                !latecomerPending &&
                                !settledUp &&
                                saved.length > 0 && (
                                    <AchievementMoment
                                        slug={slug}
                                        state={state}
                                        meId={meId}
                                        onOpenChange={setAchievementOpen}
                                        onDismissed={deferCompetingGuidance}
                                    />
                                )}
                            <AnimatePresence initial={false}>
                                {settledUp && !latecomerPending && (
                                    <AllSettled
                                        key="all-settled"
                                        celebrate={celebrate}
                                        slug={slug}
                                        summary={{
                                            people: activeRoster.length,
                                            expenses: saved.length,
                                            days: daySpan(saved.map((expense) => new Date(expense.date))),
                                        }}
                                        // Confetti repeats catalog doodles at particle size. A custom
                                        // room drawing stays the room emblem everywhere meaningful and
                                        // deliberately uses the peanut for this decoration only.
                                        emblem={roomEmblemDoodle(state.room.emoji, state.room.name)}
                                    />
                                )}
                            </AnimatePresence>
                            {!needsJoin && (
                                <InstallPrompt
                                    trigger={installTrigger}
                                    blocked={guidanceOwner !== 'install'}
                                    slug={slug}
                                    token={identity?.token}
                                    settled={settledUp}
                                    returnFocusRef={roomTitleRef}
                                    onShown={({ trigger, delivery }) =>
                                        track(
                                            'pwa_prompt_shown',
                                            installMeasureProps('pwa_prompt_shown', { trigger, delivery })
                                        )
                                    }
                                    onDismissed={({ trigger, delivery, reason }) =>
                                        track(
                                            'pwa_prompt_dismissed',
                                            installMeasureProps('pwa_prompt_dismissed', { trigger, delivery, reason })
                                        )
                                    }
                                />
                            )}
                            <ExpenseList
                                state={state}
                                currencies={currencies}
                                meId={meId}
                                slug={slug}
                                token={identity?.token}
                                onSelect={(expenseId) => setParams({ expense: expenseId })}
                                onShare={() => openRoomShare('room_ready')}
                                onAdd={() => setParams({ add: true })}
                                savedActionsDisabled={staleState}
                            />
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>

            {state && !needsJoin && !historyEmpty && (
                <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-xl border-t border-n-1 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
                    <div className="flex gap-3">
                        {!settledUp && (
                            <Button
                                variant="stroke"
                                icon="hand-coins"
                                width="auto"
                                className="shrink-0 justify-center px-4"
                                onClick={() => setParams({ settle: true })}
                                disabled={staleState}
                                data-testid="open-settle"
                            >
                                {t('settleUp')}
                            </Button>
                        )}
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

            {state && needsJoin && (
                <JoinGate slug={slug} state={state} onJoined={onJoined} previousIdentity={displacedIdentity} />
            )}

            {state && (
                <>
                    <ExpenseDrawer
                        open={expenseSessionShouldOpen(
                            expenseRequested,
                            expenseSessionReady,
                            needsJoin,
                            expenseSessionStarted
                        )}
                        suspended={needsJoin}
                        onClose={closeDrawers}
                        slug={slug}
                        state={state}
                        currencies={currencies}
                        token={identity?.token}
                        meId={meId}
                        expense={editing}
                        onFirstSharedBalance={() => openPostAhaShare(true)}
                        onMatureContribution={(result) => {
                            noteMatureContribution(slug, result)
                            refreshInstallTrigger()
                        }}
                        defaultPaidById={defaultPaidById}
                        sharedReceipt={params.shared}
                        onSharedReceiptConsumed={consumeSharedReceipt}
                    />
                    <SettleDrawer
                        open={expenseSessionShouldOpen(
                            settlementRequested,
                            expenseSessionReady,
                            needsJoin,
                            settlementSessionStarted
                        )}
                        suspended={needsJoin}
                        onClose={closeDrawers}
                        slug={slug}
                        state={state}
                        currencies={currencies}
                        token={identity?.token}
                        me={me}
                    />
                    <ShareDrawer
                        open={params.share && (shareSurface !== 'post_aha' || postAhaLocationReady)}
                        onClose={closeRoomShare}
                        onCompleted={() => {
                            noteRoomShareCompleted(slug, state.room.hasReachedSharedBalance === true)
                            refreshInstallTrigger()
                        }}
                        state={state}
                        currencies={currencies}
                        surface={shareSurface}
                        returnFocusRef={roomTitleRef}
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
        </main>
    )
}
