'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'
import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { currencyDisplayName } from '@/lib/money'
import { CurrencyTag } from './CurrencyTag'

interface CurrencySelectProps {
    value: string
    onChange: (code: string) => void
    currencies: readonly CurrencyInfo[]
    /** Inferred (or contextually obvious) codes, pinned above the alphabetical list. */
    suggested?: readonly string[]
    className?: string
    id?: string
    'aria-label'?: string
    'data-testid'?: string
}

/**
 * Still a native `<select>` underneath, and that is the whole design.
 *
 * The OS picker is faster than anything we could build, is accessible for free, never fights a
 * virtual keyboard on a 390px screen, and is what `selectOption()` drives in the e2e journey. So
 * the select stays — it is just made invisible and stretched over a trigger we draw ourselves,
 * which is how the closed state can carry a drawn currency sign while the open state is still the
 * platform's own wheel. The `peer-focus-visible` classes carry the focus ring across to the drawn
 * trigger, so a keyboard user still sees what they have focused.
 *
 * Suggested currencies are a real `<optgroup>` rather than a hand-drawn divider — the OS renders
 * it as a section header at zero cost, which is what "three or four, then everything else" looks
 * like in a native picker. They are repeated in the full group below on purpose: a shortcut must
 * not make a currency vanish from where someone expects to find it. Duplicate values are legal
 * HTML, and since the trigger is ours, picking either copy looks identical.
 */
export function CurrencySelect({
    value,
    onChange,
    currencies,
    suggested,
    className,
    id,
    ...rest
}: CurrencySelectProps) {
    const t = useTranslations('room.currency')
    const locale = useLocale()
    const reduceMotion = useReducedMotion()

    const byCode = new Map(currencies.map((info) => [info.code, info]))
    const suggestedInfos = (suggested ?? [])
        .map((code) => byCode.get(code))
        .filter((info): info is CurrencyInfo => info !== undefined)
    /** `Brazilian Real (BRL)`. An `<option>` holds text and nothing else, so this is one string.
     *
     *  It used to read `🇧🇷 R$ BRL — Brazilian Real`: a flag, a symbol, a code and a name — four
     *  encodings of one fact, in a control you scroll past two hundred times. The name leads now
     *  because the name is the part a person reads; the code follows in brackets because it is
     *  the part they may be looking for. */
    const optionLabel = (info: CurrencyInfo) => `${currencyDisplayName(info.code, locale, currencies)} (${info.code})`

    /** By name, not by code, because that is now what the row leads with — a list labelled
     *  "Brazilian Real" and ordered B-R-L reads as unsorted. `localeCompare` with the user's
     *  locale so accented names land where that language expects them. */
    const byName = [...currencies].sort((a, b) =>
        optionLabel(a).localeCompare(optionLabel(b), locale, { sensitivity: 'base' })
    )

    return (
        <div className={cn('relative w-full', className)}>
            <select
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="peer absolute inset-0 z-1 h-full w-full cursor-pointer appearance-none opacity-0"
                {...rest}
            >
                {suggestedInfos.length > 0 && (
                    <optgroup label={t('suggested')}>
                        {suggestedInfos.map((info) => (
                            <option key={`suggested-${info.code}`} value={info.code}>
                                {optionLabel(info)}
                            </option>
                        ))}
                    </optgroup>
                )}
                <optgroup label={t('all')}>
                    {byName.map((info) => (
                        <option key={info.code} value={info.code}>
                            {optionLabel(info)}
                        </option>
                    ))}
                </optgroup>
            </select>

            {/* Keyed on the value so a change replays the settle. Transform and opacity only —
                nothing in here can reflow the row it sits in. */}
            <motion.div
                key={value}
                aria-hidden
                initial={reduceMotion ? false : { scale: 0.94, opacity: 0.55 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                className="input flex h-16 w-full items-center justify-between gap-1 pl-4 pr-3 peer-focus-visible:border-primary-1 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-1"
            >
                <CurrencyTag code={value} catalog={currencies} />
                <Icon name="chevron-down" size={20} className="shrink-0 text-n-1" />
            </motion.div>
        </div>
    )
}
