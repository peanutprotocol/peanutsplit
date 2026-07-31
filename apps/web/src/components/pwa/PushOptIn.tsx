'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { SettingToggle } from '@/components/ui/SettingToggle'
import { StateRow } from '@/components/ui/StateRow'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { roomProps, track } from '@/lib/analytics'
import { useErrorMessage } from '@/lib/error-messages'
import type { MemberIdentity } from '@/lib/identity'
import type { SettledPushStatus } from '@/lib/push-status'
import { TOAST_MS } from '@/lib/toasts'
import { useFeedback } from '@/lib/use-settings'
import { usePush } from '@/lib/use-push'
import { IosInstallSteps } from './IosInstallSteps'

interface PushOptInProps {
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
 * At most one line ever renders under the toggle, and in the three states the
 * toggle cannot honestly work — iOS in a tab, an origin-level block, and a check
 * that could not reach the server — that line REPLACES it, inside a labelled row.
 * A live switch that does nothing, or that claims a position nobody verified, is
 * worse than no switch.
 */
export function PushOptIn({ slug, roomName, identity, onSwitchPerson }: PushOptInProps) {
    const t = useTranslations('push')
    const tInstall = useTranslations('marketing.install')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const { status, error, subscribe, unsubscribe } = usePush(slug)
    const [iosSheetOpen, setIosSheetOpen] = useState(false)
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

    // A browser with no push at all gets no row, no explanation and no apology.
    if (displayed === null || displayed === 'unsupported') return null

    if (displayed === 'ios-needs-pwa') {
        return (
            <div className="flex flex-col gap-2">
                <StateRow label={t('label')} line={t('iosNeedsPwa')} />
                <button
                    type="button"
                    onClick={() => setIosSheetOpen(true)}
                    className="self-start text-sm text-black underline"
                >
                    {t('iosHow')}
                </button>
                <Drawer open={iosSheetOpen} onOpenChange={setIosSheetOpen}>
                    <DrawerContent className={drawerContentClass}>
                        <DrawerHeader className={drawerHeaderClass}>
                            <DrawerTitle className="text-h5">{tInstall('ios.title')}</DrawerTitle>
                            <DrawerDescription>{tInstall('ios.body')}</DrawerDescription>
                        </DrawerHeader>
                        <DrawerBody>
                            <IosInstallSteps />
                            <DrawerActions>
                                <Button
                                    variant="stroke"
                                    className="justify-center"
                                    onClick={() => setIosSheetOpen(false)}
                                >
                                    {tInstall('ios.done')}
                                </Button>
                            </DrawerActions>
                        </DrawerBody>
                    </DrawerContent>
                </Drawer>
            </div>
        )
    }

    // No toggle: an origin-level block can only be lifted in browser settings,
    // and requestPermission() from here would resolve 'denied' without showing
    // anything. A labelled line is the entire honest answer.
    if (displayed === 'denied') return <StateRow label={t('label')} line={t('denied')} />

    // No toggle either: the per-room row lives on the server and the check for it
    // did not come back. A switch has to sit somewhere, and both positions would
    // be a claim — "off" is the one that contradicts a phone that is still
    // buzzing. Say what happened; the next sheet open asks again.
    if (displayed === 'unknown') return <StateRow label={t('label')} line={t('unknown')} />

    /**
     * Legacy tokenless identities can still read the room, but the push endpoint
     * cannot bind a delivery channel without a member token. New "that's me"
     * claims receive the roster entry's existing token; this fallback remains
     * for old localStorage records and unavailable storage.
     */
    const provenIdentity = identity?.token ? identity : null
    const subscribed = displayed === 'subscribed'

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
                testId={subscribed ? 'push-disable' : 'push-enable'}
                checked={subscribed}
                disabled={!provenIdentity || busy}
                onChange={(next) => void toggle(next)}
            />
            {provenIdentity ? (
                subscribed && <p className="text-sm text-grey-1">{t('on')}</p>
            ) : (
                <button type="button" onClick={onSwitchPerson} className="self-start text-sm text-black underline">
                    {t('needsToken')}
                </button>
            )}
        </div>
    )
}
