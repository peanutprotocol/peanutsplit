'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { peanutPointing } from '@/assets/mascot'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { BTN_MEDIUM } from '@/components/ui/control'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import { isInstallSnoozed, noteInstallDismissed, promptInstall, useInstallState } from '@/lib/install'
import { useMotionAllowed } from '@/lib/use-motion'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { IosInstallSteps } from './IosInstallSteps'

/** Wait this long without typing before asking. Never interrupt someone mid-expense. */
const IDLE_MS = 20_000

const isTyping = (): boolean => {
    const el = document.activeElement
    if (!el) return false
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable
}

export interface InstallPromptProps {
    /** SPEC analytics hook — wired to `pwa_prompt_shown` at the mount site. `pwa_installed` is not
     *  here: it has exactly one source, the `appinstalled` listener in `lib/install.ts`. */
    onShown?: () => void
    onDismissed?: (dismissCount: number) => void
}

/**
 * Bottom install card. Appears only after the user has been idle for ~20s, only when the app
 * is not already installed, and only when the exponential dismiss backoff has expired.
 *
 * Chromium gives us a real `beforeinstallprompt` to replay; iOS gives us nothing, so it gets a
 * how-to sheet instead. Not mounted anywhere yet — mount it on the room page.
 */
export function InstallPrompt({ onShown, onDismissed }: InstallPromptProps) {
    const t = useTranslations('marketing.install')
    const motionAllowed = useMotionAllowed()
    const state = useInstallState()
    const [visible, setVisible] = useState(false)
    const [sheetOpen, setSheetOpen] = useState(false)
    const shownRef = useRef(false)

    // The capture itself lives in `lib/install.ts`, registered from Providers: `beforeinstallprompt`
    // fires once per page load, and two listeners for one event is how the settings row and this
    // banner would have disagreed about whether there was still an opportunity to replay.
    // A card that is up when the app gets installed comes straight back down.
    useEffect(() => {
        if (state === 'installed') setVisible(false)
    }, [state])

    // Idle countdown — any typing pushes it back out to a full IDLE_MS.
    useEffect(() => {
        const eligible = (state === 'promptable' || state === 'ios') && !isInstallSnoozed()
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
    }, [state, visible, onShown])

    const dismiss = useCallback(() => {
        setVisible(false)
        setSheetOpen(false)
        onDismissed?.(noteInstallDismissed())
    }, [onDismissed])

    const install = useCallback(async () => {
        if (state === 'ios') {
            setSheetOpen(true)
            return
        }
        setVisible(false)
        const outcome = await promptInstall()
        if (outcome === 'unavailable') return
        track('install_prompted', { outcome })
        // A declined prompt is a dismissal: it feeds the same backoff a tap on "Not now" does.
        if (outcome === 'dismissed') dismiss()
    }, [state, dismiss])

    return (
        <>
            <AnimatePresence initial={motionAllowed}>
                {visible && (
                    <motion.div
                        initial={motionAllowed ? { y: 120, opacity: 0 } : false}
                        animate={{ y: 0, opacity: 1 }}
                        exit={motionAllowed ? { y: 120, opacity: 0 } : { y: 0, opacity: 1 }}
                        transition={motionAllowed ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }}
                        data-motion-surface
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
                            <CloseButton
                                onClick={dismiss}
                                label={t('dismiss')}
                                className="-mr-2 -mt-2 self-start text-grey-1"
                            />
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
