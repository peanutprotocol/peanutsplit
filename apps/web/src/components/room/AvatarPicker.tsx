'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
    AVATARS,
    AVATAR_CATEGORIES,
    AVATAR_KEYS,
    defaultAvatarArt,
    type AvatarCategory,
    type AvatarKey,
} from '@/lib/avatars'
import { cn } from '@/lib/cn'
import { MemberAvatar } from './MemberAvatar'

interface AvatarPickerProps {
    /** Whose alter ego this is — the stable surprise when nothing is picked. */
    name: string
    /** The member's stored key. Null is the name-derived surprise persona. */
    value: string | null
    onChange: (avatar: string | null) => void
    disabled?: boolean
}

/**
 * The grid of alter egos.
 *
 * Names and one-line vibes are visible because the joke is social: a person
 * should be able to announce "I am absolutely the Vampire Penguin", not choose
 * an unlabeled 30px glyph. Filters keep thirty personas playful rather than
 * turning the drawer into a memory test.
 *
 * The first tile is the name-derived surprise and it stores null — the same
 * "default is the absence of a row value" rule the theme picker follows, so a
 * member who picks and then goes back is byte-identical to one who never picked.
 */
export function AvatarPicker({ name, value, onChange, disabled }: AvatarPickerProps) {
    const t = useTranslations('room.avatar')
    const [filter, setFilter] = useState<'all' | AvatarCategory | 'classic'>('all')
    const surprise = defaultAvatarArt(name)
    const filters = ['all', ...AVATAR_CATEGORIES, 'classic'] as const
    const visibleKeys = useMemo(
        () =>
            AVATAR_KEYS.filter((key) => {
                const art = AVATARS[key]
                if (filter === 'all') return true
                if (filter === 'classic') return art.kind === 'doodle'
                return art.kind === 'persona' && art.category === filter
            }),
        [filter]
    )

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
                    'flex min-h-[74px] min-w-0 items-center gap-2 rounded-sm border border-n-1 p-2 text-left transition-transform duration-100',
                    selected ? 'shadow-4 bg-primary-1' : 'bg-white active:translate-y-[2px]',
                    disabled && 'opacity-50'
                )}
            >
                <MemberAvatar name={name} avatar={key} size={38} />
                <span className="min-w-0">
                    <span className="block text-h9 leading-tight">{art.label}</span>
                    <span className="mt-0.5 block text-xs leading-tight text-grey-1">{art.vibe}</span>
                </span>
            </button>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <div>
                <span className="text-h8 uppercase tracking-wide text-grey-1">{t('titleFor', { name })}</span>
                <p className="mt-1 text-sm text-grey-1">{t('intro')}</p>
            </div>

            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label={t('filterLabel')}>
                {filters.map((next) => (
                    <button
                        key={next}
                        type="button"
                        aria-pressed={filter === next}
                        onClick={() => setFilter(next)}
                        className={cn(
                            'shrink-0 rounded-full border border-n-1 px-3 py-1.5 text-xs font-bold transition-transform active:translate-y-px',
                            filter === next ? 'bg-n-1 text-white' : 'bg-white'
                        )}
                    >
                        {t(`filters.${next}`)}
                    </button>
                ))}
            </div>

            <div role="radiogroup" aria-label={t('titleFor', { name })} data-testid="avatar-picker">
                <button
                    type="button"
                    role="radio"
                    aria-checked={value === null}
                    disabled={disabled}
                    aria-label={t('defaultOption')}
                    onClick={() => onChange(null)}
                    data-testid="avatar-option"
                    data-avatar="default"
                    className={cn(
                        'mb-2 flex min-h-[70px] w-full items-center gap-3 rounded-sm border border-n-1 p-2 text-left transition-transform duration-100',
                        value === null ? 'shadow-4 bg-primary-1' : 'bg-white active:translate-y-[2px]',
                        disabled && 'opacity-50'
                    )}
                >
                    <MemberAvatar name={name} avatar={null} size={42} />
                    <span className="min-w-0 flex-1">
                        <span className="block text-h8">{t('surprise')}</span>
                        <span className="block text-sm text-grey-1">
                            {t('surpriseResult', { name: surprise.label })}
                        </span>
                    </span>
                    <span className="rounded-full border border-n-1 bg-white px-2 py-1 text-xs font-bold">
                        {t('automatic')}
                    </span>
                </button>

                <div className="grid grid-cols-2 gap-2">{visibleKeys.map(option)}</div>
            </div>

            <span className="text-sm text-grey-1">{t('hint')}</span>
        </div>
    )
}
