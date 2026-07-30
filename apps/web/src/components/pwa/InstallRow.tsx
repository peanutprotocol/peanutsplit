'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { SettingRow } from '@/components/ui/SettingRow'
import { StateRow } from '@/components/ui/StateRow'
import { track } from '@/lib/analytics'
import { promptInstall, useInstallState } from '@/lib/install'
import { useFeedback } from '@/lib/use-settings'
import { IosInstallSteps } from './IosInstallSteps'

/**
 * Installing Split, as a permanent row in the device sheet.
 *
 * The deferred banner asks once and then snoozes itself for up to thirty days. This is the place
 * somebody who wants it can go and get it, so it has to be honest in all five states and dead-end
 * in none of them — including the two that are easy to get wrong. After Chrome's prompt is
 * declined the event is spent, and falling back to "this browser can't add apps" would say that
 * one second after the browser offered; after it is accepted, the tab that did the installing is
 * still a tab, so nothing about `display-mode` has changed and only `installedHere` knows.
 *
 * No leading glyph: `SettingRow` draws its own chevron and the neighbouring rows carry none, so one
 * here would make this the only decorated row in the sheet.
 */
export function InstallRow() {
    const t = useTranslations('marketing.install')
    const feedback = useFeedback()
    const state = useInstallState()
    const [iosSheetOpen, setIosSheetOpen] = useState(false)
    const reported = useRef(false)

    useEffect(() => {
        if (reported.current || state === null) return
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

    // Nothing painted before the first browser read: every state below is a claim about a device.
    if (state === null) return null

    if (state === 'installed') {
        return <StateRow label={t('row.label')} line={t('row.installed')} testId="install-row-installed" />
    }
    if (state === 'dismissed') {
        return <StateRow label={t('row.label')} line={t('row.dismissed')} testId="install-row-dismissed" />
    }
    if (state === 'unsupported') {
        return <StateRow label={t('row.label')} line={t('row.unsupported')} testId="install-row-unsupported" />
    }

    if (state === 'ios') {
        return (
            <>
                <SettingRow label={t('row.label')} onClick={() => setIosSheetOpen(true)} testId="install-row-ios" />
                {/* The same sheet the deferred banner and the push row already open. There is no
                    second install explanation in this app. */}
                <Drawer open={iosSheetOpen} onOpenChange={setIosSheetOpen}>
                    <DrawerContent className={drawerContentClass}>
                        <DrawerHeader className={drawerHeaderClass}>
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

    return <SettingRow label={t('row.label')} onClick={() => void install()} testId="install-row-prompt" />
}
