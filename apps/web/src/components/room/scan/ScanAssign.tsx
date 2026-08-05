'use client'

/**
 * Step 3 of 3 — who had what.
 *
 * The whole feature earns its keep here. Tapping avatars under a line item is the
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
 *
 * Rows are deletable HERE as well as on the review screen, and that is not
 * duplication for its own sake. A line the model invented — the loyalty-card
 * footer read as a 9.90 item, the same round ordered twice — is not obvious
 * while you are reading a list of words and numbers; it becomes obvious the
 * moment nobody's avatar belongs on it. Making the user carry that discovery back
 * a screen is how "I can't delete the wrong item" happens, and the unassigned
 * counter then blocks the submit on a line they never wanted.
 */

import { useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
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
    const locale = useLocale()
    const feedback = useFeedback()
    const itemListRef = useRef<HTMLUListElement>(null)
    const emptyStateRef = useRef<HTMLParagraphElement>(null)

    const memberIds = members.map((member) => member.id)
    const unassigned = unassignedItems(state, decimals, locale)
    const totals = memberTotals(state, decimals, locale)
    const assignedTotal = assignedTotalMinor(state, decimals, locale)
    const canApply = unassigned.length === 0 && BigInt(assignedTotal) > 0n

    return (
        <div className="flex flex-col gap-5">
            <header className="flex flex-col gap-1">
                <h2 className="text-h5">{t('assignTitle')}</h2>
                <p className="text-sm text-grey-1">{t('assignBody')}</p>
            </header>

            <ul ref={itemListRef} className="flex flex-col gap-3">
                {state.items.map((item, index) => {
                    const assignees = state.assignments[item.id] ?? []
                    const isEveryone = memberIds.length > 0 && assignees.length === memberIds.length
                    const needsSomeone = assignees.length === 0 && BigInt(itemMinor(item, decimals, locale)) > 0n
                    const itemName = item.label.trim()
                    const itemContext = itemName
                        ? t('itemContext', { number: index + 1, item: itemName })
                        : t('itemNumber', { number: index + 1 })
                    return (
                        <li
                            key={item.id}
                            data-testid="scan-assign-row"
                            className={cn(
                                'flex flex-col gap-2 rounded-sm border border-n-1 bg-white p-3',
                                needsSomeone && 'border-dashed bg-error-1'
                            )}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate text-h8">
                                    {item.label || t('itemPlaceholder')}
                                    {item.quantity && item.quantity > 1 && (
                                        <span className="text-grey-1"> ×{item.quantity}</span>
                                    )}
                                </span>
                                <Money
                                    minor={itemMinor(item, decimals, locale)}
                                    currency={state.currency}
                                    catalog={currencies}
                                    className="shrink-0 text-h8"
                                />
                                {/* No confirm. Nothing has been written yet — this is a
                                    draft on the way to a form — and the item is one tap
                                    back on the review screen if it was a mistake. A
                                    dialog here would cost every real deletion two taps
                                    to protect against an undoable one. */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        dispatch({ type: 'remove-item', itemId: item.id })
                                        feedback('tick')
                                        requestAnimationFrame(() => {
                                            const remaining = itemListRef.current?.querySelectorAll<HTMLButtonElement>(
                                                '[data-testid="scan-item-remove"]'
                                            )
                                            const next = remaining?.[Math.min(index, remaining.length - 1)]
                                            const focusTarget = next ?? emptyStateRef.current
                                            focusTarget?.focus()
                                        })
                                    }}
                                    aria-label={t('removeItemFor', { item: itemContext })}
                                    data-testid="scan-item-remove"
                                    className="-my-2 flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white"
                                >
                                    <Icon name="trash" size={16} />
                                </button>
                            </div>

                            <div
                                role="group"
                                aria-label={t('assignmentGroup', { item: itemContext })}
                                className="flex flex-wrap gap-2"
                            >
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
                                            aria-label={t('assignMemberToItem', {
                                                member: member.name,
                                                item: itemContext,
                                            })}
                                            data-testid="scan-assignee-chip"
                                            data-member={member.name}
                                            className={cn(
                                                'flex min-h-11 items-center gap-2 rounded-sm border border-n-1 py-2 pl-2 pr-3 text-h8 transition-all duration-100',
                                                on
                                                    ? 'shadow-4 bg-primary-1'
                                                    : 'bg-white active:translate-x-[2px] active:translate-y-[2px]'
                                            )}
                                        >
                                            <MemberAvatar
                                                name={member.name}
                                                avatar={member.avatar}
                                                palette={member.avatarPalette}
                                                size={22}
                                            />
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
                                    aria-label={t('assignEveryoneToItem', { item: itemContext })}
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

            {/* Deleting the last row is legal — the model can hallucinate a whole
                receipt — and an empty screen with a dead button on it says nothing
                about why. */}
            {state.items.length === 0 && (
                <p
                    ref={emptyStateRef}
                    role="status"
                    tabIndex={-1}
                    data-testid="scan-no-items"
                    className="text-sm text-grey-1"
                >
                    {t('noItems')}
                </p>
            )}

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
                                <MemberAvatar
                                    name={member.name}
                                    avatar={member.avatar}
                                    palette={member.avatarPalette}
                                    size={22}
                                />
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
