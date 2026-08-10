'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { SettingToggle } from '@/components/ui/SettingToggle'
import { StateRow } from '@/components/ui/StateRow'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { installMeasureProps, roomProps, track } from '@/lib/analytics'
import { useErrorMessage } from '@/lib/error-messages'
import type { MemberIdentity } from '@/lib/identity'
import { cancelPreparedInstallHandoff, prepareInstallHandoff } from '@/lib/install-handoff'
import { snoozeAfterIosInstallInstructions } from '@/lib/install'
import type { SettledPushStatus } from '@/lib/push-status'
import { TOAST_MS } from '@/lib/toasts'
import { useFeedback } from '@/lib/use-settings'
import { usePush } from '@/lib/use-push'
import { IosInstallSteps } from './IosInstallSteps'

interface PushOptInProps {
    active?: boolean
    slug: string
    /** Named in the label, because the switch is per room and the sheet is not. */
    roomName: string
    identity: MemberIdentity | null
    /** A tokenless identity can only be repaired by picking a name again. */
    onSwitchPerson: () => void
}

/**
 * Notifications for THIS room, as one toggle row inside the room card.
 *
 * Opt-in per room AND per device, which is what the shape of the backend already
 * says: a subscription row is (room, endpoint, member). Nothing here ever asks on
 * its own — the row sits in a sheet somebody deliberately opened.
 *
 * The same row stays in place from tap through the browser's permission result.
 * If the browser denies the request, the switch stays disabled and carries the
 * reason as its hint instead of disappearing from under the person who tapped it.
 */
export function PushOptIn({ active = true, slug, roomName, identity, onSwitchPerson }: PushOptInProps) {
    const t = useTranslations('push')
    const tInstall = useTranslations('marketing.install')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const { status, error, subscribe, unsubscribe } = usePush(slug)
    const [iosSheetOpen, setIosSheetOpen] = useState(false)
    const [installArming, setInstallArming] = useState(false)
    const installArmingRef = useRef(false)
    const mountedRef = useRef(true)
    const activeRef = useRef(active)
    const inactiveGeneration = useRef(0)
    if (activeRef.current && !active) inactiveGeneration.current += 1
    activeRef.current = active

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    const closeIosInstallSteps = () => {
        snoozeAfterIosInstallInstructions()
        setIosSheetOpen(false)
    }
    /**
     * The last settled status, so a subscribe in flight (which reports
     * 'pending') does not make the row someone just tapped disappear from under
     * their finger. `busy` drives the disabled state instead.
     */
    const [displayed, setDisplayed] = useState<SettledPushStatus | null>(null)
    const reported = useRef(false)

    useEffect(() => {
        if (status !== 'pending') setDisplayed(status)
    }, [status])

    useEffect(() => {
        if (reported.current || displayed === null || displayed === 'unsupported') return
        reported.current = true
        // The status is the interesting dimension: "shown" on an iOS tab and
        // "shown" on an Android that can say yes are different funnels.
        track('push_optin_shown', roomProps(slug, { status: displayed }))
    }, [displayed, slug])

    /**
     * A failure is a toast, not a reserved line. The row promises at most one
     * state sentence, and an error is not one of the four states it describes.
     */
    useEffect(() => {
        if (error === null) return
        toast.error(errorMessage(error, t('failed')), { duration: TOAST_MS.actionable })
    }, [error, errorMessage, t])

    const busy = status === 'pending'

    const openIosInstallSteps = async () => {
        if (installArmingRef.current) return
        installArmingRef.current = true
        setInstallArming(true)
        const generation = inactiveGeneration.current
        const prepared = await prepareInstallHandoff(slug, identity?.token)
        if (!mountedRef.current) {
            if (prepared) void cancelPreparedInstallHandoff(prepared)
            return
        }
        installArmingRef.current = false
        setInstallArming(false)
        if (!activeRef.current || generation !== inactiveGeneration.current) {
            if (prepared) void cancelPreparedInstallHandoff(prepared)
            return
        }
        if (!prepared) {
            feedback('error', { haptic: 'error' })
            toast.error(tInstall('ios.prepareFailed'), { duration: TOAST_MS.actionable })
            return
        }
        track('ios_install_steps_opened', installMeasureProps('ios_install_steps_opened', { surface: 'settings' }))
        setIosSheetOpen(true)
    }

    // A browser with no push at all gets no row, no explanation and no apology.
    if (displayed === null || displayed === 'unsupported') return null

    if (displayed === 'ios-needs-pwa') {
        return (
            <div className="flex flex-col gap-2">
                <StateRow label={t('label')} line={t('iosNeedsPwa')} />
                <button
                    type="button"
                    onClick={() => void openIosInstallSteps()}
                    disabled={installArming}
                    className="self-start text-sm text-n-1 underline"
                >
                    {installArming ? tInstall('row.preparing') : t('iosHow')}
                </button>
                <Drawer open={iosSheetOpen} onOpenChange={(next) => !next && closeIosInstallSteps()}>
                    <DrawerContent>
                        <DrawerHeader>
                            <DrawerTitle className="text-h5">{tInstall('ios.title')}</DrawerTitle>
                            <DrawerDescription>{tInstall('ios.body')}</DrawerDescription>
                        </DrawerHeader>
                        <DrawerBody>
                            <IosInstallSteps />
                            <DrawerActions>
                                <Button variant="stroke" className="justify-center" onClick={closeIosInstallSteps}>
                                    {tInstall('ios.done')}
                                </Button>
                            </DrawerActions>
                        </DrawerBody>
                    </DrawerContent>
                </Drawer>
            </div>
        )
    }

    // The per-room row lives on the server and the check for it did not come
    // back. Neither switch position is honest, so show the state without one.
    if (displayed === 'unknown') return <StateRow label={t('label')} line={t('unknown')} />

    /**
     * Legacy tokenless identities can still read the room, but the push endpoint
     * cannot bind a delivery channel without a member token. New "that's me"
     * claims receive the roster entry's existing token; this fallback remains
     * for old localStorage records and unavailable storage.
     */
    const provenIdentity = identity?.token ? identity : null
    const subscribed = displayed === 'subscribed'
    const unavailableLine = displayed === 'denied' ? t('denied') : undefined

    const toggle = async (next: boolean) => {
        if (!provenIdentity?.token) return
        if (!next) {
            await unsubscribe(provenIdentity.memberId, provenIdentity.token)
            return
        }
        const outcome = await subscribe(provenIdentity.memberId, provenIdentity.token)
        if (outcome === 'subscribed') {
            feedback('pop')
            track('push_optin_accepted', roomProps(slug))
        } else if (outcome === 'denied') {
            track('push_optin_denied', roomProps(slug))
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <SettingToggle
                label={t('notifyMe', { room: roomName })}
                hint={unavailableLine}
                testId={subscribed ? 'push-disable' : 'push-enable'}
                checked={subscribed}
                disabled={!provenIdentity || unavailableLine !== undefined}
                loading={busy}
                onChange={(next) => void toggle(next)}
            />
            {provenIdentity ? (
                subscribed && <p className="text-sm text-grey-1">{t('on')}</p>
            ) : (
                <button type="button" onClick={onSwitchPerson} className="self-start text-sm text-n-1 underline">
                    {t('needsToken')}
                </button>
            )}
        </div>
    )
}
