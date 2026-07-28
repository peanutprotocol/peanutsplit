'use client'

import { Fragment } from 'react'
import NumberFlow from '@number-flow/react'
import { useLocale } from 'next-intl'
import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { currencyInfo, formatMoneyParts, minorToNumber, moneyFormatOptions } from '@/lib/money'

interface MoneyProps {
    /** Minor units, as a string, exactly as the API gave it. */
    minor: string
    currency: string
    catalog?: readonly CurrencyInfo[]
    className?: string
    /** Drop the sign and render the magnitude only (the label carries the direction). */
    absolute?: boolean
}

/**
 * Static amount. Everything money-shaped is tabular so columns never jitter.
 *
 * The symbol is its own run: a little smaller, lifted off the baseline, dialled back — so an
 * amount reads as a quantity *of something* rather than as a string that happens to start with a
 * squiggle. Sized in `em` and coloured with the parent's own ink at reduced opacity rather than a
 * fixed grey, because the same component renders inside a red debt, a green credit and a plain
 * black row, and a hardcoded colour would be wrong in two of the three.
 */
const SYMBOL_CLASS = 'relative -top-[0.08em] text-[0.78em] opacity-70'

export function Money({ minor, currency, catalog, className, absolute }: MoneyProps) {
    const locale = useLocale()
    const value = absolute && minor.startsWith('-') ? minor.slice(1) : minor
    const parts = formatMoneyParts(value, currency, catalog, locale)
    return (
        <span className={cn('tabular-nums', className)}>
            {parts.map((part, index) =>
                part.type === 'currency' ? (
                    <span key={index} className={SYMBOL_CLASS}>
                        {part.value}
                    </span>
                ) : (
                    <Fragment key={index}>{part.value}</Fragment>
                )
            )}
        </span>
    )
}

/**
 * Counting, not flickering.
 *
 * NumberFlow's stock timings are tuned for dashboards that tick every second;
 * at that speed a balance jumping from −30.00 to +11.48 reads as a glitch. 720ms
 * on a decelerating curve is long enough for the eye to follow the digits and
 * short enough that nobody waits for it. The digits stay put horizontally
 * (`transformTiming` is the same curve) so the row never jitters.
 */
const COUNT_TIMING: EffectTiming = { duration: 720, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
const FADE_TIMING: EffectTiming = { duration: 380, easing: 'ease-out' }

/**
 * Animated amount — balances *count* to their new value when an expense lands
 * (signature moment #3). NumberFlow needs a JS number, which is the one place a
 * float is allowed near money: this value is never written back anywhere.
 */
export function AnimatedMoney({ minor, currency, catalog, className, absolute }: MoneyProps) {
    const locale = useLocale()
    const info = currencyInfo(currency, catalog)
    const raw = minorToNumber(minor, info.decimals)
    const value = absolute ? Math.abs(raw) : raw
    return (
        <NumberFlow
            value={value}
            // `locales` and `format` together are what make this agree with <Money/>: left to
            // itself NumberFlow formats in the *browser's* locale, which on a Spanish phone
            // reading an English page put "12.34" and "12,34" on the same screen. The symbol
            // now comes from the currency style rather than a manual prefix, so its placement
            // (before in en, after in es) is localised too.
            locales={locale}
            format={moneyFormatOptions(info)}
            spinTiming={COUNT_TIMING}
            transformTiming={COUNT_TIMING}
            opacityTiming={FADE_TIMING}
            respectMotionPreference
            className={cn('tabular-nums', className)}
        />
    )
}
