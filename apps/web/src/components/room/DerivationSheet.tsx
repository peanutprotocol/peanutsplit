'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Divider } from '@/components/ui/Divider'
import type { CurrencyInfo } from '@/lib/api-types'
import type { DerivationLine, DerivationLineKind, MemberDerivation } from '@/lib/balance-derivation'
import { dayLabel } from '@/lib/dates'
import { Money } from './Money'

interface DerivationSheetProps {
    derivation: MemberDerivation
    /** Room currency — every line is already converted into it. */
    currency: string
    currencies: readonly CurrencyInfo[]
    /** The reader, so a line they fronted reads "you paid" and not their own name back. */
    meId?: string
}

/**
 * Grouped, not chronological-in-one-list, because the three groups answer three different
 * questions ("what did I put in", "what was my share", "what has already moved"). Inside a
 * group the order is the running order the derivation produced, so a line can be followed
 * back to the expense row it came from.
 */
const SECTIONS: { id: 'paid' | 'share' | 'settled'; kinds: DerivationLineKind[] }[] = [
    { id: 'paid', kinds: ['paid'] },
    { id: 'share', kinds: ['share'] },
    { id: 'settled', kinds: ['settlement-sent', 'settlement-received'] },
]

/**
 * Each key written out literally rather than built from `section.id`: a computed
 * `t(\`${id}Title\`)` would cost `pnpm i18n:audit` its ability to prove all three exist in
 * all three catalogs, which is the only thing standing between a missing translation and a
 * dotted identifier shipping to a user.
 */
const sectionTitle = (id: 'paid' | 'share' | 'settled', t: (key: string) => string): string =>
    id === 'paid' ? t('paidTitle') : id === 'share' ? t('shareTitle') : t('settledTitle')

/**
 * The derivation itself: every row that moved this balance, and the sum it comes to.
 *
 * Rendered for the member whose sheet is open and, unchanged, for the other end of a
 * suggested payment — the pair view is two of these, not a third kind of maths.
 */
export function DerivationSheet({ derivation, currency, currencies, meId }: DerivationSheetProps) {
    const t = useTranslations('derivation')
    const tDates = useTranslations('dates')
    const locale = useLocale()

    const when = (line: DerivationLine) =>
        dayLabel(line.date, { locale, today: tDates('today'), yesterday: tDates('yesterday') })

    return (
        <div className="flex flex-col gap-2">
            {derivation.lines.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-6 text-center">
                    <p className="text-h7">{t('emptyTitle')}</p>
                    <p className="max-w-[18rem] text-sm text-grey-1">{t('emptyBody')}</p>
                </div>
            ) : (
                SECTIONS.map((section) => {
                    const lines = derivation.lines.filter((line) => section.kinds.includes(line.kind))
                    if (lines.length === 0) return null
                    return (
                        <div key={section.id} className="flex flex-col">
                            <Divider
                                text={sectionTitle(section.id, t)}
                                className="py-1"
                                textClassname="whitespace-nowrap text-h8 uppercase tracking-wide text-grey-1"
                            />
                            <ul className="flex flex-col">
                                {lines.map((line) => {
                                    const party = line.partyName ?? t('someone')
                                    const primary =
                                        line.kind === 'settlement-sent'
                                            ? t('sentTo', { name: party })
                                            : line.kind === 'settlement-received'
                                              ? t('receivedFrom', { name: party })
                                              : (line.title ?? t('someone'))
                                    const positive = !line.amountMinor.startsWith('-')
                                    return (
                                        <li
                                            key={line.key}
                                            data-testid="derivation-line"
                                            data-kind={line.kind}
                                            // Raw minor units, so a test asserts the derivation and
                                            // not a locale-formatted string.
                                            data-amount={line.amountMinor}
                                            className="flex items-start justify-between gap-3 border-b border-dashed border-n-4 py-2 last:border-b-0"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-h8">{primary}</span>
                                                <span className="block text-h10 text-grey-1">
                                                    {line.kind === 'share'
                                                        ? `${line.partyId === meId ? t('paidByYou') : t('paidBy', { name: party })} · ${when(line)}`
                                                        : when(line)}
                                                </span>
                                            </span>
                                            <span className="flex shrink-0 flex-col items-end">
                                                {/* The minus sign comes out of the locale's own number
                                                    formatting; only the plus has to be added. */}
                                                <span className="text-h8 tabular-nums">
                                                    {positive && '+'}
                                                    <Money
                                                        minor={line.amountMinor}
                                                        currency={currency}
                                                        catalog={currencies}
                                                    />
                                                </span>
                                                {/* A foreign expense counts at its base amount — that is
                                                    what the balance is made of — with the receipt it was
                                                    converted from underneath. */}
                                                {line.original && (
                                                    <span className="text-h10 text-grey-1">
                                                        ~{' '}
                                                        <Money
                                                            minor={line.original.amountMinor}
                                                            currency={line.original.currency}
                                                            catalog={currencies}
                                                        />
                                                    </span>
                                                )}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )
                })
            )}

            {/* The reconciliation line, and the whole promise of the sheet: the lines above
                add up to the number on the card you tapped. */}
            <div
                data-testid="derivation-total"
                data-total={derivation.totalMinor}
                className="mt-1 flex items-center justify-between rounded-sm border border-dashed border-n-1 p-3"
            >
                <span className="text-h8 uppercase tracking-wide text-grey-1">{t('total')}</span>
                <Money
                    minor={derivation.totalMinor}
                    currency={currency}
                    catalog={currencies}
                    className="text-h6 tabular-nums"
                />
            </div>
        </div>
    )
}
