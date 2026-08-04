import type { ApiMember, CurrencyInfo, ImportedExpenseInput, ImportMemberMapping } from '@/lib/api-types'
import { canPrice } from '@/lib/currency-rules'
import { currencyInfo } from '@/lib/money'

/** `null` means this source person will be added atomically with the import. */
export interface ExistingRoomMemberDraft {
    sourceName: string
    memberId: string | null
    newMemberName: string
}

export type ExistingRoomMappingProblem =
    | 'empty-new-name'
    | 'duplicate-existing-member'
    | 'missing-existing-member'
    | 'duplicate-new-name'
    | 'new-name-already-exists'

const nameKey = (name: string): string => name.trim().toLowerCase()

/** Distinct source currencies that cannot be converted into the fixed target
 *  room currency. `canPrice` checks identity first, so an unrated catalog code
 *  such as KPW remains valid when both the source row and room use KPW. */
export function unsupportedImportCurrencies(
    expenses: readonly Pick<ImportedExpenseInput, 'currencyCode'>[],
    roomCurrency: string,
    currencies?: readonly CurrencyInfo[]
): string[] {
    const target = currencyInfo(roomCurrency, currencies)
    return [...new Set(expenses.map((expense) => expense.currencyCode))].filter(
        (source) => !canPrice(currencyInfo(source, currencies), target)
    )
}

/**
 * Exact display-name matches are useful enough to suggest and strict enough not to guess.
 * Everything else is visibly proposed as a new roster entry for the person importing to review.
 */
export function initialExistingRoomMemberDrafts(
    sourceNames: readonly string[],
    members: readonly ApiMember[]
): ExistingRoomMemberDraft[] {
    const memberByName = new Map<string, ApiMember>()
    const ambiguousNames = new Set<string>()
    for (const member of members) {
        const key = nameKey(member.name)
        if (memberByName.has(key)) ambiguousNames.add(key)
        else memberByName.set(key, member)
    }

    const used = new Set<string>()
    return sourceNames.map((sourceName) => {
        const key = nameKey(sourceName)
        const exact = ambiguousNames.has(key) ? undefined : memberByName.get(key)
        if (exact && !used.has(exact.id)) {
            used.add(exact.id)
            return { sourceName, memberId: exact.id, newMemberName: sourceName.trim() }
        }
        return { sourceName, memberId: null, newMemberName: sourceName.trim() }
    })
}

/** One actionable problem at a time, in the same order the mapping rows appear. */
export function existingRoomMappingProblem(
    drafts: readonly ExistingRoomMemberDraft[],
    members: readonly ApiMember[]
): ExistingRoomMappingProblem | null {
    const selected = drafts.flatMap((draft) => (draft.memberId ? [draft.memberId] : []))
    const currentMemberIds = new Set(members.map((member) => member.id))
    if (selected.some((memberId) => !currentMemberIds.has(memberId))) return 'missing-existing-member'
    if (new Set(selected).size !== selected.length) return 'duplicate-existing-member'

    const additions = drafts.filter((draft) => draft.memberId === null)
    if (additions.some((draft) => draft.newMemberName.trim() === '')) return 'empty-new-name'

    const existingNames = new Set(members.map((member) => nameKey(member.name)))
    if (additions.some((draft) => existingNames.has(nameKey(draft.newMemberName)))) return 'new-name-already-exists'

    const newNames = additions.map((draft) => nameKey(draft.newMemberName))
    if (new Set(newNames).size !== newNames.length) return 'duplicate-new-name'

    return null
}

export function importMemberMappings(drafts: readonly ExistingRoomMemberDraft[]): ImportMemberMapping[] {
    return drafts.map((draft) =>
        draft.memberId
            ? { sourceName: draft.sourceName, memberId: draft.memberId }
            : { sourceName: draft.sourceName, newMemberName: draft.newMemberName.trim() }
    )
}

export function formatImportedAt(value: string, locale: string): string {
    const instant = new Date(value)
    if (Number.isNaN(instant.getTime())) return value
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
    }).format(instant)
}
