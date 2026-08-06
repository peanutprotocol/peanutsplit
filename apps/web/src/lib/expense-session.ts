/**
 * A JoinGate can temporarily own the screen after a member token rotates. A
 * draft that was already open stays logically open (so its reset-on-open effect
 * does not erase money fields), while an initial unjoined visit waits to seed
 * the form until the newly claimed member is known.
 */
export const expenseSessionShouldOpen = (requested: boolean, needsJoin: boolean, started: boolean): boolean =>
    requested && (!needsJoin || started)
