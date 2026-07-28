'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { peanutPointing } from '@/assets/mascot'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { BTN_MEDIUM } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { IosInstallSteps } from './IosInstallSteps'

const DISMISS_COUNT_KEY = 'ps:pwa-dismiss-count'
const DISMISSED_AT_KEY = 'ps:pwa-dismissed-at'

/** Wait this long without typing before asking. Never interrupt someone mid-expense. */
const IDLE_MS = 20_000
const HOUR = 60 * 60 * 1000
const BASE_BACKOFF_MS = 24 * HOUR
const MAX_BACKOFF_MS = 30 * 24 * HOUR

/** Not in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const readInt = (key: string): number => {
    const raw = window.localStorage.getItem(key)
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : 0
}

/** 24h → 48h → 96h → … capped at 30 days. */
const backoffMs = (dismissCount: number): number =>
    Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, dismissCount - 1), MAX_BACKOFF_MS)

const isSnoozed = (): boolean => {
    try {
        const count = readInt(DISMISS_COUNT_KEY)
        if (count === 0) return false
        return Date.now() - readInt(DISMISSED_AT_KEY) < backoffMs(count)
    } catch {
        return false
    }
}

const isStandalone = (): boolean =>
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's pre-standard flag — still the only signal for a pinned iOS PWA.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPadOS reports itself as a Mac; only the touch-point count gives it away. */
const isIOSDevice = (): boolean => {
    const ua = window.navigator.userAgent
    return /iPad|iPhone|iPod/.test(ua) || (window.navigator.maxTouchPoints > 1 && /Mac/.test(ua))
}

const isTyping = (): boolean => {
    const el = document.activeElement
    if (!el) return false
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable
}

export interface InstallPromptProps {
    /** SPEC analytics hooks — wire to PostHog (`pwa_prompt_shown`, `pwa_installed`) at the mount site. */
    onShown?: () => void
    onInstalled?: () => void
    onDismissed?: (dismissCount: number) => void
}

/**
 * Bottom install card. Appears only after the user has been idle for ~20s, only when the app
 * is not already installed, and only when the exponential dismiss backoff has expired.
 *
 * Chromium gives us a real `beforeinstallprompt` to replay; iOS gives us nothing, so it gets a
 * how-to sheet instead. Not mounted anywhere yet — mount it on the room page.
 */
export function InstallPrompt({ onShown, onInstalled, onDismissed }: InstallPromptProps) {
    const t = useTranslations('marketing.install')
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
    const [iosEligible, setIosEligible] = useState(false)
    const [visible, setVisible] = useState(false)
    const [sheetOpen, setSheetOpen] = useState(false)
    const shownRef = useRef(false)

    // Capture the install opportunity as early as possible — the browser only fires it once.
    useEffect(() => {
        if (isStandalone() || isSnoozed()) return

        const onBeforeInstallPrompt = (event: Event) => {
            event.preventDefault()
            setDeferred(event as BeforeInstallPromptEvent)
        }
        const onAppInstalled = () => {
            setVisible(false)
            setDeferred(null)
            try {
                window.localStorage.removeItem(DISMISS_COUNT_KEY)
                window.localStorage.removeItem(DISMISSED_AT_KEY)
            } catch {
                // ignore
            }
            onInstalled?.()
        }

        window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
        window.addEventListener('appinstalled', onAppInstalled)

        if (isIOSDevice()) setIosEligible(true)

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
            window.removeEventListener('appinstalled', onAppInstalled)
        }
    }, [onInstalled])

    // Idle countdown — any typing pushes it back out to a full IDLE_MS.
    useEffect(() => {
        const eligible = deferred !== null || iosEligible
        if (!eligible || visible || shownRef.current) return

        let timer: ReturnType<typeof setTimeout>
        const arm = () => {
            clearTimeout(timer)
            timer = setTimeout(() => {
                if (isTyping()) {
                    arm()
                    return
                }
                shownRef.current = true
                setVisible(true)
                onShown?.()
            }, IDLE_MS)
        }

        arm()
        window.addEventListener('input', arm)
        window.addEventListener('keydown', arm)
        window.addEventListener('focusin', arm)

        return () => {
            clearTimeout(timer)
            window.removeEventListener('input', arm)
            window.removeEventListener('keydown', arm)
            window.removeEventListener('focusin', arm)
        }
    }, [deferred, iosEligible, visible, onShown])

    const dismiss = useCallback(() => {
        setVisible(false)
        setSheetOpen(false)
        try {
            const next = readInt(DISMISS_COUNT_KEY) + 1
            window.localStorage.setItem(DISMISS_COUNT_KEY, String(next))
            window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
            onDismissed?.(next)
        } catch {
            onDismissed?.(1)
        }
    }, [onDismissed])

    const install = useCallback(async () => {
        if (!deferred) {
            setSheetOpen(true)
            return
        }
        setVisible(false)
        await deferred.prompt()
        const { outcome } = await deferred.userChoice
        setDeferred(null)
        if (outcome === 'accepted') {
            onInstalled?.()
        } else {
            dismiss()
        }
    }, [deferred, dismiss, onInstalled])

    return (
        <>
            <AnimatePresence>
                {visible && (
                    <motion.div
                        initial={{ y: 120, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 120, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                        className="fixed inset-x-0 bottom-0 z-40 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
                        role="dialog"
                        aria-label={t('title')}
                    >
                        <div className="shadow-4 mx-auto flex w-full max-w-xl gap-3 rounded-sm border border-n-1 bg-white p-4">
                            <Image
                                src={peanutPointing}
                                alt=""
                                aria-hidden="true"
                                unoptimized
                                className="size-12 shrink-0 object-contain"
                            />
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <p className="text-h7">{t('title')}</p>
                                <p className="text-sm leading-5 text-grey-1">{t('body')}</p>
                                {/* An inline banner is the one place a pair of actions sits
                                    side by side rather than stacked — but both halves take the
                                    same size, so the row has one baseline and one height. */}
                                <div className="mt-2 flex items-center gap-2">
                                    <Button
                                        variant="primary"
                                        size="medium"
                                        shadowSize="3"
                                        className={cn(BTN_MEDIUM, 'w-auto shrink-0 justify-center whitespace-nowrap')}
                                        onClick={install}
                                    >
                                        {t('cta')}
                                    </Button>
                                    <Button
                                        variant="transparent"
                                        size="medium"
                                        className={cn(
                                            BTN_MEDIUM,
                                            'w-auto justify-center whitespace-nowrap text-grey-1'
                                        )}
                                        onClick={dismiss}
                                    >
                                        {t('dismiss')}
                                    </Button>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={dismiss}
                                aria-label={t('dismiss')}
                                className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center self-start rounded-sm text-grey-1"
                            >
                                <Icon name="x" size={18} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
                <DrawerContent className={drawerContentClass}>
                    <DrawerHeader className={drawerHeaderClass}>
                        <DrawerTitle className="text-h5">{t('ios.title')}</DrawerTitle>
                        <DrawerDescription>{t('ios.body')}</DrawerDescription>
                    </DrawerHeader>
                    <DrawerBody>
                        <IosInstallSteps />
                        <DrawerActions>
                            <Button variant="stroke" className="justify-center" onClick={dismiss}>
                                {t('ios.done')}
                            </Button>
                        </DrawerActions>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </>
    )
}

export default InstallPrompt
