export type ExpenseDrawerEditor = 'payer' | 'split' | 'date' | null

export interface ExpenseDrawerWorkflowState {
    submitted: boolean
    error: string | null
    scannerOpen: boolean
    scanFile: File | null
    payerDraft: {
        open: boolean
        name: string
        error: string | null
    }
    participantDraft: {
        open: boolean
        name: string
        error: string | null
    }
    fieldRepairNotice: string | null
    editor: ExpenseDrawerEditor
    advancedOptionsOpen: boolean
    confirmingDelete: boolean
}

export type ExpenseDrawerWorkflowAction =
    | { type: 'reset-on-open'; advancedOptionsOpen: boolean }
    | { type: 'editor-opened'; editor: Exclude<ExpenseDrawerEditor, null> }
    | { type: 'editor-toggled'; editor: Exclude<ExpenseDrawerEditor, null> }
    | { type: 'editor-closed' }
    | { type: 'advanced-options-opened' }
    | { type: 'advanced-options-toggled' }
    | { type: 'payer-draft-opened' }
    | { type: 'payer-name-changed'; name: string }
    | { type: 'payer-draft-closed' }
    | { type: 'payer-committed' }
    | { type: 'participant-draft-opened' }
    | { type: 'participant-name-changed'; name: string }
    | { type: 'participant-error-cleared' }
    | { type: 'participant-failed'; error: string }
    | { type: 'participant-draft-closed' }
    | { type: 'scan-opened' }
    | { type: 'scan-selected'; file: File }
    | { type: 'scan-cancelled' }
    | { type: 'scan-applied' }
    | { type: 'submission-attempted' }
    | { type: 'form-field-edited' }
    | { type: 'error-cleared' }
    | { type: 'error-set'; error: string }
    | { type: 'amount-normalised'; notice: string }
    | { type: 'fields-repaired'; notice: string; clearSubmitted: boolean }
    | { type: 'delete-confirmation-started' }
    | { type: 'delete-confirmation-cancelled' }

export const initialExpenseDrawerWorkflowState = (advancedOptionsOpen = false): ExpenseDrawerWorkflowState => ({
    submitted: false,
    error: null,
    scannerOpen: false,
    scanFile: null,
    payerDraft: { open: false, name: '', error: null },
    participantDraft: { open: false, name: '', error: null },
    fieldRepairNotice: null,
    editor: null,
    advancedOptionsOpen,
    confirmingDelete: false,
})

/**
 * Ephemeral drawer workflow only. Expense values and money arithmetic stay in
 * their existing form seam; server mutation state stays in react-query.
 */
export function expenseDrawerWorkflowReducer(
    state: ExpenseDrawerWorkflowState,
    action: ExpenseDrawerWorkflowAction
): ExpenseDrawerWorkflowState {
    switch (action.type) {
        case 'reset-on-open':
            return initialExpenseDrawerWorkflowState(action.advancedOptionsOpen)
        case 'editor-opened':
            return { ...state, editor: action.editor }
        case 'editor-toggled':
            return { ...state, editor: state.editor === action.editor ? null : action.editor }
        case 'editor-closed':
            return { ...state, editor: null }
        case 'advanced-options-opened':
            return { ...state, advancedOptionsOpen: true }
        case 'advanced-options-toggled':
            return { ...state, advancedOptionsOpen: !state.advancedOptionsOpen }
        case 'payer-draft-opened':
            return { ...state, payerDraft: { ...state.payerDraft, open: true, error: null } }
        case 'payer-name-changed':
            return { ...state, payerDraft: { ...state.payerDraft, name: action.name } }
        case 'payer-draft-closed':
            return { ...state, payerDraft: { open: false, name: '', error: null } }
        case 'payer-committed':
            return { ...state, payerDraft: { open: false, name: '', error: null }, editor: null }
        case 'participant-draft-opened':
            return { ...state, participantDraft: { ...state.participantDraft, open: true, error: null } }
        case 'participant-name-changed':
            return { ...state, participantDraft: { ...state.participantDraft, name: action.name } }
        case 'participant-error-cleared':
            return { ...state, participantDraft: { ...state.participantDraft, error: null } }
        case 'participant-failed':
            return { ...state, participantDraft: { ...state.participantDraft, error: action.error } }
        case 'participant-draft-closed':
            return { ...state, participantDraft: { open: false, name: '', error: null } }
        case 'scan-opened':
            return { ...state, scannerOpen: true, scanFile: null }
        case 'scan-selected':
            return { ...state, scannerOpen: true, scanFile: action.file }
        case 'scan-cancelled':
            return { ...state, scannerOpen: false, scanFile: null }
        case 'scan-applied':
            return { ...state, scannerOpen: false, scanFile: null, submitted: false, error: null }
        case 'submission-attempted':
            return { ...state, submitted: true }
        case 'form-field-edited':
            return { ...state, submitted: false, fieldRepairNotice: null }
        case 'error-cleared':
            return { ...state, error: null }
        case 'error-set':
            return { ...state, error: action.error }
        case 'amount-normalised':
            return { ...state, submitted: false, fieldRepairNotice: action.notice }
        case 'fields-repaired':
            return {
                ...state,
                submitted: action.clearSubmitted ? false : state.submitted,
                fieldRepairNotice: action.notice,
            }
        case 'delete-confirmation-started':
            return { ...state, confirmingDelete: true }
        case 'delete-confirmation-cancelled':
            return { ...state, confirmingDelete: false }
    }
}
