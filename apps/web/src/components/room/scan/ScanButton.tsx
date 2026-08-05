'use client'

/**
 * The way in: a camera next to the amount field.
 *
 * It lives beside the amount rather than at the top of the drawer because that
 * is the moment the shortcut is worth taking — you are about to type a number
 * off a piece of paper you are already holding. A row of its own at the top
 * would read as a mode ("scan mode vs manual mode"), which it isn't.
 *
 * The button opens the scanner rather than a file input: camera permission and
 * capture belong on the full-screen camera surface, where upload remains an
 * explicit fallback instead of a browser-dependent menu.
 */

import { useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'
import { useFeedback } from '@/lib/use-settings'

export function ScanButton({ onOpen }: { onOpen: () => void }) {
    const t = useTranslations('room.scan')
    const feedback = useFeedback()

    return (
        <button
            type="button"
            onClick={() => {
                feedback('blip')
                onOpen()
            }}
            data-testid="scan-bill"
            aria-label={t('cta')}
            className="relative flex size-11 shrink-0 items-center justify-center rounded-sm border border-dashed border-n-1 bg-primary-3 transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px]"
        >
            <Icon name="camera" size={19} aria-hidden="true" />
            <Icon name="sparkles" size={10} aria-hidden="true" className="absolute right-1 top-1 text-primary-2" />
        </button>
    )
}
