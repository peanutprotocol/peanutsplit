'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { SettingRow } from '@/components/ui/SettingRow'
import { StateRow } from '@/components/ui/StateRow'
import { track } from '@/lib/analytics'
import { isIOSHere, promptInstall, useInstallState } from '@/lib/install'
import { useFeedback } from '@/lib/use-settings'
import { IosInstallSteps } from './IosInstallSteps'

/**
 * Installing Split from the device sheet.
 *
 * Chrome can emit `beforeinstallprompt` well after hydration. Until then, the browser has given us
 * no negative result. The row waits instead of making an unsupported-browser claim. After Chrome's
 * prompt is declined, the event is spent. After it is accepted, only `installedHere` knows because
 * the browser tab stays in browser display mode.
 *
 * No leading glyph: `SettingRow` draws its own chevron and the neighbouring rows carry none, so one
 * here would make this the only decorated row in the sheet.
 *
 * The label is the one thing here that answers to the DEVICE rather than the state. iOS never says
 * "install" — the word the person is about to look for in Safari's share sheet is "Add to Home
 * Screen" — so naming the row after a verb that appears nowhere on their phone sends them hunting
 * for it. Everywhere else, including a Mac, the row keeps the install wording. The state lines
 * below it are unchanged: what the row is called and what it currently says are separate answers.
 */
export function InstallRow() {
    const t = useTranslations('marketing.install')
    const feedback = useFeedback()
    const state = useInstallState()
    const [iosSheetOpen, setIosSheetOpen] = useState(false)
    const reported = useRef(false)

    useEffect(() => {
        if (reported.current || state === null || state === 'waiting') return
        reported.current = true
        // The state is a fact about a browser, not about a person — the same shape as
        // `push_optin_shown`'s `{ status }`.
        track('install_row_shown', { state })
    }, [state])

    const install = async () => {
        const outcome = await promptInstall()
        if (outcome === 'unavailable') return
        track('install_prompted', { outcome })
        // `pwa_installed` is NOT fired here. The store's `appinstalled` handler is its one source.
        if (outcome === 'accepted') feedback('pop')
    }

    // Show only a browser-provided action or a resolved state. No event yet is not "unsupported".
    if (state === null || state === 'waiting') return null

    // Safe here and not a line earlier: `state` is null until the store's first browser read, so
    // this never runs on the server.
    const label = isIOSHere() ? t('row.labelIos') : t('row.label')

    if (state === 'installed') {
        return <StateRow label={label} line={t('row.installed')} testId="install-row-installed" />
    }
    if (state === 'dismissed') {
        return <StateRow label={label} line={t('row.dismissed')} testId="install-row-dismissed" />
    }
    if (state === 'ios') {
        return (
            <>
                <SettingRow label={label} onClick={() => setIosSheetOpen(true)} testId="install-row-ios" />
                {/* The same sheet the deferred banner and the push row already open. There is no
                    second install explanation in this app. */}
                <Drawer open={iosSheetOpen} onOpenChange={setIosSheetOpen}>
                    <DrawerContent>
                        <DrawerHeader>
                            <DrawerTitle className="text-h5">{t('ios.title')}</DrawerTitle>
                            <DrawerDescription>{t('ios.body')}</DrawerDescription>
                        </DrawerHeader>
                        <DrawerBody>
                            <IosInstallSteps />
                            <DrawerActions>
                                <Button
                                    variant="stroke"
                                    className="justify-center"
                                    onClick={() => setIosSheetOpen(false)}
                                >
                                    {t('ios.done')}
                                </Button>
                            </DrawerActions>
                        </DrawerBody>
                    </DrawerContent>
                </Drawer>
            </>
        )
    }

    return <SettingRow label={label} onClick={() => void install()} testId="install-row-prompt" />
}
