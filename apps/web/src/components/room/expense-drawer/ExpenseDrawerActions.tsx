'use client'

import type { RefObject } from 'react'
import { Button } from '@/components/ui/Button'
import { DrawerActions } from '@/components/ui/DrawerLayout'
import { SlideToConfirm } from '@/components/ui/SlideToConfirm'

interface ExpenseDrawerActionsProps {
    editing: boolean
    pending: boolean
    disabled: boolean
    deleting: boolean
    confirmingDelete: boolean
    deleteTriggerRef: RefObject<HTMLButtonElement | null>
    labels: {
        primary: string
        confirmDelete: string
        slideDelete: string
        deleting: string
        cancelDelete: string
        delete: string
    }
    onSave: () => void
    onStartDelete: () => void
    onConfirmDelete: () => Promise<boolean>
    onCancelDelete: () => void
}

/** Stable action zone for create and edit modes. */
export function ExpenseDrawerActions({
    editing,
    pending,
    disabled,
    deleting,
    confirmingDelete,
    deleteTriggerRef,
    labels,
    onSave,
    onStartDelete,
    onConfirmDelete,
    onCancelDelete,
}: ExpenseDrawerActionsProps) {
    return (
        <DrawerActions className="border-t border-n-1 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <Button
                variant="primary"
                shadowSize="4"
                onClick={onSave}
                loading={pending}
                disabled={disabled}
                className="justify-center text-h6"
                data-testid="save-expense"
            >
                {labels.primary}
            </Button>
            {editing &&
                (confirmingDelete ? (
                    <div
                        className="flex flex-col gap-2 border-t border-dashed border-n-1 pt-3"
                        data-testid="delete-expense-confirm"
                    >
                        <p id="delete-expense-warning" role="alert" className="text-sm text-n-1">
                            {labels.confirmDelete}
                        </p>
                        <div className="flex flex-col gap-2">
                            <SlideToConfirm
                                autoFocus
                                label={labels.slideDelete}
                                loadingLabel={labels.deleting}
                                onConfirm={onConfirmDelete}
                                onCancel={onCancelDelete}
                                loading={deleting}
                                aria-describedby="delete-expense-warning"
                                data-testid="confirm-delete-expense"
                            />
                            <Button
                                variant="stroke"
                                onClick={onCancelDelete}
                                className="justify-center"
                                data-testid="cancel-delete-expense"
                            >
                                {labels.cancelDelete}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        ref={deleteTriggerRef}
                        variant="stroke"
                        icon="trash"
                        onClick={onStartDelete}
                        className="justify-center"
                        data-testid="delete-expense"
                    >
                        {labels.delete}
                    </Button>
                ))}
        </DrawerActions>
    )
}
