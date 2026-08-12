'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { installMeasureProps, track } from '@/lib/analytics'
import { copyText } from '@/lib/clipboard'
import { readInstallRepairRoomUrl, shouldOfferStoredRoomUrl, type InstallSurfaceSource } from '@/lib/install-surface'
import {
    dismissInstallRepairNotice,
    isIOSHere,
    noteInstallDismissed,
    promptInstall,
    useInstallState,
} from '@/lib/install'
import { useFeedback } from '@/lib/use-settings'
import { BrowserInstallSteps } from './BrowserInstallSteps'
import { IosInstallSteps } from './IosInstallSteps'

export function InstallAppSurface({ source, repair = false }: { source: InstallSurfaceSource; repair?: boolean }) {
    const t = useTranslations('marketing.install')
    const feedback = useFeedback()
    const state = useInstallState()
    const surfaceRef = useRef<HTMLElement>(null)
    const reportedSteps = useRef<'browser' | 'ios' | null>(null)
    const [repairIsIOS, setRepairIsIOS] = useState<boolean | null>(null)
    const [roomUrl, setRoomUrl] = useState<string | null>(null)
    const [copyResult, setCopyResult] = useState<'copied' | 'failed' | null>(null)
    const browserIsAndroid = state !== null && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

    useEffect(() => {
        setRoomUrl(shouldOfferStoredRoomUrl(source, repair) ? readInstallRepairRoomUrl() : null)
        if (repair) {
            dismissInstallRepairNotice()
            setRepairIsIOS(isIOSHere())
            return
        }
        if (state === 'installed') window.location.replace('/app')
    }, [repair, source, state])

    useEffect(() => {
        if (repair) return
        const kind = state === 'ios' ? 'ios' : state === 'waiting' || state === 'dismissed' ? 'browser' : null
        if (kind === null || reportedSteps.current === kind) return
        reportedSteps.current = kind
        const event = kind === 'ios' ? 'ios_install_steps_opened' : 'browser_install_steps_opened'
        track(event, installMeasureProps(event, { surface: source }))
    }, [repair, source, state])

    const install = async () => {
        const outcome = await promptInstall()
        if (outcome === 'unavailable') {
            window.requestAnimationFrame(() => surfaceRef.current?.focus({ preventScroll: true }))
            return
        }
        track('install_prompted', installMeasureProps('install_prompted', { outcome, surface: source }))
        if (outcome === 'dismissed') {
            noteInstallDismissed()
            window.requestAnimationFrame(() => surfaceRef.current?.focus({ preventScroll: true }))
            return
        }
        feedback('pop')
        window.location.replace('/app')
    }

    const copyRoomLink = async () => {
        if (!roomUrl) return
        const copied = await copyText(roomUrl)
        setCopyResult(copied ? 'copied' : 'failed')
        feedback(copied ? 'pop' : 'error', copied ? undefined : { haptic: 'error' })
    }

    const roomLinkAction = roomUrl ? (
        <div className="mt-4 grid gap-2">
            <p className="text-sm leading-5 text-grey-1">{t('page.roomRecovery')}</p>
            <Button
                variant="stroke"
                shadowSize="3"
                className="w-full justify-center"
                onClick={() => void copyRoomLink()}
                data-testid="install-copy-room"
            >
                {t('page.copyRoom')}
            </Button>
            {copyResult && (
                <p className="mt-2 text-sm leading-5 text-grey-1" role={copyResult === 'failed' ? 'alert' : 'status'}>
                    {t(copyResult === 'copied' ? 'repair.copied' : 'repair.copyFailed')}
                </p>
            )}
        </div>
    ) : null

    return (
        <section
            ref={surfaceRef}
            tabIndex={-1}
            data-testid="install-app-surface"
            aria-labelledby="install-app-title"
            className="shadow-4 mx-5 mt-6 rounded-sm border border-n-1 bg-white p-5"
        >
            {repair ? (
                <>
                    <h2 id="install-app-title" className="text-h5">
                        {t('repair.title')}
                    </h2>
                    <p className="mt-2 text-sm leading-5 text-grey-1">{t('repair.body')}</p>
                    {roomUrl ? (
                        <div className="mt-5">
                            <p className="mb-3 text-sm leading-5 text-grey-1">{t('repair.copyFirst')}</p>
                            <Button
                                variant="stroke"
                                shadowSize="3"
                                className="w-full justify-center"
                                onClick={() => void copyRoomLink()}
                                data-testid="install-repair-copy-room"
                            >
                                {t('repair.copy')}
                            </Button>
                            {copyResult && (
                                <p
                                    className="mt-2 text-sm leading-5 text-grey-1"
                                    role={copyResult === 'failed' ? 'alert' : 'status'}
                                >
                                    {t(copyResult === 'copied' ? 'repair.copied' : 'repair.copyFailed')}
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="mt-5 text-sm leading-5 text-grey-1">{t('repair.missing')}</p>
                    )}
                    {repairIsIOS === null ? (
                        <p className="mt-5 text-sm leading-5 text-grey-1">{t('page.preparing')}</p>
                    ) : (
                        <ol className="mt-5 flex flex-col gap-3">
                            {[
                                t('repair.step1'),
                                t(
                                    repairIsIOS
                                        ? copyResult === 'copied'
                                            ? 'repair.step2IosCopied'
                                            : 'repair.step2IosOriginal'
                                        : copyResult === 'copied'
                                          ? 'repair.step2ChromeCopied'
                                          : 'repair.step2ChromeOriginal'
                                ),
                                t(repairIsIOS ? 'repair.step3Ios' : 'repair.step3Chrome'),
                            ].map((step, index) => (
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
                    )}
                    <p className="mt-4 rounded-sm border border-n-1 bg-primary-3 p-3 text-sm font-bold leading-5">
                        {t('repair.check')}
                    </p>
                    <Button
                        variant="transparent"
                        className="mt-4 w-full justify-center"
                        onClick={() => window.location.assign(roomUrl ?? '/app?manage=1&repair=1')}
                        data-testid="install-repair-back"
                    >
                        {t(roomUrl ? 'repair.back' : 'page.continue')}
                    </Button>
                </>
            ) : state === 'promptable' ? (
                <>
                    <h2 id="install-app-title" className="text-h5">
                        {t('title')}
                    </h2>
                    <p className="mt-2 text-sm leading-5 text-grey-1">{t('body')}</p>
                    <Button
                        variant="primary"
                        shadowSize="4"
                        className="mt-5 w-full justify-center"
                        onClick={() => void install()}
                        data-testid="install-app-native"
                    >
                        {t('cta')}
                    </Button>
                </>
            ) : state === 'ios' ? (
                <>
                    <h2 id="install-app-title" className="text-h5">
                        {t('ios.title')}
                    </h2>
                    <p className="mt-2 text-sm leading-5 text-grey-1">{t('ios.body')}</p>
                    <div className="mt-5">
                        <IosInstallSteps />
                    </div>
                    <p className="mt-4 text-sm font-bold leading-5">{t('ios.openAfter')}</p>
                    {roomLinkAction}
                </>
            ) : state === 'waiting' || state === 'dismissed' ? (
                <>
                    <h2 id="install-app-title" className="text-h5">
                        {t('browser.title')}
                    </h2>
                    <p className="mt-2 text-sm leading-5 text-grey-1">
                        {t(browserIsAndroid ? 'browser.bodyAndroid' : 'browser.body')}
                    </p>
                    <div className="mt-5">
                        <BrowserInstallSteps android={browserIsAndroid} />
                    </div>
                    {roomLinkAction}
                </>
            ) : (
                <>
                    <h2 id="install-app-title" className="text-h5">
                        {t('title')}
                    </h2>
                    <p className="mt-2 text-sm leading-5 text-grey-1">
                        {state === 'installed' ? t('page.installed') : t('page.preparing')}
                    </p>
                </>
            )}

            {!repair && state !== 'installed' && (
                <Link
                    href="/app?manage=1"
                    className="mt-5 inline-flex min-h-11 items-center text-sm font-bold underline"
                >
                    {t('page.continue')}
                </Link>
            )}
        </section>
    )
}
