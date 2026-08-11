'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { SettingRow } from '@/components/ui/SettingRow'
import { StateRow } from '@/components/ui/StateRow'
import { installMeasureProps, track } from '@/lib/analytics'
import { cancelPreparedInstallHandoff, prepareInstallHandoff } from '@/lib/install-handoff'
import { openInstallRepairSurface, openInstallSurface } from '@/lib/install-surface'
import { isIOSHere, noteInstallDismissed, promptInstall, useInstallState } from '@/lib/install'
import { useFeedback } from '@/lib/use-settings'

/**
 * The persistent Device action. Native Chromium installation stays one tap; all manual paths use
 * the canonical `/app` document so browser shortcuts cannot inherit a room title or room URL.
 */
export function InstallRow({ slug, token, active = true }: { slug: string; token?: string | null; active?: boolean }) {
    const t = useTranslations('marketing.install')
    const feedback = useFeedback()
    const state = useInstallState()
    const [arming, setArming] = useState(false)
    const armingRef = useRef(false)
    const mountedRef = useRef(true)
    const activeRef = useRef(active)
    const inactiveGeneration = useRef(0)
    const reported = useRef(false)
    const focusInstalledOnChange = useRef(false)
    const installedRowRef = useRef<HTMLDivElement>(null)

    if (activeRef.current && !active) inactiveGeneration.current += 1
    activeRef.current = active

    useEffect(() => {
        if (reported.current || state === null || state === 'repair' || !active) return
        reported.current = true
        track('install_row_shown', { state })
    }, [active, state])

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    useEffect(() => {
        if (state !== 'installed' || !focusInstalledOnChange.current) return
        focusInstalledOnChange.current = false
        window.requestAnimationFrame(() => installedRowRef.current?.focus({ preventScroll: true }))
    }, [state])

    const install = async () => {
        focusInstalledOnChange.current = true
        const outcome = await promptInstall()
        if (outcome === 'unavailable') {
            focusInstalledOnChange.current = false
            openInstallSurface('settings')
            return
        }
        track('install_prompted', installMeasureProps('install_prompted', { outcome, surface: 'settings' }))
        if (outcome === 'dismissed') {
            focusInstalledOnChange.current = false
            noteInstallDismissed()
        }
        if (outcome === 'accepted') feedback('pop')
    }

    const openIosInstall = async () => {
        if (armingRef.current) return
        armingRef.current = true
        setArming(true)
        const generation = inactiveGeneration.current
        const prepared = await prepareInstallHandoff(slug, token)
        armingRef.current = false
        if (mountedRef.current) setArming(false)
        if (!mountedRef.current || !activeRef.current || generation !== inactiveGeneration.current) {
            if (prepared) void cancelPreparedInstallHandoff(prepared)
            return
        }
        if (!prepared) {
            feedback('error', { haptic: 'error' })
            toast.error(t('ios.prepareFailed'))
            return
        }
        openInstallSurface('settings')
    }

    if (state === null) return null

    const ios = isIOSHere()
    const label = ios ? t('row.labelIos') : t('row.label')

    if (state === 'installed') {
        return (
            <div
                ref={installedRowRef}
                tabIndex={-1}
                aria-label={`${label}. ${t('row.installed')}`}
                data-testid="install-row-installed-focus"
            >
                <StateRow label={label} line={t('row.installed')} testId="install-row-installed" />
            </div>
        )
    }

    if (state === 'repair') {
        return (
            <SettingRow
                label={ios ? t('row.checkLabelIos') : t('row.checkLabel')}
                value={t('row.checkAction')}
                onClick={() => openInstallRepairSurface('settings')}
                testId="install-row-repair"
            />
        )
    }

    if (state === 'ios') {
        return (
            <SettingRow
                label={label}
                value={arming ? t('row.preparing') : t('ctaSteps')}
                onClick={() => void openIosInstall()}
                testId="install-row-ios"
            />
        )
    }

    if (state === 'waiting' || state === 'dismissed') {
        return (
            <SettingRow
                label={label}
                value={t('ctaSteps')}
                onClick={() => openInstallSurface('settings')}
                testId={state === 'dismissed' ? 'install-row-dismissed' : 'install-row-browser'}
            />
        )
    }

    return <SettingRow label={label} onClick={() => void install()} testId="install-row-prompt" />
}
