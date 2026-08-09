'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { RoomState } from '@/lib/api-types'
import { EXPENSE_CATEGORY_IDS, type ExpenseCategoryId } from '@/lib/expense-category'
import { roomHistoryStats, type RoomHistoryMonthTotal } from '@/lib/room-history-stats'
import { Money } from './Money'

const MAX_MONTHS = 6

const categoryKey: Record<ExpenseCategoryId, string> = {
    'food-drink': 'foodDrink',
    transport: 'transport',
    'travel-stays': 'travelStays',
    'home-bills': 'homeBills',
    shopping: 'shopping',
    'entertainment-leisure': 'entertainment',
    'health-wellness': 'health',
    'family-education': 'familyEducation',
    'work-services': 'workServices',
    'tech-connectivity': 'techConnectivity',
    'money-admin': 'moneyAdmin',
    'gifts-giving': 'gifts',
    other: 'other',
}

const knownCategories = new Set<string>(EXPENSE_CATEGORY_IDS)

const shiftMonth = (month: string, delta: number): string => {
    const [year, monthIndex] = month.split('-').map(Number)
    const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1))
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Fill quiet calendar months so a month-over-month comparison never jumps
 * from, say, January straight to March and calls those adjacent months. */
export const recentRoomMonths = (totals: readonly RoomHistoryMonthTotal[]): RoomHistoryMonthTotal[] => {
    const last = totals.at(-1)
    const first = totals.at(0)
    if (!last || !first) return []

    const byMonth = new Map(totals.map((total) => [total.month, total]))
    let start = first.month
    const sixMonthStart = shiftMonth(last.month, -(MAX_MONTHS - 1))
    if (start < sixMonthStart) start = sixMonthStart

    const months: RoomHistoryMonthTotal[] = []
    for (let month = start; month <= last.month; month = shiftMonth(month, 1)) {
        months.push(byMonth.get(month) ?? { month, amountMinor: '0', expenseCount: 0 })
    }
    return months
}

const dateForMonth = (month: string): Date => new Date(`${month}-01T00:00:00.000Z`)
const dateForDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`)

interface RoomLoreItem {
    label: string
    value: string
    detail: string
    amountMinor?: string
}

const SERVER_CALENDAR_PLACEHOLDER = new Date(0)

export function HistoryStats({ state, now }: { state: RoomState; now?: Date }) {
    const t = useTranslations('room.history')
    const locale = useLocale()
    // The server does not know the viewer's time zone. Defer only the
    // current-calendar comparison until the browser mounts; every all-time
    // statistic remains available in the first render without a hydration
    // mismatch around UTC midnight.
    const [clientNow, setClientNow] = useState<Date | null>(null)
    useEffect(() => {
        if (now === undefined) setClientNow(new Date())
    }, [now])
    const comparisonNow = now ?? clientNow
    const stats = useMemo(
        () => roomHistoryStats(state, comparisonNow ?? SERVER_CALENDAR_PLACEHOLDER),
        [comparisonNow, state]
    )
    const months = useMemo(() => recentRoomMonths(stats.monthlyTotals), [stats.monthlyTotals])
    const monthToDate = stats.monthToDateComparison
    const maxMonthAmount = months.reduce((max, month) => {
        const amount = BigInt(month.amountMinor)
        return amount > max ? amount : max
    }, 0n)

    const monthLabel = (month: string, long = false) =>
        new Intl.DateTimeFormat(locale, {
            month: long ? 'long' : 'short',
            year: long ? 'numeric' : '2-digit',
            timeZone: 'UTC',
        }).format(dateForMonth(month))
    const dayLabel = (day: string) =>
        new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(dateForDay(day))

    const membersById = new Map(state.members.map((member) => [member.id, member]))
    const namesFor = (memberIds: readonly string[]) =>
        new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' }).format(
            memberIds.map((memberId) => {
                const member = membersById.get(memberId)
                if (!member) return t('unknownMember')
                return member.removedAt ? t('formerName', { name: member.name }) : member.name
            })
        )

    const expenseById = new Map(state.expenses.map((expense) => [expense.id, expense]))
    const expenseName = (expenseId: string) => {
        const expense = expenseById.get(expenseId)
        if (!expense) return t('unknownExpense')
        return expense.description.trim() || dayLabel(expense.date.slice(0, 10))
    }

    const categoryLabel = (category: string) =>
        knownCategories.has(category) ? t(`categories.${categoryKey[category as ExpenseCategoryId]}`) : category

    const percentOfTotal = (amountMinor: string) => {
        const total = BigInt(stats.totalMinor)
        return total === 0n ? '0' : ((BigInt(amountMinor) * 100n + total / 2n) / total).toString()
    }

    const monthComparison = (() => {
        if (monthToDate.kind === 'no-spend') return t('mtdNoSpend')
        if (monthToDate.kind === 'new-spend') return t('mtdNewSpend')
        if (monthToDate.kind === 'unchanged') return t('mtdSame')
        return t(monthToDate.kind === 'increase' ? 'mtdMore' : 'mtdLess', {
            percent: monthToDate.percentChange?.replace(/^-/, '') ?? '0',
        })
    })()

    const lore: RoomLoreItem[] = [
        stats.topCategory
            ? {
                  label: t('topCategory'),
                  value: categoryLabel(stats.topCategory.category),
                  detail: t('categoryDetail', { count: stats.topCategory.expenseCount }),
              }
            : null,
        stats.mostReactedExpense && stats.mostReactedExpense.reactionCount >= 5
            ? {
                  label: t('crowdFavorite'),
                  value: expenseName(stats.mostReactedExpense.expenseId),
                  detail: t('reactionDetail', { count: stats.mostReactedExpense.reactionCount }),
              }
            : null,
        stats.mostCommunalExpense && stats.mostCommunalExpense.participantCount >= 3
            ? {
                  label: t('sharedTable'),
                  value: expenseName(stats.mostCommunalExpense.expenseId),
                  detail: t('sharedTableDetail', { count: stats.mostCommunalExpense.participantCount }),
              }
            : null,
        stats.distinctCurrencies.length > 1
            ? {
                  label: t('currencyPassport'),
                  value: stats.distinctCurrencies.join(' · '),
                  detail: t('currencyDetail', { count: stats.distinctCurrencies.length }),
              }
            : null,
    ].filter((item): item is RoomLoreItem => item !== null)

    return (
        <section aria-labelledby="history-stats-title" className="flex flex-col gap-4" data-testid="history-stats">
            <div>
                <h2 id="history-stats-title" className="text-h8 uppercase tracking-wide text-grey-1">
                    {t('statsTitle')}
                </h2>
                <p className="mt-1 text-sm text-grey-1">{t('statsIntro')}</p>
            </div>

            {stats.expenseCount === 0 && (
                <div className="rounded-sm border border-n-1 bg-white p-4 text-sm text-grey-1">{t('statsEmpty')}</div>
            )}

            {stats.expenseCount > 0 && comparisonNow !== null && (
                <dl className="grid grid-cols-2 gap-2">
                    <div className="rounded-sm border border-n-1 bg-primary-3 p-3">
                        <dt className="text-h10 uppercase tracking-wide text-grey-1">{t('totalSpent')}</dt>
                        <dd className="mt-1 min-w-0 text-h5">
                            <Money minor={stats.totalMinor} currency={state.room.currency} density="overview" />
                        </dd>
                    </div>
                    <div className="rounded-sm border border-n-1 bg-white p-3">
                        <dt className="text-h10 uppercase tracking-wide text-grey-1">{t('averageExpense')}</dt>
                        <dd className="mt-1 min-w-0 text-h5">
                            {stats.averageExpenseMinor === null ? (
                                <span aria-label={t('notAvailable')}>—</span>
                            ) : (
                                <Money
                                    minor={stats.averageExpenseMinor}
                                    currency={state.room.currency}
                                    density="overview"
                                />
                            )}
                        </dd>
                    </div>
                    <div className="rounded-sm border border-n-1 bg-white p-3">
                        <dt className="text-h10 uppercase tracking-wide text-grey-1">{t('expenses')}</dt>
                        <dd className="mt-1 text-h5 tabular-nums">{stats.expenseCount}</dd>
                    </div>
                    <div className="rounded-sm border border-n-1 bg-white p-3">
                        <dt className="text-h10 uppercase tracking-wide text-grey-1">{t('people')}</dt>
                        <dd className="mt-1 text-h5 tabular-nums">{state.members.length}</dd>
                    </div>
                </dl>
            )}

            {state.members.length > 1 && stats.largestAllocatedShareByMember && stats.frontedMostByMember && (
                <div className="grid gap-2 min-[380px]:grid-cols-2">
                    <article className="rounded-sm border border-n-1 bg-secondary-6 p-3">
                        <p className="text-h10 uppercase tracking-wide text-grey-1">{t('largestShare')}</p>
                        <p className="mt-1 break-words text-h7">
                            {namesFor(stats.largestAllocatedShareByMember.memberIds)}
                        </p>
                        <p className="mt-1 text-sm font-bold">
                            <Money
                                minor={stats.largestAllocatedShareByMember.amountMinor}
                                currency={state.room.currency}
                                density="overview"
                            />
                        </p>
                        <p className="mt-1 text-xs text-grey-1">
                            {t('ofRoomSpend', {
                                percent: percentOfTotal(stats.largestAllocatedShareByMember.amountMinor),
                            })}
                        </p>
                    </article>
                    <article className="rounded-sm border border-n-1 bg-green-2 p-3">
                        <p className="text-h10 uppercase tracking-wide text-grey-1">{t('frontedMost')}</p>
                        <p className="mt-1 break-words text-h7">{namesFor(stats.frontedMostByMember.memberIds)}</p>
                        <p className="mt-1 text-sm font-bold">
                            <Money
                                minor={stats.frontedMostByMember.amountMinor}
                                currency={state.room.currency}
                                density="overview"
                            />
                        </p>
                        <p className="mt-1 text-xs text-grey-1">
                            {t('ofRoomSpend', { percent: percentOfTotal(stats.frontedMostByMember.amountMinor) })}
                        </p>
                    </article>
                    <p className="text-xs text-grey-1 min-[380px]:col-span-2">{t('spendRolesHint')}</p>
                </div>
            )}

            {stats.expenseCount > 0 && (
                <article className="rounded-sm border border-n-1 bg-white p-3">
                    <h3 className="text-h8 uppercase tracking-wide">{t('monthOverMonth')}</h3>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-sm bg-primary-3 p-3">
                            <p className="text-h10 uppercase tracking-wide text-grey-1">
                                {monthLabel(monthToDate.current.month, true)}
                            </p>
                            <p className="mt-1 text-h6">
                                <Money
                                    minor={monthToDate.current.amountMinor}
                                    currency={state.room.currency}
                                    density="overview"
                                />
                            </p>
                            <p className="mt-1 text-xs text-grey-1">
                                {t('throughDay', { day: monthToDate.current.throughDay })}
                            </p>
                        </div>
                        <div className="rounded-sm bg-grey-3 p-3">
                            <p className="text-h10 uppercase tracking-wide text-grey-1">
                                {monthLabel(monthToDate.previous.month, true)}
                            </p>
                            <p className="mt-1 text-h6">
                                <Money
                                    minor={monthToDate.previous.amountMinor}
                                    currency={state.room.currency}
                                    density="overview"
                                />
                            </p>
                            <p className="mt-1 text-xs text-grey-1">
                                {t('throughDay', { day: monthToDate.previous.throughDay })}
                            </p>
                        </div>
                    </div>
                    <p className="mt-3 text-sm font-bold">{monthComparison}</p>
                    <h4 className="mt-5 text-h10 uppercase tracking-wide text-grey-1">{t('recentMonths')}</h4>
                    <ol className="mt-3 flex flex-col gap-3">
                        {months.map((month) => {
                            const amount = BigInt(month.amountMinor)
                            const width =
                                amount === 0n || maxMonthAmount === 0n
                                    ? 0
                                    : Math.max(2, Number((amount * 100n) / maxMonthAmount))
                            return (
                                <li key={month.month}>
                                    <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                                        <span>{monthLabel(month.month)}</span>
                                        <span className="font-bold">
                                            <Money
                                                minor={month.amountMinor}
                                                currency={state.room.currency}
                                                density="overview"
                                            />
                                        </span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-grey-2" aria-hidden="true">
                                        <div
                                            className="h-full rounded-full bg-primary-1"
                                            style={{ width: `${width}%` }}
                                        />
                                    </div>
                                </li>
                            )
                        })}
                    </ol>
                </article>
            )}

            {lore.length > 0 && (
                <div>
                    <h3 className="text-h8 uppercase tracking-wide text-grey-1">{t('roomLore')}</h3>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {lore.map((item) => (
                            <article
                                key={`${item.label}:${item.value}`}
                                className="rounded-sm border border-n-1 bg-white p-3"
                            >
                                <p className="text-h10 uppercase tracking-wide text-grey-1">{item.label}</p>
                                <p className="mt-1 break-words text-h7">{item.value}</p>
                                <p className="mt-1 text-xs text-grey-1">
                                    {item.amountMinor !== undefined && (
                                        <>
                                            <Money
                                                minor={item.amountMinor}
                                                currency={state.room.currency}
                                                density="overview"
                                            />{' '}
                                            ·{' '}
                                        </>
                                    )}
                                    {item.detail}
                                </p>
                            </article>
                        ))}
                    </div>
                </div>
            )}
        </section>
    )
}
