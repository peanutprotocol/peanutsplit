'use client'

/**
 * Step 3 of 3 — who had what.
 *
 * The whole feature earns its keep here. Tapping faces under a line item is the
 * gesture the product is actually for; everything before this screen is
 * plumbing to get to it.
 *
 * Two rules the layout enforces rather than explains:
 *
 * - **Multi-assign splits that item equally.** Two people on a bottle of wine is
 *   half each, and the odd cent walks the assignee list one minor unit at a time
 *   (`memberTotals`) — the same rounding the server does, so a scanned split and
 *   a typed one land on the same numbers.
 * - **An unassigned item blocks the submit.** Money on the receipt that belongs
 *   to nobody would silently leave the split, and "the total came out wrong and
 *   nobody knows why" is the single worst outcome this flow can produce. The
 *   counter is loud and the button is disabled until it reads zero.
 */

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import type { ApiMember, CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { useFeedback } from '@/lib/use-settings'
import { MemberAvatar } from '../MemberAvatar'
import { Money } from '../Money'
import {
    assignedTotalMinor,
    itemMinor,
    memberTotals,
    unassignedItems,
    type ScanAction,
    type ScanState,
} from './scan-state'

interface ScanAssignProps {
    state: ScanState
    dispatch: (action: ScanAction) => void
    members: readonly ApiMember[]
    decimals: number
    currencies: readonly CurrencyInfo[]
    onBack: () => void
    onApply: () => void
}

export function ScanAssign({ state, dispatch, members, decimals, currencies, onBack, onApply }: ScanAssignProps) {
    const t = useTranslations('room.scan')
    const feedback = useFeedback()

    const memberIds = members.map((member) => member.id)
    const unassigned = unassignedItems(state, decimals)
    const totals = memberTotals(state, decimals)
    const assignedTotal = assignedTotalMinor(state, decimals)
    const canApply = unassigned.length === 0 && BigInt(assignedTotal) > 0n

    return (
        <div className="flex flex-col gap-5">
            <header className="flex flex-col gap-1">
                <h2 className="text-h5">{t('assignTitle')}</h2>
                <p className="text-sm text-grey-1">{t('assignBody')}</p>
            </header>

            <ul className="flex flex-col gap-3">
                {state.items.map((item) => {
                    const assignees = state.assignments[item.id] ?? []
                    const isEveryone = memberIds.length > 0 && assignees.length === memberIds.length
                    const needsSomeone = assignees.length === 0 && BigInt(itemMinor(item, decimals)) > 0n
                    return (
                        <li
                            key={item.id}
                            data-testid="scan-assign-row"
                            className={cn(
                                'flex flex-col gap-2 rounded-sm border border-n-1 bg-white p-3',
                                needsSomeone && 'border-dashed bg-error-1'
                            )}
                        >
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="min-w-0 flex-1 truncate text-h8">
                                    {item.label || t('itemPlaceholder')}
                                    {item.quantity && item.quantity > 1 && (
                                        <span className="text-grey-1"> ×{item.quantity}</span>
                                    )}
                                </span>
                                <Money
                                    minor={itemMinor(item, decimals)}
                                    currency={state.currency}
                                    catalog={currencies}
                                    className="shrink-0 text-h8"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {members.map((member) => {
                                    const on = assignees.includes(member.id)
                                    return (
                                        <button
                                            key={member.id}
                                            type="button"
                                            onClick={() => {
                                                dispatch({
                                                    type: 'toggle-assignee',
                                                    itemId: item.id,
                                                    memberId: member.id,
                                                })
                                                feedback('tick')
                                            }}
                                            aria-pressed={on}
                                            data-testid="scan-assignee-chip"
                                            data-member={member.name}
                                            className={cn(
                                                'flex min-h-11 items-center gap-2 rounded-sm border border-n-1 py-2 pl-2 pr-3 text-h8 transition-all duration-100',
                                                on
                                                    ? 'shadow-4 bg-primary-1'
                                                    : 'bg-white active:translate-x-[2px] active:translate-y-[2px]'
                                            )}
                                        >
                                            <MemberAvatar name={member.name} size={22} />
                                            {member.name}
                                        </button>
                                    )
                                })}

                                {/* The shortcut most rows want: the shared starter, the
                                    bottle, the tip. Tapping it again clears the row. */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        dispatch({ type: 'assign-everyone', itemId: item.id, memberIds })
                                        feedback('tick')
                                    }}
                                    aria-pressed={isEveryone}
                                    data-testid="scan-everyone"
                                    className={cn(
                                        'flex min-h-11 items-center gap-2 rounded-sm border border-dashed border-n-1 px-3 py-2 text-h8 transition-all duration-100',
                                        isEveryone ? 'bg-primary-3' : 'bg-white'
                                    )}
                                >
                                    <Icon name="users" size={14} />
                                    {t('everyone')}
                                </button>
                            </div>
                        </li>
                    )
                })}
            </ul>

            {unassigned.length > 0 && (
                <p role="alert" data-testid="scan-unassigned" className="text-sm font-bold text-error">
                    {t('unassigned', { count: unassigned.length })}
                </p>
            )}

            <div className="flex flex-col gap-1 rounded-sm border border-n-1 bg-primary-3 p-3 text-h8">
                {members
                    .filter((member) => totals[member.id])
                    .map((member) => (
                        <div key={member.id} className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                                <MemberAvatar name={member.name} size={22} />
                                <span className="truncate">{member.name}</span>
                            </span>
                            <Money minor={totals[member.id]} currency={state.currency} catalog={currencies} />
                        </div>
                    ))}
                <div className="mt-1 flex items-center justify-between border-t border-n-1 pt-2">
                    <span>{t('assignedTotal')}</span>
                    <Money minor={assignedTotal} currency={state.currency} catalog={currencies} />
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <Button
                    variant="primary"
                    shadowSize="4"
                    onClick={onApply}
                    disabled={!canApply}
                    className="justify-center text-h6"
                    data-testid="scan-apply"
                >
                    {t('apply')}
                </Button>
                <Button variant="stroke" icon="arrow-left" onClick={onBack} className="justify-center">
                    {t('back')}
                </Button>
            </div>
        </div>
    )
}
