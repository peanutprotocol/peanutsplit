'use client'

import { useTranslations } from 'next-intl'
import { AVATAR_KEYS } from '@/lib/avatars'
import { cn } from '@/lib/cn'
import { MemberAvatar } from './MemberAvatar'

interface AvatarPickerProps {
    /** Whose face this is — the fallback drawing when nothing is picked. */
    name: string
    /** The member's stored key. Null is the name-derived portrait. */
    value: string | null
    onChange: (avatar: string | null) => void
    disabled?: boolean
}

/**
 * The grid of faces, yours only.
 *
 * A grid rather than the theme picker's scrolling row: a palette is a flick
 * through eight tints where the room repaints behind the sheet, but choosing a
 * face is comparing twenty drawings against each other, and anything that puts
 * some of them off-screen turns that into a hunt.
 *
 * The first tile is the name-derived portrait and it stores null — the same
 * "default is the absence of a row value" rule the theme picker follows, so a
 * member who picks and then goes back is byte-identical to one who never picked.
 */
export function AvatarPicker({ name, value, onChange, disabled }: AvatarPickerProps) {
    const t = useTranslations('room.avatar')

    return (
        <div className="flex flex-col gap-2">
            <span className="text-h8 uppercase tracking-wide text-grey-1">{t('title')}</span>
            <div role="radiogroup" aria-label={t('title')} data-testid="avatar-picker" className="flex flex-wrap gap-2">
                {[null, ...AVATAR_KEYS].map((key) => {
                    const selected = key === value
                    return (
                        <button
                            key={key ?? 'default'}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={disabled}
                            aria-label={key ? t('option', { name: key }) : t('defaultOption')}
                            onClick={() => onChange(key)}
                            data-testid="avatar-option"
                            data-avatar={key ?? 'default'}
                            className={cn(
                                'flex size-11 items-center justify-center rounded-sm border border-n-1 transition-transform duration-100',
                                selected ? 'shadow-4 bg-primary-1' : 'bg-white active:translate-y-[2px]',
                                disabled && 'opacity-50'
                            )}
                        >
                            <MemberAvatar name={name} avatar={key} size={30} />
                        </button>
                    )
                })}
            </div>
            <span className="text-sm text-grey-1">{t('hint')}</span>
        </div>
    )
}
