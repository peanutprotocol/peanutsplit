'use client'

import NumberFlow from '@number-flow/react'
import { twMerge } from 'tailwind-merge'
import type { CurrencyInfo } from '@/lib/api-types'
import { currencyInfo, formatMoney, minorToNumber } from '@/lib/money'

interface MoneyProps {
    /** Minor units, as a string, exactly as the API gave it. */
    minor: string
    currency: string
    catalog?: readonly CurrencyInfo[]
    className?: string
    /** Drop the sign and render the magnitude only (the label carries the direction). */
    absolute?: boolean
}

/** Static amount. Everything money-shaped is tabular so columns never jitter. */
export function Money({ minor, currency, catalog, className, absolute }: MoneyProps) {
    const value = absolute && minor.startsWith('-') ? minor.slice(1) : minor
    return <span className={twMerge('tabular-nums', className)}>{formatMoney(value, currency, catalog)}</span>
}

/**
 * Animated amount — balances *count* to their new value when an expense lands
 * (signature moment #3). NumberFlow needs a JS number, which is the one place a
 * float is allowed near money: this value is never written back anywhere.
 */
export function AnimatedMoney({ minor, currency, catalog, className, absolute }: MoneyProps) {
    const info = currencyInfo(currency, catalog)
    const raw = minorToNumber(minor, info.decimals)
    const value = absolute ? Math.abs(raw) : raw
    return (
        <NumberFlow
            value={value}
            prefix={info.symbol}
            format={{ minimumFractionDigits: info.decimals, maximumFractionDigits: info.decimals }}
            className={twMerge('tabular-nums', className)}
        />
    )
}
