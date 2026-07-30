/**
 * A row that carries its own label but no control — the shape every state that cannot be acted on
 * takes.
 *
 * The label is the whole point. "Blocked in your browser settings." on its own, sitting between
 * "Add someone" and "You", is a sentence with no subject: blocked WHAT. The control's label was the
 * only thing naming what these lines are about, so when the line replaces the control it has to
 * keep the name.
 */
export function StateRow({ label, line, testId }: { label: string; line: string; testId?: string }) {
    return (
        <div className="min-h-11 rounded-sm border border-n-1 bg-white p-3" data-testid={testId}>
            <span className="block text-h8">{label}</span>
            <span className="block text-sm text-grey-1">{line}</span>
        </div>
    )
}
