'use client'

import { cn } from '@/lib/cn'
import { Icon } from './Icon'

/**
 * One line of settings: a label, the value it currently holds, and a tap that
 * opens whatever can change it.
 *
 * The value is the reason this shape replaced four expanded sections. A row that
 * reads "Export · CSV · JSON" says everything the old three-sentence block said,
 * in the width of the thing it describes, and the sheet behind it only opens for
 * the person who actually wants it.
 */
export function SettingRow({
    label,
    value,
    onClick,
    testId,
    trailing,
    className,
}: {
    label: string
    /** What the row currently holds. Right-aligned, truncated, never wrapped. */
    value?: string
    onClick: () => void
    testId: string
    /** A second control that is NOT the row's own action — the link row's share
     *  button. Rendered outside the button so it is its own tap target. */
    trailing?: React.ReactNode
    className?: string
}) {
    return (
        <div className={cn('flex items-stretch gap-2', className)}>
            <button
                type="button"
                onClick={onClick}
                data-testid={testId}
                className="flex min-h-11 flex-1 items-center gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform duration-100 active:translate-y-[2px]"
            >
                <span className="shrink-0 text-h8">{label}</span>
                {value && <span className="min-w-0 flex-1 truncate text-right text-sm text-grey-1">{value}</span>}
                <Icon name="chevron-right" size={16} className={cn('shrink-0', !value && 'ml-auto')} />
            </button>
            {trailing}
        </div>
    )
}
