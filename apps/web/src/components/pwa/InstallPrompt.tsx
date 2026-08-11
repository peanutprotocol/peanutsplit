'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { peanutPointing } from '@/assets/mascot'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { BTN_MEDIUM } from '@/components/ui/control'
import { installMeasureProps, track } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import type { AutoInstallTrigger } from '@/lib/install-funnel'
import { cancelPreparedInstallHandoff, prepareInstallHandoff } from '@/lib/install-handoff'
import {
    isInstallSnoozed,
    noteInstallDismissed,
    promptInstall,
    snoozeAfterManualInstallInstructions,
    useInstallState,
} from '@/lib/install'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { BrowserInstallSteps } from './BrowserInstallSteps'
import { IosInstallSteps } from './IosInstallSteps'

/** Let a higher-priority moment settle after its drawer closes; this is composure, not eligibility. */
const QUIET_MS = 1_500

type AutoInstallDelivery = 'browser_prompt' | 'browser_steps' | 'ios_steps'
type InstructionKind = 'browser' | 'ios'

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
    /** Stable room landmark for banner dismissal and iOS-sheet close. */
    returnFocusRef?: RefObject<HTMLElement | null>
    /** `pwa_installed` is not here: `lib/install.ts` remains its one Chromium source. */
    onShown?: (details: { trigger: AutoInstallTrigger; delivery: AutoInstallDelivery }) => void
    onDismissed?: (details: {
        trigger: AutoInstallTrigger
        delivery: AutoInstallDelivery
        reason: 'not_now' | 'close' | 'browser_declined' | 'instructions_closed'
        dismissCount: number
    }) => void
}

/**
 * Inline install card. The room's guidance arbiter decides when installation owns the next-step
 * slot; this component waits for a quiet rendering moment and owns the platform-specific action.
 *
 * Chromium gives us a real `beforeinstallprompt` to replay; iOS gives us nothing, so it gets a
 * how-to sheet instead. The room page is its only mount site.
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
    const delivery = deliveryFor(state)
    const [visible, setVisible] = useState(false)
    const [instructions, setInstructions] = useState<InstructionKind | null>(null)
    const [arming, setArming] = useState(false)
    const shownRef = useRef(false)
    const suspendedRef = useRef(false)
    const armingRef = useRef(false)
    // Synchronous mirror for async handoff completion. A higher-priority drawer can block and hide
    // this card while the network request is in flight, before a render gives the callback fresh
    // props. In that case the response must not open instructions over the new drawer.
    const visibleRef = useRef(false)
    const shownContextRef = useRef<{
        trigger: AutoInstallTrigger
        delivery: AutoInstallDelivery
    } | null>(null)
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

    // The capture itself lives in `lib/install.ts`, registered from Providers: `beforeinstallprompt`
    // fires once per page load, and two listeners for one event is how the settings row and this
    // banner would have disagreed about whether there was still an opportunity to replay.
    // A card that is up when the app gets installed comes straight back down. A temporary room
    // owner merely suspends it, so closing a drawer restores the same measured exposure rather
    // than manufacturing a second impression.
    useEffect(() => {
        if (delivery === null || trigger === null) {
            if (visibleRef.current && !blocked) restoreRoomFocus()
            visibleRef.current = false
            suspendedRef.current = false
            shownContextRef.current = null
            setVisible(false)
            if (state === 'installed') setInstructions(null)
            return
        }
        if (blocked) {
            if (shownContextRef.current !== null) suspendedRef.current = true
            visibleRef.current = false
            setVisible(false)
        }
    }, [blocked, delivery, instructions, restoreRoomFocus, state, trigger])

    // Eligibility is already earned. This short quiet window only prevents a card from landing on
    // the same frame as focus restoration or the person's next deliberate action.
    useEffect(() => {
        const resuming = suspendedRef.current && shownContextRef.current !== null
        const eligible =
            trigger !== null &&
            !blocked &&
            delivery !== null &&
            instructions === null &&
            !isInstallSnoozed() &&
            (resuming || !shownRef.current)
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
                    resuming && shownContextRef.current !== null ? shownContextRef.current : { trigger, delivery }
                if (resuming) {
                    suspendedRef.current = false
                } else {
                    shownRef.current = true
                    onShown?.(details)
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
    }, [blocked, delivery, instructions, onShown, trigger, visible])

    const dismiss = useCallback(
        (reason: 'not_now' | 'close' | 'browser_declined' | 'instructions_closed') => {
            const shown = shownContextRef.current
            if (!shown) return
            shownContextRef.current = null
            suspendedRef.current = false
            const dismissCount = noteInstallDismissed()
            if (reason === 'instructions_closed') snoozeAfterManualInstallInstructions()
            onDismissed?.({ ...shown, reason, dismissCount })
            visibleRef.current = false
            setVisible(false)
            setInstructions(null)
            if (reason !== 'instructions_closed') restoreRoomFocus()
        },
        [onDismissed, restoreRoomFocus]
    )

    const closeInstructions = useCallback(() => {
        dismiss('instructions_closed')
    }, [dismiss])

    const install = useCallback(async () => {
        if (!trigger || armingRef.current) return
        if (state === 'ios') {
            // WebKit copies this prepared cookie, but not localStorage, into the new Home Screen
            // container. Do not open the steps unless this exact room is armed: an older prepared
            // cookie must never restore a different room after this CTA.
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
            track(
                'ios_install_steps_opened',
                installMeasureProps('ios_install_steps_opened', { surface: 'auto', trigger: shownAtStart.trigger })
            )
            visibleRef.current = false
            setVisible(false)
            setInstructions('ios')
            return
        }

        if (state === 'waiting' || state === 'dismissed') {
            track(
                'browser_install_steps_opened',
                installMeasureProps('browser_install_steps_opened', { surface: 'auto' })
            )
            visibleRef.current = false
            setVisible(false)
            setInstructions('browser')
            return
        }

        const shownAtStart = shownContextRef.current
        visibleRef.current = false
        setVisible(false)
        const outcome = await promptInstall()
        if (outcome === 'unavailable') {
            track(
                'browser_install_steps_opened',
                installMeasureProps('browser_install_steps_opened', { surface: 'auto' })
            )
            setInstructions('browser')
            return
        }
        const shownTrigger = shownAtStart?.trigger ?? trigger
        track(
            'install_prompted',
            installMeasureProps('install_prompted', { outcome, surface: 'auto', trigger: shownTrigger })
        )
        // A declined prompt is a dismissal: it feeds the same backoff a tap on "Not now" does.
        if (outcome === 'dismissed') dismiss('browser_declined')
        else {
            shownContextRef.current = null
            restoreRoomFocus()
        }
    }, [dismiss, feedback, restoreRoomFocus, slug, state, t, token, trigger])

    return (
        <>
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
                        aria-label={t('title')}
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
                                <p className="text-h7">{t('title')}</p>
                                <p className="text-sm leading-5 text-grey-1">
                                    {settled ? t('bodySettled') : t('body')}
                                </p>
                                {/* An inline banner is the one place a pair of actions sits
                                    side by side rather than stacked — but both halves take the
                                    same size, so the row has one baseline and one height. */}
                                <div className="mt-2 flex items-center gap-2">
                                    <Button
                                        variant="primary"
                                        size="medium"
                                        shadowSize="3"
                                        width="auto"
                                        className={cn(BTN_MEDIUM, 'shrink-0 justify-center whitespace-nowrap')}
                                        onClick={install}
                                        disabled={arming}
                                        loading={arming}
                                    >
                                        {state === 'promptable' ? t('cta') : t('ctaIos')}
                                    </Button>
                                    <Button
                                        variant="transparent"
                                        size="medium"
                                        width="auto"
                                        className={cn(BTN_MEDIUM, 'justify-center whitespace-nowrap text-grey-1')}
                                        onClick={() => dismiss('not_now')}
                                    >
                                        {t('dismiss')}
                                    </Button>
                                </div>
                            </div>
                            <CloseButton
                                onClick={() => dismiss('close')}
                                label={t('closeSuggestion')}
                                className="-mr-2 -mt-2 self-start text-grey-1"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Drawer open={instructions !== null} onOpenChange={(next) => !next && closeInstructions()}>
                <DrawerContent
                    onCloseAutoFocus={(event) => {
                        event.preventDefault()
                        restoreRoomFocus()
                    }}
                >
                    <DrawerHeader>
                        <DrawerTitle className="text-h5">
                            {instructions === 'browser' ? t('browser.title') : t('ios.title')}
                        </DrawerTitle>
                        <DrawerDescription>
                            {instructions === 'browser' ? t('browser.body') : t('ios.body')}
                        </DrawerDescription>
                    </DrawerHeader>
                    <DrawerBody>
                        {instructions === 'browser' ? <BrowserInstallSteps /> : <IosInstallSteps />}
                        <DrawerActions>
                            {instructions === 'browser' && state === 'promptable' ? (
                                <Button
                                    variant="primary"
                                    shadowSize="4"
                                    className="justify-center"
                                    onClick={() => void install()}
                                >
                                    {t('cta')}
                                </Button>
                            ) : (
                                <Button variant="stroke" className="justify-center" onClick={closeInstructions}>
                                    {instructions === 'browser' ? t('browser.done') : t('ios.done')}
                                </Button>
                            )}
                        </DrawerActions>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </>
    )
}

export default InstallPrompt
