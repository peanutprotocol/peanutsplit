'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import {
    CARD_FILE_NAME,
    achievementCardPath,
    type AchievementType,
    type AlterEgoCardParams,
    type CardKind,
} from '@/lib/achievements-contract'
/** Every card except the invite, which is not an achievement and shares the room link instead. */
export type ShareableCardKind = Exclude<CardKind, 'invite'>
import { achievementProps, track } from '@/lib/analytics'
import { shareImageFile, useSharePng } from '@/lib/share-card'
import { TOAST_MS } from '@/lib/toasts'
import { useFeedback } from '@/lib/use-settings'

/**
 * One share button for every card in the app.
 *
 * The PNG is prefetched on mount, so the tap itself is synchronous — `navigator.share` needs
 * transient user activation and an `await fetch` inside the gesture loses it on iOS.
 *
 * The native payload carries `{ files }` only. That is the whole privacy design
 * in one object: the room link is the room's credential, so it rides only in the
 * deliberate invite flow. The card prints `peanutsplit.com` instead, which is
 * the acquisition path that survives being forwarded.
 *
 * Sound and haptics fire on the tap, never on appearance.
 *
 * The visible label names the image. A screen reader gets the particular card's
 * name (`shareLabel.<kind>`), because a settled recap can carry five of these.
 */
export function CardShareButton({
    slug,
    kind,
    type,
    params,
    variant = 'primary',
}: {
    slug: string
    kind: ShareableCardKind
    type: AchievementType
    params?: AlterEgoCardParams
    variant?: 'primary' | 'stroke'
}) {
    const t = useTranslations('room.achievements')
    const feedback = useFeedback()
    const [busy, setBusy] = useState(false)
    const { file } = useSharePng(achievementCardPath(slug, kind, params), CARD_FILE_NAME[kind])

    const share = useCallback(async () => {
        if (busy) return
        setBusy(true)
        try {
            track('achievement_share_opened', achievementProps(type))
            feedback('whoosh')

            if (!file) throw new Error('achievement image is not ready')

            const tier = await shareImageFile(file)
            if (!tier) return
            if (tier === 'clipboard') toast(t('copied'), { duration: TOAST_MS.default })
            if (tier === 'download') toast(t('downloaded'), { duration: TOAST_MS.state })
            track('achievement_shared', achievementProps(type, tier))
        } catch (error) {
            // Closing the sheet is a decision, not a failure.
            if (error instanceof DOMException && error.name === 'AbortError') return
            feedback('error', { haptic: 'error' })
            toast(t('shareFailed'), { duration: TOAST_MS.actionable })
        } finally {
            setBusy(false)
        }
    }, [busy, feedback, file, t, type])

    return (
        <Button
            variant={variant}
            shadowSize={variant === 'primary' ? '4' : undefined}
            icon="share"
            loading={busy}
            onClick={() => void share()}
            className="justify-center"
            aria-label={t(`shareLabel.${kind}`)}
            data-testid={`share-card-${kind}`}
        >
            {busy ? t('sharing') : t('share')}
        </Button>
    )
}
