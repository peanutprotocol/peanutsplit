'use client'

import { useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'
import { AVATARS, AVATAR_KEYS, avatarArt, randomPersonaKey, type AvatarKey } from '@/lib/avatars'
import { cn } from '@/lib/cn'
import { MemberAvatar } from './MemberAvatar'

interface AvatarPickerProps {
    name: string
    /** Null is possible only while legacy rows are being backfilled. */
    value: string | null
    onChange: (avatar: string | null) => void
    disabled?: boolean
}

/**
 * The grid of characters.
 *
 * The vibes used to sit on all 28 tiles — 88 words of joke you have to read past
 * to find the drawing you want. They now live on ONE caption under the grid,
 * describing the current pick and following the selection as it moves. Its
 * height is reserved, because a caption that grows from one line to two shifts
 * the grid out from under the finger that is still choosing.
 *
 * The selected tile is marked, never enlarged, for the same reason.
 */
export function AvatarPicker({ name, value, onChange, disabled }: AvatarPickerProps) {
    const t = useTranslations('room.avatar')
    const current = avatarArt(value)

    const option = (key: AvatarKey) => {
        const art = AVATARS[key]
        const selected = key === value
        return (
            <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                aria-label={t('option', { name: art.label })}
                onClick={() => onChange(key)}
                data-testid="avatar-option"
                data-avatar={key}
                className={cn(
                    'flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-sm border border-n-1 p-2 text-center transition-transform duration-100',
                    selected ? 'shadow-4 bg-primary-1' : 'bg-white active:translate-y-[2px]',
                    disabled && 'opacity-50'
                )}
            >
                <MemberAvatar name={name} avatar={key} size={44} />
                <span className="w-full truncate text-xs leading-tight">{art.label}</span>
            </button>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(randomPersonaKey(value))}
                data-testid="avatar-random"
                className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform duration-100 active:translate-y-[2px]',
                    disabled && 'opacity-50'
                )}
            >
                <span className="text-h8">{t('random')}</span>
                <Icon name="sparkles" size={24} aria-hidden="true" />
            </button>

            <div role="radiogroup" aria-label={t('titleFor', { name })} data-testid="avatar-picker">
                <div className="grid grid-cols-3 gap-2">{AVATAR_KEYS.map(option)}</div>
            </div>

            {/* Two lines of room, always — the caption is the only place the vibes
                survive and it must not be able to move the grid. */}
            <p aria-live="polite" className="min-h-10 text-sm text-grey-1" data-testid="avatar-caption">
                {t('caption', { label: current.label, vibe: current.vibe })}
            </p>
        </div>
    )
}
