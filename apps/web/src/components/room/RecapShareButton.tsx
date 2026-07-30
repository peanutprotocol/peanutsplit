'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { roomProps, track } from '@/lib/analytics'
import { RECAP_FILE_NAME, recapImagePath } from '@/lib/recap'
import { shareImageFile } from '@/lib/share-card'
import { TOAST_MS } from '@/lib/toasts'
import { useFeedback } from '@/lib/use-settings'

/**
 * "Share the story" — the second shareable artefact.
 *
 * What leaves the device is the PNG, never the URL: the recap URL contains the
 * room slug, and the slug is the room's credential (`@/lib/recap` has the whole
 * argument). The card prints the domain instead, so the acquisition path
 * survives without exposing the ledger.
 *
 * The three-tier chain itself lives in `lib/share-card.ts` — every card in the
 * app degrades the same way, so it degrades in one place. This button keeps the
 * fetch inside the tap rather than prefetching on mount, which the achievement
 * buttons do not: the recap page has one share button and a visible spinner,
 * and moving its fetch is a behaviour change this wave has no reason to make.
 */
export function RecapShareButton({ slug, variant = 'primary' }: { slug: string; variant?: 'primary' | 'stroke' }) {
    const t = useTranslations('room.recap')
    const feedback = useFeedback()
    const [busy, setBusy] = useState(false)

    const share = useCallback(async () => {
        if (busy) return
        setBusy(true)
        try {
            const response = await fetch(recapImagePath(slug), { cache: 'no-store' })
            if (!response.ok) throw new Error(`recap image ${response.status}`)
            const blob = await response.blob()
            const file = new File([blob], RECAP_FILE_NAME, { type: blob.type || 'image/png' })

            const tier = await shareImageFile(file, { title: t('shareTitle'), text: t('shareText') })
            if (!tier) return

            if (tier === 'clipboard') toast(t('copied'), { duration: TOAST_MS.default })
            if (tier === 'download') toast(t('downloaded'), { duration: TOAST_MS.state })
            feedback('whoosh')
            track('recap_shared', roomProps(slug, { tier }))
        } catch {
            feedback('error', { haptic: 'error' })
            toast(t('shareFailed'), { duration: TOAST_MS.actionable })
        } finally {
            setBusy(false)
        }
    }, [busy, slug, feedback, t])

    return (
        <Button
            variant={variant}
            shadowSize={variant === 'primary' ? '4' : undefined}
            icon="share"
            loading={busy}
            onClick={() => void share()}
            className={variant === 'primary' ? 'justify-center text-h6' : 'justify-center'}
            data-testid="share-recap"
        >
            {busy ? t('sharing') : t('share')}
        </Button>
    )
}
