'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { BTN_MEDIUM } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { roomProps, track } from '@/lib/analytics'
import { useErrorMessage } from '@/lib/error-messages'
import type { MemberIdentity } from '@/lib/identity'
import type { SettledPushStatus } from '@/lib/push-status'
import { useFeedback } from '@/lib/use-settings'
import { usePush } from '@/lib/use-push'
import { IosInstallSteps } from './IosInstallSteps'

interface PushOptInProps {
    slug: string
    identity: MemberIdentity | null
}

/**
 * Notification opt-in, as one row in the room's settings drawer.
 *
 * Opt-in per room AND per device, which is what the shape of the backend
 * already says: a subscription row is (room, endpoint, member). Nothing here
 * ever asks on its own — the row sits in a drawer somebody deliberately opened.
 *
 * Every state below is a state the device can actually be in, and each renders
 * exactly what can be done about it, which is sometimes nothing.
 */
export function PushOptIn({ slug, identity }: PushOptInProps) {
    const t = useTranslations('push')
    const tInstall = useTranslations('marketing.install')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const { status, error, subscribe, unsubscribe } = usePush()
    const [iosSheetOpen, setIosSheetOpen] = useState(false)
    /**
     * The last settled status, so a subscribe in flight (which reports
     * 'pending') does not make the row someone just tapped disappear from under
     * their finger. `busy` drives the button instead.
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

    const busy = status === 'pending'

    // A browser with no push at all gets no row, no explanation and no apology.
    if (displayed === null || displayed === 'unsupported') return null

    if (displayed === 'ios-needs-pwa') {
        return (
            <Section title={t('title')}>
                <p className="text-sm text-grey-1">{t('iosNeedsPwa')}</p>
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
            </Section>
        )
    }

    // No button: an origin-level block can only be lifted in browser settings,
    // and requestPermission() from here would resolve 'denied' without showing
    // anything. A line of text is the entire honest answer.
    if (displayed === 'denied') {
        return (
            <Section title={t('title')}>
                <p className="text-sm text-grey-1">{t('denied')}</p>
            </Section>
        )
    }

    /**
     * A token-less identity is someone who tapped "that's me" on the join gate.
     * The room believes them — impersonation inside a room is visible and
     * fixable — but the push endpoint does not: binding a delivery channel needs
     * the server-issued member token, or anyone holding the link could make
     * somebody else's phone buzz. So the row renders, disabled, with the reason.
     */
    const provenIdentity = identity?.token ? identity : null

    const enable = async () => {
        if (!provenIdentity?.token) return
        const outcome = await subscribe(slug, provenIdentity.memberId, provenIdentity.token)
        if (outcome === 'subscribed') {
            feedback('pop')
            track('push_optin_accepted', roomProps(slug))
        } else if (outcome === 'denied') {
            track('push_optin_denied', roomProps(slug))
        }
    }

    const disable = async () => {
        if (!provenIdentity?.token) return
        await unsubscribe(slug, provenIdentity.memberId, provenIdentity.token)
    }

    const subscribed = displayed === 'subscribed'

    return (
        <Section title={t('title')}>
            <div className="flex items-center gap-3 rounded-sm border border-n-1 bg-white p-3">
                <span className="min-w-0 flex-1">
                    <span className="block text-h8">{subscribed ? t('on') : t('notifyMe')}</span>
                    <span className="block text-sm text-grey-1">{subscribed ? t('onHint') : t('notifyHint')}</span>
                </span>
                <Button
                    variant={subscribed ? 'transparent' : 'stroke'}
                    size="medium"
                    className={cn(BTN_MEDIUM, 'w-auto shrink-0 justify-center whitespace-nowrap')}
                    disabled={!provenIdentity || busy}
                    loading={busy}
                    onClick={subscribed ? disable : enable}
                    data-testid={subscribed ? 'push-disable' : 'push-enable'}
                >
                    {subscribed ? t('stop') : t('enable')}
                </Button>
            </div>
            {!provenIdentity && <p className="text-sm text-grey-1">{t('needsToken')}</p>}
            {error !== null && (
                <p role="alert" className="text-sm font-bold text-error">
                    {errorMessage(error, t('failed'))}
                </p>
            )}
        </Section>
    )
}

/** The settings drawer's group shape: a small uppercase label over its rows. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            <span className="text-h8 uppercase tracking-wide text-grey-1">{title}</span>
            {children}
        </div>
    )
}
