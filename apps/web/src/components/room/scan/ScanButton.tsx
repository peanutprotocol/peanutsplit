'use client'

/**
 * The way in: a camera next to the amount field.
 *
 * It lives beside the amount rather than at the top of the drawer because that
 * is the moment the shortcut is worth taking — you are about to type a number
 * off a piece of paper you are already holding. A row of its own at the top
 * would read as a mode ("scan mode vs manual mode"), which it isn't.
 *
 * `capture="environment"` asks the phone for the back camera; on a desktop the
 * attribute is ignored and the same input opens a file picker, which is what a
 * screenshot of a bill wants anyway. The accept list is `image/*` on purpose,
 * not the three types the server takes: HEIC has to be selectable for the
 * canvas step to convert it (see `scan-image.ts`), and a narrow filter would
 * grey out every photo in an iPhone's camera roll.
 */

import { useId, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'
import { useFeedback } from '@/lib/use-settings'

export function ScanButton({ onFile }: { onFile: (file: File) => void }) {
    const t = useTranslations('room.scan')
    const feedback = useFeedback()
    const inputRef = useRef<HTMLInputElement>(null)
    const inputId = useId()

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    feedback('blip')
                    inputRef.current?.click()
                }}
                data-testid="scan-bill"
                aria-label={t('cta')}
                className="flex min-h-11 items-center gap-2 self-start rounded-sm border border-dashed border-n-1 bg-white px-3 py-2 text-h8 transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px]"
            >
                <Icon name="camera" size={18} />
                {t('cta')}
            </button>
            <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    // Cleared immediately so picking the SAME photo twice still
                    // fires a change event — otherwise a retry after a failed
                    // scan silently does nothing.
                    event.target.value = ''
                    if (file) onFile(file)
                }}
            />
        </>
    )
}
