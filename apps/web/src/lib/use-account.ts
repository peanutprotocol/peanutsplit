'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { AccountSummary } from './api-types'
import { accountsEnabled } from './flags'

/**
 * The signed-in account, if there is one. Deliberately boring: an account in
 * Split owns nothing and unlocks nothing, so this is only ever read to decide
 * between "save your rooms" and "signed in as ana@…".
 */
export const accountKey = ['account'] as const

export function useAccount() {
    return useQuery<AccountSummary | null>({
        queryKey: accountKey,
        queryFn: ({ signal }) => api.account.me(signal),
        // Not just a rendering guard: with the flag off this must not fire a
        // request at all, or every landing-page visit hits an endpoint that
        // exists to answer `null`.
        enabled: accountsEnabled(),
        // An hour. Only signing in or out changes the answer, and both write the
        // cache directly — the global focus refetch would be a request per
        // tab-switch for a value that cannot have moved.
        staleTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        // 401 is the answer, not a failure to retry through.
        retry: false,
    })
}

export function useRequestLink() {
    return useMutation({ mutationFn: (email: string) => api.account.requestLink(email) })
}

/**
 * Signing out drops the session cookie and nothing else. The rooms stay on the
 * device — they were never the account's to take away.
 */
export function useSignOut() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => api.account.logout(),
        onSuccess: () => queryClient.setQueryData(accountKey, null),
    })
}
