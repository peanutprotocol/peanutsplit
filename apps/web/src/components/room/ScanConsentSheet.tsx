'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

/**
 * The one-time question before a receipt photo leaves the device, shown inside the scan overlay.
 *
 * It lives in the overlay, not in a second drawer over the expense sheet, so it inherits the
 * overlay's focus trap and inert handling, and it covers every way into a scan (the scan button
 * and a shared photo) with one gate. Nothing in the overlay starts the camera or the upload while
 * this is on screen. "Not now" closes the overlay, which returns the person to the expense drawer.
 */
export function ScanConsentSheet({ onAllow, onNotNow }: { onAllow: () => void; onNotNow: () => void }) {
    const t = useTranslations('room.scan.consent')

    return (
        <section
            data-testid="scan-consent"
            aria-labelledby="scan-consent-title"
            className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-end gap-4 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
        >
            <h2 id="scan-consent-title" className="text-h5">
                {t('title')}
            </h2>
            <p className="text-sm text-grey-1">{t('body')}</p>
            <div className="flex flex-col gap-3">
                <Button
                    variant="primary"
                    shadowSize="4"
                    onClick={onAllow}
                    className="justify-center"
                    data-testid="scan-consent-allow"
                >
                    {t('allow')}
                </Button>
                <Button
                    variant="stroke"
                    onClick={onNotNow}
                    className="justify-center"
                    data-testid="scan-consent-not-now"
                >
                    {t('notNow')}
                </Button>
            </div>
        </section>
    )
}
