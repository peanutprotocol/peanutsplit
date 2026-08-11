'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { peanutPointing } from '@/assets/mascot'
import { Button } from '@/components/ui/Button'
import { BTN_MEDIUM } from '@/components/ui/control'
import { installMeasureProps, track } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import type { AutoInstallTrigger } from '@/lib/install-funnel'
import { cancelPreparedInstallHandoff, prepareInstallHandoff } from '@/lib/install-handoff'
import { openInstallRepairSurface, openInstallSurface } from '@/lib/install-surface'
import {
    dismissInstallRepairNotice,
    isInstallRepairNoticeDismissed,
    isInstallSnoozed,
    isIOSHere,
    noteInstallDismissed,
    promptInstall,
    useInstallState,
} from '@/lib/install'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'

/** Let a higher-priority moment settle after its drawer closes; this is composure, not eligibility. */
const QUIET_MS = 1_500

type AutoInstallDelivery = 'browser_prompt' | 'browser_steps' | 'ios_steps'

const deliveryFor = (state: ReturnType<typeof useInstallState>): AutoInstallDelivery | null => {
    if (state === 'promptable') return 'browser_prompt'
    if (state === 'waiting' || state === 'dismissed') return 'browser_steps'
    if (state === 'ios') return 'ios_steps'
    return null
}

const isTyping = (): boolean => {
    const el = document.activeElement
    if (!el) return false
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable
}

export interface InstallPromptProps {
    trigger: AutoInstallTrigger | null
    /** A higher-priority room moment currently owns the person's attention. */
    blocked: boolean
    /** Used only to prepare the private iOS storage handoff; never sent to analytics. */
    slug: string
    token?: string | null
    /** A completed room needs a next-trip promise rather than a return-task promise. */
    settled?: boolean
    /** Stable room landmark for banner dismissal. */
    returnFocusRef?: RefObject<HTMLElement | null>
    /** `pwa_installed` is not here: `lib/install.ts` remains its one Chromium source. */
    onShown?: (details: { trigger: AutoInstallTrigger; delivery: AutoInstallDelivery }) => void
    onDismissed?: (details: {
        trigger: AutoInstallTrigger
        delivery: AutoInstallDelivery
        reason: 'not_now' | 'browser_declined'
        dismissCount: number
    }) => void
}

/**
 * Inline install card. Native Chromium installation stays one tap. Manual Android and iOS paths
 * leave the room for the slug-free `/app` install surface, so a browser can never save the room's
 * title or URL as the application identity.
 */
export function InstallPrompt({
    trigger,
    blocked,
    slug,
    token,
    settled = false,
    returnFocusRef,
    onShown,
    onDismissed,
}: InstallPromptProps) {
    const t = useTranslations('marketing.install')
    const motionAllowed = useMotionAllowed()
    const feedback = useFeedback()
    const state = useInstallState()
    const delivery = state === 'repair' ? (isIOSHere() ? 'ios_steps' : 'browser_steps') : deliveryFor(state)
    const [visible, setVisible] = useState(false)
    const [arming, setArming] = useState(false)
    const shownRef = useRef(false)
    const suspendedRef = useRef(false)
    const armingRef = useRef(false)
    const visibleRef = useRef(false)
    const onShownRef = useRef(onShown)
    const onDismissedRef = useRef(onDismissed)
    const shownContextRef = useRef<{
        trigger: AutoInstallTrigger
        delivery: AutoInstallDelivery
        repair: boolean
    } | null>(null)
    // Freeze the meaning of a visible card. Chromium may deliver a native prompt after the
    // shortcut-repair notice appears; that must not turn an acknowledged migration check into an
    // ordinary install impression or dismissal halfway through the interaction.
    const repairExposure = shownContextRef.current?.repair ?? state === 'repair'

    onShownRef.current = onShown
    onDismissedRef.current = onDismissed

    const restoreRoomFocus = useCallback(() => {
        window.requestAnimationFrame(() => returnFocusRef?.current?.focus({ preventScroll: true }))
    }, [returnFocusRef])

    useEffect(
        () => () => {
            visibleRef.current = false
            suspendedRef.current = false
            shownContextRef.current = null
        },
        []
    )

    useEffect(() => {
        if (delivery === null || trigger === null) {
            if (visibleRef.current && !blocked) restoreRoomFocus()
            visibleRef.current = false
            suspendedRef.current = false
            shownContextRef.current = null
            setVisible(false)
            return
        }
        if (blocked) {
            if (shownContextRef.current !== null) suspendedRef.current = true
            visibleRef.current = false
            setVisible(false)
        }
    }, [blocked, delivery, restoreRoomFocus, trigger])

    useEffect(() => {
        const resuming = suspendedRef.current && shownContextRef.current !== null
        const dismissed = repairExposure ? isInstallRepairNoticeDismissed() : isInstallSnoozed()
        const eligible =
            trigger !== null && !blocked && delivery !== null && !dismissed && (resuming || !shownRef.current)
        if (!eligible || visible) return

        let timer: ReturnType<typeof setTimeout>
        const arm = () => {
            clearTimeout(timer)
            if (document.visibilityState !== 'visible') return
            timer = setTimeout(() => {
                if (document.visibilityState !== 'visible' || isTyping()) {
                    arm()
                    return
                }
                const details =
                    resuming && shownContextRef.current !== null
                        ? shownContextRef.current
                        : { trigger, delivery, repair: state === 'repair' }
                if (resuming) {
                    suspendedRef.current = false
                } else {
                    shownRef.current = true
                    if (!details.repair) {
                        onShownRef.current?.({ trigger: details.trigger, delivery: details.delivery })
                    }
                    shownContextRef.current = details
                }
                visibleRef.current = true
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
    }, [blocked, delivery, repairExposure, state, trigger, visible])

    const dismiss = useCallback(
        (reason: 'not_now' | 'browser_declined') => {
            const shown = shownContextRef.current
            if (!shown) return
            shownContextRef.current = null
            suspendedRef.current = false
            if (shown.repair) {
                dismissInstallRepairNotice()
            } else {
                const dismissCount = noteInstallDismissed()
                onDismissedRef.current?.({
                    trigger: shown.trigger,
                    delivery: shown.delivery,
                    reason,
                    dismissCount,
                })
            }
            visibleRef.current = false
            setVisible(false)
            restoreRoomFocus()
        },
        [restoreRoomFocus]
    )

    const install = useCallback(async () => {
        if (!trigger || armingRef.current) return

        if (repairExposure) {
            openInstallRepairSurface('auto')
            return
        }

        if (state === 'ios') {
            const shownAtStart = shownContextRef.current
            if (!visibleRef.current || shownAtStart === null) return
            armingRef.current = true
            setArming(true)
            const prepared = await prepareInstallHandoff(slug, token)
            armingRef.current = false
            setArming(false)
            if (shownContextRef.current !== shownAtStart || !visibleRef.current) {
                if (prepared) void cancelPreparedInstallHandoff(prepared)
                return
            }
            if (!prepared) {
                feedback('error', { haptic: 'error' })
                toast.error(t('ios.prepareFailed'))
                return
            }
            openInstallSurface('auto')
            return
        }

        if (state === 'waiting' || state === 'dismissed') {
            openInstallSurface('auto')
            return
        }

        const shownAtStart = shownContextRef.current
        visibleRef.current = false
        setVisible(false)
        const outcome = await promptInstall()
        if (outcome === 'unavailable') {
            openInstallSurface('auto')
            return
        }
        const shownTrigger = shownAtStart?.trigger ?? trigger
        track(
            'install_prompted',
            installMeasureProps('install_prompted', { outcome, surface: 'auto', trigger: shownTrigger })
        )
        if (outcome === 'dismissed') dismiss('browser_declined')
        else {
            shownContextRef.current = null
            restoreRoomFocus()
        }
    }, [dismiss, feedback, repairExposure, restoreRoomFocus, slug, state, t, token, trigger])

    return (
        <AnimatePresence initial={motionAllowed}>
            {visible && (
                <motion.div
                    initial={motionAllowed ? { y: 12, opacity: 0 } : false}
                    animate={{ y: 0, opacity: 1 }}
                    exit={motionAllowed ? { y: 12, opacity: 0 } : { y: 0, opacity: 1 }}
                    transition={motionAllowed ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }}
                    data-motion-surface
                    data-testid="install-prompt"
                    className="mx-4"
                    role="region"
                    aria-label={repairExposure ? t('repair.title') : t('title')}
                >
                    <div className="shadow-4 flex w-full gap-3 rounded-sm border border-n-1 bg-white p-4">
                        <Image
                            src={peanutPointing}
                            alt=""
                            aria-hidden="true"
                            unoptimized
                            className="size-12 shrink-0 object-contain"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <p className="text-h7">{repairExposure ? t('repair.title') : t('title')}</p>
                            <p className="text-sm leading-5 text-grey-1">
                                {repairExposure ? t('repair.cardBody') : settled ? t('bodySettled') : t('body')}
                            </p>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Button
                                    variant="primary"
                                    size="medium"
                                    shadowSize="3"
                                    width="auto"
                                    className={cn(BTN_MEDIUM, 'w-full justify-center sm:w-auto')}
                                    onClick={install}
                                    disabled={arming}
                                    loading={arming}
                                >
                                    {repairExposure ? t('repair.cta') : t('cta')}
                                </Button>
                                <Button
                                    variant="transparent"
                                    size="medium"
                                    width="auto"
                                    className={cn(BTN_MEDIUM, 'w-full justify-center text-grey-1 sm:w-auto')}
                                    onClick={() => dismiss('not_now')}
                                >
                                    {t('dismiss')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

export default InstallPrompt
