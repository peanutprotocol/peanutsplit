'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { roomProps, track } from '@/lib/analytics'
import { RECAP_FILE_NAME, recapImagePath, type RecapShareTier } from '@/lib/recap'
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
 * Three tiers, same shape as the link share chain in `LinkMoment`, degrading in
 * the order that keeps the artefact intact:
 *   1. `navigator.share({ files })` — the real thing, straight into WhatsApp.
 *   2. the clipboard, as an image — paste it wherever they were going anyway.
 *   3. a download — always available, never silent.
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

            const done = (tier: RecapShareTier) => {
                feedback('whoosh')
                track('recap_shared', roomProps(slug, { tier }))
            }

            /**
             * `canShare` must be probed with the EXACT object that will be passed
             * to `share` — it inspects the payload (file type, size, and which
             * fields are present), so probing `{ files: [] }` or a differently
             * shaped object answers a question nobody asked. Some engines also
             * refuse files alongside `text`/`title`, hence the second, narrower
             * probe rather than giving up on the native sheet.
             */
            const rich = { files: [file], title: t('shareTitle'), text: t('shareText') }
            const filesOnly = { files: [file] }
            const payload = navigator.canShare?.(rich) ? rich : navigator.canShare?.(filesOnly) ? filesOnly : null

            if (payload) {
                try {
                    await navigator.share(payload)
                    done('files')
                    return
                } catch (error) {
                    // Closing the share sheet is a decision, not a failure — falling
                    // through to a download would drop a file they just declined.
                    if (error instanceof DOMException && error.name === 'AbortError') return
                }
            }

            try {
                if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    toast(t('copied'), { duration: TOAST_MS.default })
                    done('clipboard')
                    return
                }
            } catch {
                // Firefox and every non-secure context land here. Next tier.
            }

            const objectUrl = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = objectUrl
            anchor.download = RECAP_FILE_NAME
            anchor.click()
            URL.revokeObjectURL(objectUrl)
            toast(t('downloaded'), { duration: TOAST_MS.state })
            done('download')
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
