import { describe, expect, it } from 'vitest'
import { expenseDrawerWorkflowReducer as reduce, initialExpenseDrawerWorkflowState } from './workflow-state'

describe('expense drawer workflow state', () => {
    it('resets every ephemeral branch in one open transition', () => {
        const file = { name: 'receipt.jpg' } as File
        const dirty = {
            ...initialExpenseDrawerWorkflowState(),
            submitted: true,
            error: 'save failed',
            scannerOpen: true,
            scanFile: file,
            payerDraft: { open: true, name: 'Bea', error: 'payer failed' },
            participantDraft: { open: true, name: 'Carla', error: 'participant failed' },
            fieldRepairNotice: 'fields repaired',
            editor: 'date' as const,
            advancedOptionsOpen: false,
            confirmingDelete: true,
        }

        expect(reduce(dirty, { type: 'reset-on-open', advancedOptionsOpen: true })).toEqual(
            initialExpenseDrawerWorkflowState(true)
        )
    })

    it('owns payer and participant draft lifecycles without crossing them', () => {
        let state = initialExpenseDrawerWorkflowState()
        state = reduce(state, { type: 'payer-draft-opened' })
        state = reduce(state, { type: 'payer-name-changed', name: 'Bea' })
        state = reduce(state, { type: 'editor-opened', editor: 'payer' })
        state = reduce(state, { type: 'participant-draft-opened' })
        state = reduce(state, { type: 'participant-name-changed', name: 'Carla' })
        state = reduce(state, { type: 'participant-failed', error: 'Already added' })

        expect(state.payerDraft).toEqual({ open: true, name: 'Bea', error: null })
        expect(state.participantDraft).toEqual({ open: true, name: 'Carla', error: 'Already added' })

        state = reduce(state, { type: 'participant-draft-closed' })
        expect(state.participantDraft).toEqual({ open: false, name: '', error: null })
        expect(state.payerDraft.name).toBe('Bea')

        state = reduce(state, { type: 'payer-draft-closed' })
        expect(state.editor).toBe('payer')
        expect(state.payerDraft).toEqual({ open: false, name: '', error: null })

        state = reduce(state, { type: 'payer-draft-opened' })
        state = reduce(state, { type: 'payer-committed' })
        expect(state.editor).toBeNull()
    })

    it('clears stale submission feedback when a scan is applied', () => {
        const file = { name: 'receipt.jpg' } as File
        let state = initialExpenseDrawerWorkflowState()
        state = reduce(state, { type: 'submission-attempted' })
        state = reduce(state, { type: 'error-set', error: 'Old validation failure' })
        state = reduce(state, { type: 'scan-selected', file })

        expect(state).toMatchObject({ scannerOpen: true, scanFile: file })

        expect(reduce(state, { type: 'scan-applied' })).toMatchObject({
            submitted: false,
            error: null,
            scannerOpen: false,
            scanFile: null,
        })
    })

    it('opens camera without a file and clears the whole session on cancel', () => {
        const file = { name: 'receipt.jpg' } as File
        let state = reduce(initialExpenseDrawerWorkflowState(), { type: 'scan-opened' })
        expect(state).toMatchObject({ scannerOpen: true, scanFile: null })

        state = reduce(state, { type: 'scan-selected', file })
        expect(state).toMatchObject({ scannerOpen: true, scanFile: file })

        expect(reduce(state, { type: 'scan-cancelled' })).toMatchObject({ scannerOpen: false, scanFile: null })
    })

    it('keeps editor, advanced disclosure and delete confirmation transitions explicit', () => {
        let state = initialExpenseDrawerWorkflowState()
        state = reduce(state, { type: 'editor-toggled', editor: 'split' })
        state = reduce(state, { type: 'advanced-options-opened' })
        state = reduce(state, { type: 'delete-confirmation-started' })

        expect(state).toMatchObject({ editor: 'split', advancedOptionsOpen: true, confirmingDelete: true })
        expect(reduce(state, { type: 'editor-toggled', editor: 'split' }).editor).toBeNull()
        expect(reduce(state, { type: 'delete-confirmation-cancelled' }).confirmingDelete).toBe(false)
    })
})
