'use client'

import { useTranslations } from 'next-intl'
import { AVATARS, AVATAR_KEYS, randomPersonaKey, type AvatarKey } from '@/lib/avatars'
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
 * The grid of alter egos.
 *
 * Names and one-line vibes are visible because the joke is social: a person
 * should be able to announce "I am absolutely the Vampire Penguin", not choose
 * an unlabeled 30px glyph. Random is a real persisted pick, not a name hash or
 * an unstable client-side fallback.
 */
export function AvatarPicker({ name, value, onChange, disabled }: AvatarPickerProps) {
    const t = useTranslations('room.avatar')

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
                    'flex min-h-[88px] min-w-0 items-center gap-2.5 rounded-sm border border-n-1 p-2 text-left transition-transform duration-100',
                    selected ? 'shadow-4 bg-primary-1' : 'bg-white active:translate-y-[2px]',
                    disabled && 'opacity-50'
                )}
            >
                <MemberAvatar name={name} avatar={key} size={54} />
                <span className="min-w-0">
                    <span className="block text-h9 leading-tight">{art.label}</span>
                    <span className="mt-0.5 block text-xs leading-tight text-grey-1">{art.vibe}</span>
                </span>
            </button>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <span className="text-h8 uppercase tracking-wide text-grey-1">{t('titleFor', { name })}</span>

            <button
                type="button"
                disabled={disabled}
                aria-label={t('randomHint')}
                onClick={() => onChange(randomPersonaKey(value))}
                data-testid="avatar-random"
                className={cn(
                    'flex min-h-[54px] w-full items-center justify-between gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform duration-100 active:translate-y-[2px]',
                    disabled && 'opacity-50'
                )}
            >
                <span>
                    <span className="block text-h8">{t('random')}</span>
                    <span className="block text-sm text-grey-1">{t('randomHint')}</span>
                </span>
                <span className="text-h6" aria-hidden="true">
                    ↻
                </span>
            </button>

            <div role="radiogroup" aria-label={t('titleFor', { name })} data-testid="avatar-picker">
                <div className="grid grid-cols-2 gap-2">{AVATAR_KEYS.map(option)}</div>
            </div>

            <span className="text-sm text-grey-1">{t('hint')}</span>
        </div>
    )
}
