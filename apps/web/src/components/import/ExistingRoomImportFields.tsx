'use client'

import { useTranslations } from 'next-intl'
import { BaseInput } from '@/components/ui/BaseInput'
import type { ApiMember, ApiRoom } from '@/lib/api-types'
import type { ExistingRoomMemberDraft } from './existing-room-mapping'

export const NEW_ROOM_MEMBER_VALUE = '__new_room_member__'

export function ExistingRoomImportCurrencyProblem({
    sourceCurrencies,
    roomCurrency,
}: {
    sourceCurrencies: readonly string[]
    roomCurrency: string
}) {
    const t = useTranslations('import.existing')
    if (sourceCurrencies.length === 0) return null

    return (
        <section
            className="rounded-sm border border-n-1 bg-primary-1 p-4"
            role="alert"
            data-testid="import-currency-unsupported"
        >
            <h2 className="text-h7">{t('currencyUnsupportedTitle')}</h2>
            <p className="mt-2 text-sm leading-5 text-n-1">
                {t('currencyUnsupportedBody', {
                    currencies: sourceCurrencies.join(', '),
                    currency: roomCurrency,
                })}
            </p>
        </section>
    )
}

export function ExistingRoomImportContext({ room }: { room: ApiRoom }) {
    const t = useTranslations('import.existing')

    return (
        <div className="flex flex-col gap-3">
            <section className="rounded-sm border border-n-1 bg-primary-3 p-4" data-testid="import-target-room">
                <p className="text-h9 uppercase tracking-wide text-grey-1">{t('targetEyebrow')}</p>
                <h2 className="mt-1 text-h6">{room.name}</h2>
                <p className="mt-2 text-sm leading-5 text-n-1">{t('targetBody')}</p>
                <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-n-1/30 pt-3 text-sm">
                    <span className="text-grey-1">{t('currencyLabel')}</span>
                    <strong data-testid="import-target-currency">{room.currency}</strong>
                </div>
            </section>

            <section className="bg-yellow-1 rounded-sm border border-n-1 p-4" data-testid="import-repeat-warning">
                <h2 className="text-h7">{t('repeatTitle')}</h2>
                <p className="mt-2 text-sm leading-5 text-n-1">{t('repeatBody')}</p>
            </section>
        </div>
    )
}

interface ExistingRoomImportFieldsProps {
    roomName: string
    members: readonly ApiMember[]
    drafts: readonly ExistingRoomMemberDraft[]
    onChange: (index: number, next: ExistingRoomMemberDraft) => void
    problem: string | null
}

export function ExistingRoomImportFields({
    roomName,
    members,
    drafts,
    onChange,
    problem,
}: ExistingRoomImportFieldsProps) {
    const t = useTranslations('import.existing')
    const selectedIds = new Set(drafts.flatMap((draft) => (draft.memberId ? [draft.memberId] : [])))

    return (
        <fieldset className="flex flex-col gap-3" data-testid="import-member-mappings">
            <legend className="text-h8 uppercase tracking-wide text-grey-1">{t('membersTitle')}</legend>
            <p className="text-sm leading-5 text-grey-1">{t('membersBody', { room: roomName })}</p>

            {drafts.map((draft, index) => (
                <div
                    key={draft.sourceName}
                    className="rounded-sm border border-n-1 bg-white p-3"
                    data-testid="import-member-mapping"
                    data-member={draft.sourceName}
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="min-w-0">
                            <span className="text-h10 uppercase tracking-wide text-grey-1">{t('sourceLabel')}</span>
                            <p className="mt-1 truncate text-sm font-bold text-n-1">{draft.sourceName}</p>
                        </div>

                        <label className="flex min-w-0 flex-col gap-1">
                            <span className="text-h10 uppercase tracking-wide text-grey-1">
                                {t('targetLabel', { room: roomName })}
                            </span>
                            <select
                                value={draft.memberId ?? NEW_ROOM_MEMBER_VALUE}
                                onChange={(event) => {
                                    const memberId = event.target.value
                                    onChange(index, {
                                        ...draft,
                                        memberId: memberId === NEW_ROOM_MEMBER_VALUE ? null : memberId,
                                    })
                                }}
                                aria-label={t('memberTargetLabel', { name: draft.sourceName })}
                                className="h-10 min-w-0 rounded-sm border border-n-1 bg-white px-2 text-base font-bold text-n-1 md:text-sm"
                                data-testid="import-member-target"
                                data-member={draft.sourceName}
                            >
                                {members.map((member) => (
                                    <option
                                        key={member.id}
                                        value={member.id}
                                        disabled={member.id !== draft.memberId && selectedIds.has(member.id)}
                                    >
                                        {member.name}
                                    </option>
                                ))}
                                <option value={NEW_ROOM_MEMBER_VALUE}>{t('addNew')}</option>
                            </select>
                        </label>
                    </div>

                    {draft.memberId === null && (
                        <label className="mt-3 flex flex-col gap-1">
                            <span className="text-h10 uppercase tracking-wide text-grey-1">{t('newNameLabel')}</span>
                            <BaseInput
                                variant="sm"
                                value={draft.newMemberName}
                                maxLength={80}
                                onChange={(event) => onChange(index, { ...draft, newMemberName: event.target.value })}
                                aria-label={t('newNameAria', { name: draft.sourceName })}
                                data-testid="import-new-member-name"
                                data-member={draft.sourceName}
                            />
                            <span className="text-xs leading-4 text-grey-1">{t('atomicAddition')}</span>
                        </label>
                    )}
                </div>
            ))}

            {problem && (
                <p role="alert" className="text-sm font-bold text-error" data-testid="import-mapping-error">
                    {problem}
                </p>
            )}
        </fieldset>
    )
}
