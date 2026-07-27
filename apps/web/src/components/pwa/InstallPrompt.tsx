'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { peanutPointing } from '@/assets/mascot'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { marketingCopy } from '@/components/marketing/copy'

const copy = marketingCopy.install

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
                        aria-label={copy.title}
                    >
                        <div className="shadow-4 mx-auto flex w-full max-w-xl gap-3 rounded-sm border border-n-1 bg-white p-4">
                            <Image
                                src={peanutPointing}
                                alt=""
                                aria-hidden="true"
                                unoptimized
                                className="size-12 shrink-0 object-contain"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="text-h7">{copy.title}</p>
                                <p className="mt-1 text-sm leading-5 text-grey-1">{copy.body}</p>
                                <div className="mt-3 flex items-center gap-2">
                                    <Button
                                        variant="primary"
                                        size="medium"
                                        shadowSize="3"
                                        className="w-auto shrink-0 justify-center whitespace-nowrap px-4"
                                        onClick={install}
                                    >
                                        {copy.cta}
                                    </Button>
                                    <Button
                                        variant="transparent"
                                        size="medium"
                                        className="w-auto justify-center whitespace-nowrap px-2 text-grey-1"
                                        onClick={dismiss}
                                    >
                                        {copy.dismiss}
                                    </Button>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={dismiss}
                                aria-label={copy.dismiss}
                                className="-mr-1 -mt-1 size-8 shrink-0 self-start rounded-sm text-grey-1"
                            >
                                <Icon name="x" size={18} className="mx-auto" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
                <DrawerContent className="border-n-1">
                    <DrawerHeader className="text-left">
                        <DrawerTitle className="text-h5">{copy.ios.title}</DrawerTitle>
                        <DrawerDescription>{copy.ios.body}</DrawerDescription>
                    </DrawerHeader>
                    <ol className="flex flex-col gap-3 px-4 pb-2">
                        {copy.ios.steps.map((step, index) => (
                            <li key={step} className="flex items-start gap-3">
                                <span
                                    aria-hidden="true"
                                    className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-primary-1 font-display text-h8 leading-none"
                                >
                                    {index + 1}
                                </span>
                                <span className="flex-1 text-sm leading-5">{step}</span>
                            </li>
                        ))}
                    </ol>
                    <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        <Button variant="stroke" className="justify-center" onClick={dismiss}>
                            {copy.ios.done}
                        </Button>
                    </div>
                </DrawerContent>
            </Drawer>
        </>
    )
}

export default InstallPrompt
