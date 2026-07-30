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
 * to find the drawing you want. They now live on ONE caption, directly above the
 * grid, describing the current pick and following the selection as it moves. Its
 * height is reserved and its text is clamped, because a caption that grows from
 * one line to two shifts the grid out from under the finger that is still
 * choosing.
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

            {/* Above the grid and PINNED to the top of it. The grid is 28 tiles —
                992px, against a 571px sheet — so a caption placed after it sat
                ~600px below the last tile anyone could see: scrolling to read it
                put every tile off screen, which is the whole thing it exists for.
                Sticky rather than merely first, because the tiles at the bottom of
                the grid have the same problem in reverse.

                It still takes its own space in the flow, so the grid does not move
                when the pick changes — and the text can never take a third line,
                which is the other way this could shift the grid under a finger. */}
            <p
                aria-live="polite"
                className="sticky top-0 z-10 line-clamp-2 min-h-10 bg-background pb-1 text-sm text-grey-1"
                data-testid="avatar-caption"
            >
                {t('caption', { label: current.label, vibe: current.vibe })}
            </p>

            <div role="radiogroup" aria-label={t('titleFor', { name })} data-testid="avatar-picker">
                <div className="grid grid-cols-3 gap-2">{AVATAR_KEYS.map(option)}</div>
            </div>
        </div>
    )
}
