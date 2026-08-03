'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { BTN_SMALL } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import type { ApiMember } from '@/lib/api-types'
import { useErrorMessage } from '@/lib/error-messages'
import { useDeleteMember } from '@/lib/queries'
import { useFeedback } from '@/lib/use-settings'

/**
 * Taking a name back off the roster — and saying why, for the names that stay.
 *
 * Every person gets this control, including the ones that cannot go. A name with
 * a paid round behind it used to render with nothing beside it at all, which
 * reads as a button that failed to draw rather than as the rule it is; now it
 * opens the same panel and reads the rule out.
 *
 * The panel takes a line of its own under the row instead of floating over it:
 * both callers sit inside a drawer that clips its own scroll area, so a popover
 * would be cut in half. Both therefore lay their row out with `flex-wrap`.
 *
 * The server hard-deletes, and there is no restore route, so the confirmation
 * IS the safety net — `member-removal-design.md` specifies a 10-second Undo and
 * a "Removed people" section, and both need `removedAt` to be honoured first.
 */
export function RemovePerson({ slug, member, token }: { slug: string; member: ApiMember; token?: string | null }) {
    const t = useTranslations('room.people')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const deleteMember = useDeleteMember(slug, token)
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const removable = member.canRemove === true

    const toggle = () => {
        setError(null)
        setOpen((previous) => !previous)
        feedback('tick')
    }

    const remove = async () => {
        if (deleteMember.isPending) return
        setError(null)
        try {
            // The row unmounts with the member on success, so there is nothing
            // to close afterwards.
            await deleteMember.mutateAsync(member.id)
            feedback('thunk')
        } catch (err) {
            feedback('error', { haptic: 'error' })
            setError(errorMessage(err, t('removeFailed')))
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-label={removable ? t('remove', { name: member.name }) : t('blocked', { name: member.name })}
                data-testid={removable ? 'remove-person' : 'remove-blocked'}
                className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-sm border border-n-1',
                    // Solid box for the one that acts, dashed for the one that
                    // only explains — the same distinction the dashed link row
                    // and the dashed "add someone" row already make.
                    removable ? 'bg-white' : 'border-dashed'
                )}
            >
                <Icon name="x" size={16} />
            </button>

            {open && (
                <div className="basis-full px-1 pt-2" data-testid="remove-panel">
                    {removable ? (
                        <div className="flex flex-col gap-2">
                            <p className="text-sm font-bold">{t('confirmTitle', { name: member.name })}</p>
                            <p className="text-sm leading-5 text-grey-1">{t('confirmBody')}</p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="stroke"
                                    size="small"
                                    onClick={() => void remove()}
                                    loading={deleteMember.isPending}
                                    className={cn(BTN_SMALL, 'w-auto justify-center')}
                                    data-testid="remove-person-confirm"
                                >
                                    {t('confirm')}
                                </Button>
                                <Button
                                    variant="stroke"
                                    size="small"
                                    onClick={() => setOpen(false)}
                                    className={cn(BTN_SMALL, 'w-auto justify-center')}
                                    data-testid="remove-person-cancel"
                                >
                                    {t('cancel')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <p role="status" className="text-sm leading-5">
                            {t('blockedReason', { name: member.name })}
                        </p>
                    )}
                    {error && (
                        <p role="alert" className="pt-2 text-sm font-bold text-error">
                            {error}
                        </p>
                    )}
                </div>
            )}
        </>
    )
}
