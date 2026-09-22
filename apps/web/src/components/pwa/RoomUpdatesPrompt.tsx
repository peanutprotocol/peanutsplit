'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { BTN_MEDIUM } from '@/components/ui/control'
import { roomProps, track } from '@/lib/analytics'
import { useErrorMessage } from '@/lib/error-messages'
import { INSTALL_SNOOZE_CHANGE_EVENT, isInstallSnoozed, noteInstallDismissed, useInstallState } from '@/lib/install'
import { MATURE_RETURN_MS } from '@/lib/install-funnel'
import { cancelPreparedInstallHandoff, prepareInstallHandoff } from '@/lib/install-handoff'
import { openInstallSurface } from '@/lib/install-surface'
import {
    clearRoomUpdatesRequest,
    readRoomUpdates,
    requestRoomUpdates,
    ROOM_UPDATES_CHANGE_EVENT,
} from '@/lib/room-updates'
import { TOAST_MS } from '@/lib/toasts'
import { useMotionAllowed } from '@/lib/use-motion'
import { usePush } from '@/lib/use-push'
import { useFeedback } from '@/lib/use-settings'
import { InstallPrompt, type InstallPromptProps } from './InstallPrompt'
import { DeviceSetupCard } from './DeviceSetupCard'

const QUIET_MS = 1_500

interface RoomUpdatesPromptProps extends InstallPromptProps {
    roomName: string
    memberId?: string | null
    notificationsEligible: boolean
}

const isTyping = (): boolean => {
    const element = document.activeElement
    return (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLElement && element.isContentEditable)
    )
}

/** One optional room action: notifications first, then installation on a later visit. */
export function RoomUpdatesPrompt({
    roomName,
    memberId,
    notificationsEligible,
    ...installProps
}: RoomUpdatesPromptProps) {
    const { slug, token, trigger, blocked, returnFocusRef } = installProps
    const t = useTranslations('push')
    const tInstall = useTranslations('marketing.install')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const installState = useInstallState()
    const { status, error, subscribe } = usePush(slug)
    const [updates, setUpdates] = useState<ReturnType<typeof readRoomUpdates> | null>(null)
    const [snoozed, setSnoozed] = useState(true)
    const [visible, setVisible] = useState(false)
    const [arming, setArming] = useState(false)
    const [complete, setComplete] = useState(false)
    const [retired, setRetired] = useState(false)
    const [completedThisVisit, setCompletedThisVisit] = useState(false)
    const [visit, setVisit] = useState(0)
    const previousUpdates = useRef<ReturnType<typeof readRoomUpdates> | null>(null)
    const offered = useRef<'notifications' | 'ios' | null>(null)
    const operation = useRef(false)
    const mounted = useRef(true)
    const blockedRef = useRef(blocked)
    const generation = useRef(0)
    const cardRef = useRef<HTMLDivElement>(null)
    if (!blockedRef.current && blocked) generation.current += 1
    blockedRef.current = blocked

    const refresh = useCallback(() => {
        const next = readRoomUpdates(slug)
        const previous = previousUpdates.current
        // Settings can complete setup before the automatic card has appeared.
        if (
            previous !== null &&
            next.subscribedAt !== undefined &&
            (next.subscribedAt !== previous.subscribedAt || (previous.muted === true && !next.muted))
        )
            setCompletedThisVisit(true)
        previousUpdates.current = next
        setUpdates(next)
        setSnoozed(isInstallSnoozed())
    }, [slug])

    const restoreFocus = useCallback(() => {
        window.requestAnimationFrame(() => returnFocusRef?.current?.focus({ preventScroll: true }))
    }, [returnFocusRef])

    useEffect(() => {
        mounted.current = true
        refresh()
        window.addEventListener(ROOM_UPDATES_CHANGE_EVENT, refresh)
        window.addEventListener(INSTALL_SNOOZE_CHANGE_EVENT, refresh)
        window.addEventListener('storage', refresh)
        return () => {
            mounted.current = false
            window.removeEventListener(ROOM_UPDATES_CHANGE_EVENT, refresh)
            window.removeEventListener(INSTALL_SNOOZE_CHANGE_EVENT, refresh)
            window.removeEventListener('storage', refresh)
        }
    }, [refresh])

    useEffect(() => {
        let awayAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null
        const away = () => {
            awayAt ??= Date.now()
        }
        const returned = () => {
            if (document.visibilityState !== 'visible') return
            if (awayAt !== null && Date.now() - awayAt >= MATURE_RETURN_MS && !operation.current) {
                offered.current = null
                setVisible(false)
                setComplete(false)
                setRetired(false)
                setCompletedThisVisit(false)
                setVisit((current) => current + 1)
            }
            awayAt = null
            refresh()
        }
        const visibility = () => {
            if (document.visibilityState === 'hidden') away()
            else returned()
        }
        document.addEventListener('visibilitychange', visibility)
        window.addEventListener('pagehide', away)
        window.addEventListener('pageshow', returned)
        return () => {
            document.removeEventListener('visibilitychange', visibility)
            window.removeEventListener('pagehide', away)
            window.removeEventListener('pageshow', returned)
        }
    }, [refresh])

    useEffect(() => {
        if (error !== null) toast.error(errorMessage(error, t('failed')), { duration: TOAST_MS.actionable })
    }, [error, errorMessage, t])

    const requested = updates?.requestedAt !== undefined
    const eligible =
        updates !== null &&
        !!memberId &&
        !!token &&
        (notificationsEligible || requested) &&
        !updates.muted &&
        !snoozed &&
        !retired &&
        installState !== 'repair'
    const candidate =
        eligible && (status === 'default' || status === 'ios-needs-pwa')
            ? status === 'ios-needs-pwa'
                ? 'ios'
                : 'notifications'
            : null

    useEffect(() => {
        if (blocked || trigger === null || (!candidate && !operation.current && !complete)) {
            setVisible(false)
            return
        }
        if (visible || complete) return
        let timer: ReturnType<typeof setTimeout>
        const arm = () => {
            clearTimeout(timer)
            if (document.visibilityState !== 'visible') return
            timer = setTimeout(() => {
                if (document.visibilityState !== 'visible' || isTyping()) {
                    arm()
                    return
                }
                if (offered.current === null && candidate !== null) {
                    offered.current = candidate
                    track('push_optin_shown', roomProps(slug, { status, surface: 'room', trigger, resumed: requested }))
                }
                setVisible(true)
            }, QUIET_MS)
        }
        arm()
        window.addEventListener('input', arm)
        window.addEventListener('keydown', arm)
        window.addEventListener('focusin', arm)
        window.addEventListener('pointerdown', arm)
        document.addEventListener('visibilitychange', arm)
        return () => {
            clearTimeout(timer)
            window.removeEventListener('input', arm)
            window.removeEventListener('keydown', arm)
            window.removeEventListener('focusin', arm)
            window.removeEventListener('pointerdown', arm)
            document.removeEventListener('visibilitychange', arm)
        }
    }, [blocked, candidate, complete, requested, slug, status, trigger, visible, visit])

    useEffect(() => {
        if (!complete) return
        const timer = window.setTimeout(() => {
            const ownedFocus = cardRef.current?.contains(document.activeElement)
            setVisible(false)
            setComplete(false)
            setRetired(true)
            if (ownedFocus && !blockedRef.current) restoreFocus()
        }, QUIET_MS)
        return () => window.clearTimeout(timer)
    }, [complete, restoreFocus])

    const dismiss = (reason: 'not_now' | 'permission_denied' = 'not_now') => {
        generation.current += 1
        track('push_optin_dismissed', roomProps(slug, { surface: 'room', reason }))
        noteInstallDismissed()
        clearRoomUpdatesRequest(slug)
        setVisible(false)
        setRetired(true)
        refresh()
        if (!blockedRef.current) restoreFocus()
    }

    const enable = async () => {
        if (!memberId || !token || operation.current || complete) return
        operation.current = true
        track('push_optin_started', roomProps(slug, { surface: 'room', step: 'notifications' }))
        requestRoomUpdates(slug)
        const outcome = await subscribe(memberId, token)
        operation.current = false
        if (!mounted.current) return
        if (outcome === 'subscribed') {
            feedback('pop')
            setComplete(true)
            track('push_optin_accepted', roomProps(slug, { surface: 'room' }))
        } else if (outcome === 'denied') {
            track('push_optin_denied', roomProps(slug, { surface: 'room' }))
            dismiss('permission_denied')
        } else {
            track('push_optin_failed', roomProps(slug, { surface: 'room', step: 'notifications' }))
        }
    }

    const install = async () => {
        if (operation.current) return
        operation.current = true
        track('push_optin_started', roomProps(slug, { surface: 'room', step: 'install' }))
        const startedAtGeneration = generation.current
        setArming(true)
        requestRoomUpdates(slug)
        const prepared = await prepareInstallHandoff(slug, token, { notifications: true })
        operation.current = false
        if (mounted.current) setArming(false)
        if (
            !mounted.current ||
            blockedRef.current ||
            generation.current !== startedAtGeneration ||
            readRoomUpdates(slug).requestedAt === undefined
        ) {
            if (prepared) void cancelPreparedInstallHandoff(prepared)
            return
        }
        if (!prepared) {
            track('push_optin_failed', roomProps(slug, { surface: 'room', step: 'install' }))
            feedback('error', { haptic: 'error' })
            toast.error(tInstall('ios.prepareFailed'), { duration: TOAST_MS.actionable })
            return
        }
        openInstallSurface('auto')
    }

    const recentlySubscribed =
        updates?.subscribedAt !== undefined && Date.now() - updates.subscribedAt < MATURE_RETURN_MS
    const canOfferInstall =
        updates !== null &&
        !updates.muted &&
        !snoozed &&
        !retired &&
        !completedThisVisit &&
        !recentlySubscribed &&
        offered.current === null &&
        (status === 'unsupported' ||
            status === 'subscribed' ||
            ((status === 'default' || status === 'ios-needs-pwa') && !eligible))

    if (installState === 'repair' || canOfferInstall)
        return (
            <InstallPrompt
                {...installProps}
                onDismissed={(details) => {
                    setRetired(true)
                    refresh()
                    installProps.onDismissed?.(details)
                }}
            />
        )

    const ios = offered.current === 'ios'
    const label = t('notifyMe', { room: roomName })

    return (
        <>
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {complete ? `${label}: ${t('on')}` : ''}
            </span>
            <AnimatePresence initial={motionAllowed}>
                {visible && !blocked && (
                    <motion.div
                        ref={cardRef}
                        initial={motionAllowed ? { y: 12, opacity: 0 } : false}
                        animate={{ y: 0, opacity: 1 }}
                        exit={motionAllowed ? { y: 12, opacity: 0 } : { opacity: 0 }}
                        transition={motionAllowed ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }}
                        role="region"
                        aria-label={label}
                        className="mx-4 break-words"
                        data-testid="room-updates-prompt"
                        data-motion-surface
                    >
                        <DeviceSetupCard>
                            {ios ? (
                                <Button
                                    variant="primary"
                                    size="medium"
                                    shadowSize="3"
                                    className={`${BTN_MEDIUM} w-full justify-center`}
                                    onClick={() => void install()}
                                    loading={arming}
                                    data-testid="room-updates-install"
                                >
                                    {tInstall('cta')}
                                </Button>
                            ) : (
                                <Button
                                    variant="primary"
                                    size="medium"
                                    shadowSize="3"
                                    className={`${BTN_MEDIUM} w-full justify-center`}
                                    aria-pressed={complete}
                                    onClick={() => void enable()}
                                    disabled={complete}
                                    loading={status === 'pending'}
                                    icon={complete ? 'check' : undefined}
                                    data-testid="room-updates-enable"
                                >
                                    {t('cta')}
                                </Button>
                            )}
                            {!complete && (
                                <Button
                                    variant="transparent"
                                    size="medium"
                                    className={`${BTN_MEDIUM} w-full justify-center text-grey-1`}
                                    onClick={() => dismiss()}
                                    disabled={status === 'pending'}
                                    data-testid="room-updates-dismiss"
                                >
                                    {tInstall('dismiss')}
                                </Button>
                            )}
                        </DeviceSetupCard>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
