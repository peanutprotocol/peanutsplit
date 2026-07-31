'use client'

import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import { cn } from '@/lib/cn'
import { DEFAULT_THEME_KEY, ROOM_THEMES } from '@/lib/themes'

interface ThemePickerProps {
    /** The room's stored key — null is the default palette. */
    value: string | null
    onChange: (theme: string | null) => void
    disabled?: boolean
}

/**
 * Eight swatches in a row you scroll. A grid of named cards would be more
 * explicit and would also be the biggest thing in the settings sheet, for a
 * decision that is pure taste — swatches let you flick through the palette and
 * watch the room repaint behind the sheet, which is the actual feedback. That
 * repaint is also why there is no sentence under them saying the room can see
 * it: the room is visibly seeing it.
 *
 * The default palette is stored as null, so tapping `classic` clears the column
 * rather than writing the string. One row per room, one meaning per value.
 */
export function ThemePicker({ value, onChange, disabled }: ThemePickerProps) {
    const t = useTranslations('room.theme')
    const selected = value ?? DEFAULT_THEME_KEY

    return (
        <div className="flex flex-col gap-2">
            {/* No `text-grey-1` here: this card wears the room's own field colour
                (`SettingsSheet`'s `room-card` section), and grey-1 fails 4.5:1 on
                five of the eight fields including the default. Every field is
                built to carry black ink (see the contrast note in `lib/themes.ts`)
                — inheriting it is what the `PEOPLE` label two rows down already does. */}
            <span className="text-h8 uppercase tracking-wide">{t('title')}</span>
            <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {ROOM_THEMES.map((theme) => {
                    // `t.has`-free: every name lives under `names.<key>` and the
                    // catalog parity audit is what guarantees all three locales
                    // have it, exactly like the error-code map.
                    const name = t(`names.${theme.nameKey}`)
                    const isSelected = theme.key === selected
                    return (
                        <li key={theme.key}>
                            <button
                                type="button"
                                disabled={disabled}
                                aria-pressed={isSelected}
                                aria-label={t('pick', { name })}
                                title={name}
                                data-testid="theme-swatch"
                                data-theme={theme.key}
                                onClick={() => onChange(theme.key === DEFAULT_THEME_KEY ? null : theme.key)}
                                className={cn(
                                    'flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 text-h7 transition-transform duration-100',
                                    isSelected ? 'shadow-4' : 'active:translate-x-[2px] active:translate-y-[2px]',
                                    disabled && 'opacity-50'
                                )}
                                // Inline because the catalog is data: eight
                                // Tailwind arbitrary classes would have to be
                                // safelisted, and adding a ninth theme would
                                // then be a two-file change.
                                style={{ backgroundColor: theme.field }}
                            >
                                <Doodle name={theme.motif} size={23} weight={1.8} />
                            </button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
