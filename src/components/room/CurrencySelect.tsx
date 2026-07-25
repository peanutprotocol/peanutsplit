'use client'

import { Icon } from '@/components/ui/Icon'
import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'

interface CurrencySelectProps {
    value: string
    onChange: (code: string) => void
    currencies: readonly CurrencyInfo[]
    className?: string
    id?: string
    'aria-label'?: string
    'data-testid'?: string
}

/**
 * A native `<select>` on purpose: the OS picker is faster, accessible for free,
 * and never fights a virtual keyboard on a 390px screen.
 */
export function CurrencySelect({ value, onChange, currencies, className, id, ...rest }: CurrencySelectProps) {
    return (
        <div className={cn('relative w-full', className)}>
            <select
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="input h-16 w-full appearance-none pr-12"
                {...rest}
            >
                {currencies.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                        {currency.code} · {currency.name}
                    </option>
                ))}
            </select>
            <Icon
                name="chevron-down"
                size={20}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-n-1"
            />
        </div>
    )
}
