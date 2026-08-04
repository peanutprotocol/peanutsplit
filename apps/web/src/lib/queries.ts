'use client'

/**
 * Stable query-layer public API.
 *
 * Callers import from this compatibility barrel while implementation stays
 * grouped by proven product domains. Domain modules may share only the small
 * cache-key/seeding contract in `queries/core`.
 */
export { currenciesKey, historyKey, roomKey } from './queries/core'
export {
    FALLBACK_POLL_MS,
    LIVE_POLL_MS,
    ROOM_FETCH_TIMEOUT_MS,
    useCurrencies,
    useModelStatus,
    useRoomHistory,
    useRoomState,
} from './queries/reads'
export { removedQueueSlugs, useOfflineQueueRunner } from './queries/offline'
export {
    addMemberMutationOptions,
    claimMemberMutationOptions,
    useAddMember,
    useClaimMember,
    useCreateRoom,
    useDeleteMember,
    useJoinRoom,
    useSetAvatar,
    useSetEmblem,
    useSetRoomName,
    useSetTheme,
} from './queries/members-settings'
export {
    addExpenseMutationOptions,
    catchUpExpenseMutationOptions,
    useAddExpense,
    useCatchUpExpense,
    useDeleteExpense,
    useRestoreExpense,
    useUpdateExpense,
    type ExpenseRequestRef,
    type ExpenseRequestState,
} from './queries/expenses'
export { useAddSettlement, useDeleteSettlement } from './queries/settlements'
export { useAddReaction, useRemoveReaction } from './queries/reactions'
export { useImportRoom } from './queries/import'
