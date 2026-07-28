'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { track } from '@/lib/analytics'
import { useErrorMessage } from '@/lib/error-messages'
import { accountsEnabled } from '@/lib/flags'
import { useAccount, useRequestLink, useSignOut } from '@/lib/use-account'

/**
 * The one account surface in the product: an email box and a button.
 *
 * Framing matters more than the code here. This is never a signup wall and
 * never blocks anything — it is "save your rooms and open them from any
 * device", offered next to a room someone is already using. Nobody is asked who
 * they are before they are allowed to split a dinner.
 *
 * `heading` is optional because the two call sites differ: the room's settings
 * drawer needs the section label to belong to this component (so a panel that
 * renders nothing does not leave a title hanging over empty space), while the
 * landing sheet already says it in the drawer title.
 */
export function AccountPanel({ heading }: { heading?: string }) {
    const t = useTranslations('account')
    const errorMessage = useErrorMessage()
    const { data: account, isPending } = useAccount()
    const requestLink = useRequestLink()
    const signOut = useSignOut()
    const [email, setEmail] = useState('')
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Belt and braces — every call site is already flag-gated, and this is the
    // component that must never appear by accident.
    if (!accountsEnabled()) return null
    // Nothing at all rather than flashing the signed-out form at someone who is
    // signed in; it resolves in one request.
    if (isPending) return null

    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        const address = email.trim()
        if (!address) return
        setError(null)
        try {
            await requestLink.mutateAsync(address)
            // No properties. An address is the one thing this flow handles and
            // the last thing analytics should ever see.
            track('account_link_requested')
            setSent(true)
        } catch (err) {
            setError(errorMessage(err, t('failed')))
        }
    }

    return (
        <div className="mt-2 flex flex-col gap-2">
            {heading && <span className="text-h8 uppercase tracking-wide text-grey-1">{heading}</span>}

            {account ? (
                <div className="flex flex-col gap-2 rounded-sm border border-n-1 bg-white p-3">
                    <p className="text-h8">
                        {account.email ? t('signedInAs', { email: account.email }) : t('signedIn')}
                    </p>
                    <p className="text-sm text-grey-1">{t('signedInHint')}</p>
                    <Button
                        variant="stroke"
                        size="medium"
                        className="mt-1 justify-center"
                        loading={signOut.isPending}
                        onClick={() => signOut.mutate()}
                        data-testid="account-sign-out"
                    >
                        {t('signOut')}
                    </Button>
                </div>
            ) : sent ? (
                <div className="flex flex-col gap-2 rounded-sm border border-n-1 bg-white p-3">
                    <p className="text-h8">{t('sentTitle')}</p>
                    {/* Identical whether or not that address has an account: the
                        API answers the same way for both, and a UI that told
                        them apart would hand back exactly what the API refuses
                        to disclose. */}
                    <p className="text-sm text-grey-1">{t('sentBody')}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setSent(false)
                            setEmail('')
                        }}
                        className="self-start text-sm text-black underline"
                    >
                        {t('sentAgain')}
                    </button>
                </div>
            ) : (
                <form onSubmit={submit} className="flex flex-col gap-2">
                    <p className="text-sm text-grey-1">{t('blurb')}</p>
                    <BaseInput
                        type="email"
                        variant="sm"
                        required
                        autoComplete="email"
                        inputMode="email"
                        aria-label={t('emailLabel')}
                        placeholder={t('emailPlaceholder')}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        data-testid="account-email"
                    />
                    {error && (
                        <p role="alert" className="text-sm font-bold text-error">
                            {error}
                        </p>
                    )}
                    <Button
                        type="submit"
                        variant="stroke"
                        size="medium"
                        className="justify-center"
                        loading={requestLink.isPending}
                        data-testid="account-submit"
                    >
                        {t('submit')}
                    </Button>
                </form>
            )}
        </div>
    )
}
