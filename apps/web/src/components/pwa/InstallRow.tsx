'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { SettingRow } from '@/components/ui/SettingRow'
import { StateRow } from '@/components/ui/StateRow'
import { installMeasureProps, track } from '@/lib/analytics'
import { cancelPreparedInstallHandoff, prepareInstallHandoff } from '@/lib/install-handoff'
import { isIOSHere, promptInstall, snoozeAfterIosInstallInstructions, useInstallState } from '@/lib/install'
import { useFeedback } from '@/lib/use-settings'
import { BrowserInstallSteps } from './BrowserInstallSteps'
import { IosInstallSteps } from './IosInstallSteps'

/**
 * Installing Split from the device sheet.
 *
 * Chrome can emit `beforeinstallprompt` well after hydration. Until then, the browser has given us
 * no negative result, but its menu can already expose installation. The row therefore keeps a
 * truthful manual path visible and upgrades in place when the one-tap event arrives. After Chrome's
 * prompt is declined, the event is spent. After it is accepted, only `installedHere` knows because
 * the browser tab stays in browser display mode.
 *
 * No leading glyph: `SettingRow` draws its own chevron and the neighbouring rows carry none, so one
 * here would make this the only decorated row in the sheet.
 *
 * The label is the one thing here that answers to the DEVICE rather than the state. iOS never says
 * "install" — the word the person is about to look for in Safari's share sheet is "Add to Home
 * Screen" — so naming the row after a verb that appears nowhere on their phone sends them hunting
 * for it. Everywhere else, including a Mac, the row keeps the install wording.
 */
export function InstallRow({ slug, token, active = true }: { slug: string; token?: string | null; active?: boolean }) {
    const t = useTranslations('marketing.install')
    const feedback = useFeedback()
    const state = useInstallState()
    const [iosSheetOpen, setIosSheetOpen] = useState(false)
    const [browserSheetOpen, setBrowserSheetOpen] = useState(false)
    const [arming, setArming] = useState(false)
    const armingRef = useRef(false)
    const mountedRef = useRef(true)
    const installedRowRef = useRef<HTMLDivElement>(null)
    const activeRef = useRef(active)
    const inactiveGeneration = useRef(0)
    if (activeRef.current && !active) inactiveGeneration.current += 1
    activeRef.current = active
    const reported = useRef(false)

    const closeIosSteps = () => {
        snoozeAfterIosInstallInstructions()
        setIosSheetOpen(false)
    }

    useEffect(() => {
        if (reported.current || state === null || !active) return
        reported.current = true
        // The state is a fact about a browser, not about a person — the same shape as
        // `push_optin_shown`'s `{ status }`.
        track('install_row_shown', { state })
    }, [active, state])

    useEffect(() => {
        if (!active || state === 'installed') setBrowserSheetOpen(false)
    }, [active, state])

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    const install = async () => {
        const outcome = await promptInstall()
        if (outcome === 'unavailable') return
        track('install_prompted', installMeasureProps('install_prompted', { outcome, surface: 'settings' }))
        // `pwa_installed` is NOT fired here. The store's `appinstalled` handler is its one source.
        if (outcome === 'accepted') feedback('pop')
    }

    // `null` is the only unresolved state. `waiting` is a resolved browser fact: there is no
    // replayable one-tap prompt yet, so the stable row falls back to browser-menu instructions.
    if (state === null) return null

    // Safe here and not a line earlier: `state` is null until the store's first browser read, so
    // this never runs on the server.
    const label = isIOSHere() ? t('row.labelIos') : t('row.label')

    if (state === 'ios') {
        const openIosSteps = async () => {
            if (armingRef.current) return
            // Withhold the steps unless this exact room replaced any older prepared handoff.
            armingRef.current = true
            setArming(true)
            const generation = inactiveGeneration.current
            const prepared = await prepareInstallHandoff(slug, token)
            if (!mountedRef.current) {
                if (prepared) void cancelPreparedInstallHandoff(prepared)
                return
            }
            armingRef.current = false
            setArming(false)
            if (!activeRef.current || generation !== inactiveGeneration.current) {
                if (prepared) void cancelPreparedInstallHandoff(prepared)
                return
            }
            if (!prepared) {
                feedback('error', { haptic: 'error' })
                toast.error(t('ios.prepareFailed'))
                return
            }
            track('ios_install_steps_opened', installMeasureProps('ios_install_steps_opened', { surface: 'settings' }))
            setIosSheetOpen(true)
        }
        return (
            <>
                <SettingRow
                    label={label}
                    value={arming ? t('row.preparing') : undefined}
                    onClick={() => void openIosSteps()}
                    testId="install-row-ios"
                />
                {/* The same sheet the deferred banner and the push row already open. There is no
                    second install explanation in this app. */}
                <Drawer open={iosSheetOpen} onOpenChange={(next) => !next && closeIosSteps()}>
                    <DrawerContent>
                        <DrawerHeader>
                            <DrawerTitle className="text-h5">{t('ios.title')}</DrawerTitle>
                            <DrawerDescription>{t('ios.body')}</DrawerDescription>
                        </DrawerHeader>
                        <DrawerBody>
                            <IosInstallSteps />
                            <DrawerActions>
                                <Button variant="stroke" className="justify-center" onClick={closeIosSteps}>
                                    {t('ios.done')}
                                </Button>
                            </DrawerActions>
                        </DrawerBody>
                    </DrawerContent>
                </Drawer>
            </>
        )
    }

    const openBrowserSteps = () => {
        track(
            'browser_install_steps_opened',
            installMeasureProps('browser_install_steps_opened', { surface: 'settings' })
        )
        setBrowserSheetOpen(true)
    }
    const browserInstructions = (
        <Drawer open={browserSheetOpen} onOpenChange={(next) => !next && setBrowserSheetOpen(false)}>
            <DrawerContent
                data-testid="browser-install-drawer"
                onCloseAutoFocus={(event) => {
                    if (state !== 'installed') return
                    event.preventDefault()
                    installedRowRef.current?.focus({ preventScroll: true })
                }}
            >
                <DrawerHeader>
                    <DrawerTitle className="text-h5">{t('browser.title')}</DrawerTitle>
                    <DrawerDescription>{t('browser.body')}</DrawerDescription>
                </DrawerHeader>
                <DrawerBody>
                    <BrowserInstallSteps />
                    <DrawerActions>
                        <Button variant="stroke" className="justify-center" onClick={() => setBrowserSheetOpen(false)}>
                            {t('browser.done')}
                        </Button>
                    </DrawerActions>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )

    if (state === 'installed') {
        return (
            <>
                <div
                    ref={installedRowRef}
                    tabIndex={-1}
                    aria-label={`${label}. ${t('row.installed')}`}
                    data-testid="install-row-installed-focus"
                >
                    <StateRow label={label} line={t('row.installed')} testId="install-row-installed" />
                </div>
                {/* `appinstalled` can arrive while menu help is open. Keep the controlled drawer
                    composed for its close cycle, then restore focus to the new installed row. */}
                {browserInstructions}
            </>
        )
    }

    if (state === 'waiting' || state === 'dismissed') {
        return (
            <>
                <SettingRow
                    label={label}
                    value={t('row.browserMenu')}
                    onClick={openBrowserSteps}
                    testId={state === 'dismissed' ? 'install-row-dismissed' : 'install-row-browser'}
                />
                {browserInstructions}
            </>
        )
    }

    return (
        <>
            <SettingRow label={label} onClick={() => void install()} testId="install-row-prompt" />
            {/* Keep an already-open help sheet composed if Chromium exposes its one-tap event while
                the person is reading. Closing it then reveals the upgraded prompt row. */}
            {browserInstructions}
        </>
    )
}
