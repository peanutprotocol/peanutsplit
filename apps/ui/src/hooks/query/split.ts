// React Query hooks for split rooms. Mutations return the full room snapshot,
// so we seed the cache from the response — balances update instantly with no
// second round-trip. A light refetch interval gives the "people are joining
// live" feel without websockets.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
	getRoom,
	getCurrencies,
	getRate,
	createRoom,
	addMember,
	addExpense,
	updateExpense,
	deleteExpense,
	restoreExpense,
	recordSettlement,
	deleteSettlement,
} from '@/services/split'
import type { RoomState, NewExpenseInput, NewSettlementInput } from '@/services/split.types'

const roomKey = (slug: string) => ['split-room', slug] as const

export function useCurrenciesQuery() {
	return useQuery({ queryKey: ['split-currencies'], queryFn: getCurrencies, staleTime: Infinity, gcTime: Infinity })
}

/** Indicative rate for a live foreign→base estimate while entering an expense. */
export function useRateQuery(from: string, to: string, enabled: boolean) {
	return useQuery({
		queryKey: ['split-rate', from, to],
		queryFn: () => getRate(from, to),
		enabled: enabled && from !== to,
		staleTime: 5 * 60 * 1000,
	})
}

export function useRoomQuery(slug: string) {
	return useQuery({
		queryKey: roomKey(slug),
		queryFn: () => getRoom(slug),
		refetchOnWindowFocus: true,
		refetchInterval: 8000,
		refetchIntervalInBackground: false,
		staleTime: 2000,
		retry: 1,
	})
}

// Cancel before seeding: a poll fired before the mutation can land after it and
// overwrite the fresh snapshot with pre-mutation state — which is how a deleted
// expense reappeared while its undo snackbar was still on screen.
function seedCache(qc: ReturnType<typeof useQueryClient>, slug: string) {
	return async (state: RoomState) => {
		await qc.cancelQueries({ queryKey: roomKey(slug) })
		qc.setQueryData(roomKey(slug), state)
	}
}

export function useCreateRoom() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (input: { title?: string; baseCurrency: string }) => createRoom(input),
		onSuccess: (state) => seedCache(qc, state.slug)(state),
	})
}

export function useAddMember(slug: string) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (displayName: string) => addMember(slug, displayName),
		onSuccess: (res) => seedCache(qc, slug)(res.room),
	})
}

export function useAddExpense(slug: string) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (input: NewExpenseInput) => addExpense(slug, input),
		onSuccess: seedCache(qc, slug),
	})
}

export function useUpdateExpense(slug: string) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (args: { expenseId: string; input: NewExpenseInput }) =>
			updateExpense(slug, args.expenseId, args.input),
		onSuccess: seedCache(qc, slug),
	})
}

export function useDeleteExpense(slug: string) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (expenseId: string) => deleteExpense(slug, expenseId),
		onSuccess: seedCache(qc, slug),
	})
}

export function useRestoreExpense(slug: string) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (expenseId: string) => restoreExpense(slug, expenseId),
		onSuccess: seedCache(qc, slug),
	})
}

export function useRecordSettlement(slug: string) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (input: NewSettlementInput) => recordSettlement(slug, input),
		onSuccess: seedCache(qc, slug),
	})
}

export function useDeleteSettlement(slug: string) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (settlementId: string) => deleteSettlement(slug, settlementId),
		onSuccess: seedCache(qc, slug),
	})
}
